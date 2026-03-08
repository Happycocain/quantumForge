"""
ForgeQuant-Lab FastAPI Backend

All heavy computation (yfinance downloads, backtests, optimization) runs in
background tasks via asyncio.to_thread to keep the event loop responsive.

Run status lifecycle: queued → running → completed | error
Results are stored in MongoDB and polled by the frontend.
"""
import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

# ── Path setup ──────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(ROOT_DIR / ".env")

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── MongoDB ──────────────────────────────────────────────────────────────────
_mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _mongo_client[os.environ["DB_NAME"]]

# ── In-memory panel cache ────────────────────────────────────────────────────
_panel_cache: Dict[str, Any] = {}
_cache_ts: Dict[str, datetime] = {}
CACHE_TTL = 3600  # seconds


# ── Pydantic models ──────────────────────────────────────────────────────────
class BacktestRequest(BaseModel):
    tickers: List[str] = ["SPY", "QQQ", "AAPL", "MSFT"]
    start_date: str = "2014-01-01"
    end_date: str = "2024-01-01"
    params: Dict[str, Any] = Field(
        default_factory=lambda: {
            "sma_short": 50,
            "sma_long": 200,
            "roc_window": 20,
            "atr_mult": 2.0,
            "vol_target": 0.12,
            "max_leverage": 1.0,
        }
    )
    frankenstein_check: bool = True


class OptimizeRequest(BaseModel):
    tickers: List[str] = ["SPY", "QQQ", "AAPL", "MSFT"]
    start_date: str = "2014-01-01"
    end_date: str = "2024-01-01"
    quick_mode: bool = True
    train_frac: float = 0.70


class WalkForwardRequest(BaseModel):
    tickers: List[str] = ["SPY", "QQQ", "AAPL", "MSFT"]
    start_date: str = "2014-01-01"
    end_date: str = "2024-01-01"
    params: Dict[str, Any] = Field(
        default_factory=lambda: {
            "sma_short": 50,
            "sma_long": 200,
            "roc_window": 20,
            "atr_mult": 2.0,
            "vol_target": 0.12,
            "max_leverage": 1.0,
        }
    )
    train_years: int = 3
    test_years: int = 1


class SummarizeRequest(BaseModel):
    run_id: str
    summary_type: str = "backtest"  # backtest | optimize | frankenstein


# ── Cache helpers ────────────────────────────────────────────────────────────
def _cache_key(tickers, start, end) -> str:
    return f"{','.join(sorted(tickers))}|{start}|{end}"


def _get_panel(key: str):
    if key in _panel_cache:
        age = (datetime.now() - _cache_ts[key]).total_seconds()
        if age < CACHE_TTL:
            return _panel_cache[key]
    return None


def _set_panel(key: str, panel) -> None:
    _panel_cache[key] = panel
    _cache_ts[key] = datetime.now()


# ── DB helpers ───────────────────────────────────────────────────────────────
async def _store_run(run_id: str, mode: str, config: dict) -> None:
    await db.runs.insert_one(
        {
            "run_id": run_id,
            "mode": mode,
            "config": config,
            "status": "queued",
            "result": None,
            "error": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
        }
    )


async def _update_run(
    run_id: str,
    status: str,
    result: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    update: dict = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if result is not None:
        update["result"] = result
    if error is not None:
        update["error"] = error
    await db.runs.update_one({"run_id": run_id}, {"$set": update})


# ── Sync worker functions (run in thread pool) ───────────────────────────────
def _load_panel(tickers, start, end):
    from core.data_loader import load_panel
    return load_panel(tickers, start, end)


def _backtest_worker(panel, params, frankenstein_check):
    from core.backtest import run_backtest
    from core.metrics import split_and_compute
    from core.utils import series_to_records

    result = run_backtest(panel, params, frankenstein_check=frankenstein_check)
    metrics = split_and_compute(
        result["equity_curve"],
        result["strategy_returns"],
        result["trades"],
        result["positions"],
    )
    eq = series_to_records(result["equity_curve"], "value")
    dd = series_to_records(result["drawdown_series"], "drawdown")
    step = max(1, len(eq) // 500)
    return {
        "metrics": metrics,
        "equity_curve": eq[::step],
        "drawdown_series": dd[::step],
        "trades": result["trades"][:100],
        "anomaly_events": result["anomaly_events"],
    }


def _optimize_worker(panel, quick_mode, train_frac):
    from research.optimizer import run_optimization
    from research.robustness import check_robustness

    opt = run_optimization(panel, quick_mode=quick_mode, train_frac=train_frac)
    rob = check_robustness(opt["all_results"])
    return {
        "n_combinations": opt["n_combinations"],
        "n_valid": opt["n_valid"],
        "top_configs": opt["top_configs"][:10],
        "all_results": opt["ranked_results"][:50],
        "robustness": rob,
        "grid_used": opt["grid_used"],
    }


def _walkforward_worker(panel, params, train_years, test_years):
    from research.walk_forward import run_walk_forward
    return run_walk_forward(panel, params, train_years, test_years)


# ── Background task coroutines ───────────────────────────────────────────────
async def _bt_task(run_id: str, req: BacktestRequest):
    await _update_run(run_id, "running")
    try:
        key = _cache_key(req.tickers, req.start_date, req.end_date)
        panel = _get_panel(key)
        if panel is None:
            panel = await asyncio.to_thread(_load_panel, req.tickers, req.start_date, req.end_date)
            _set_panel(key, panel)
        result = await asyncio.to_thread(_backtest_worker, panel, req.params, req.frankenstein_check)
        await _update_run(run_id, "completed", result)
    except Exception as exc:
        logger.error(f"Backtest {run_id} failed: {exc}", exc_info=True)
        await _update_run(run_id, "error", error=str(exc))


async def _opt_task(run_id: str, req: OptimizeRequest):
    await _update_run(run_id, "running")
    try:
        key = _cache_key(req.tickers, req.start_date, req.end_date)
        panel = _get_panel(key)
        if panel is None:
            panel = await asyncio.to_thread(_load_panel, req.tickers, req.start_date, req.end_date)
            _set_panel(key, panel)
        result = await asyncio.to_thread(_optimize_worker, panel, req.quick_mode, req.train_frac)
        await _update_run(run_id, "completed", result)
    except Exception as exc:
        logger.error(f"Optimize {run_id} failed: {exc}", exc_info=True)
        await _update_run(run_id, "error", error=str(exc))


async def _wf_task(run_id: str, req: WalkForwardRequest):
    await _update_run(run_id, "running")
    try:
        key = _cache_key(req.tickers, req.start_date, req.end_date)
        panel = _get_panel(key)
        if panel is None:
            panel = await asyncio.to_thread(_load_panel, req.tickers, req.start_date, req.end_date)
            _set_panel(key, panel)
        result = await asyncio.to_thread(
            _walkforward_worker, panel, req.params, req.train_years, req.test_years
        )
        await _update_run(run_id, "completed", result)
    except Exception as exc:
        logger.error(f"WalkForward {run_id} failed: {exc}", exc_info=True)
        await _update_run(run_id, "error", error=str(exc))


# ── AI Summary ───────────────────────────────────────────────────────────────
async def _ai_summary(run: dict, summary_type: str) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    key = os.environ.get("EMERGENT_LLM_KEY", "")
    chat = LlmChat(
        api_key=key,
        session_id=f"fq-{run['run_id']}-{summary_type}",
        system_message=(
            "You are a quantitative finance research assistant. Provide concise, "
            "professional insights about backtesting results. Always end with an "
            "EDUCATIONAL DISCLAIMER that this is not investment advice. "
            "Keep responses under 300 words."
        ),
    ).with_model("openai", "gpt-4o")

    result_data = run.get("result") or {}

    if summary_type == "backtest":
        m = result_data.get("metrics", {}).get("overall", {})
        tr = result_data.get("metrics", {}).get("train", {})
        te = result_data.get("metrics", {}).get("test", {})
        n_ev = len(result_data.get("anomaly_events", []))
        prompt = (
            f"Analyze this Trend+Momentum backtest:\n"
            f"Overall: CAGR={m.get('cagr',0):.1%}, Sharpe={m.get('sharpe',0):.2f}, "
            f"MaxDD={m.get('max_drawdown',0):.1%}, WinRate={m.get('win_rate',0):.1%}\n"
            f"Train Sharpe={tr.get('sharpe',0):.2f} | Test Sharpe={te.get('sharpe',0):.2f}\n"
            f"Trades={m.get('total_trades',0)}, Avg hold={m.get('avg_holding_days',0):.0f}d, "
            f"Frankenstein events={n_ev}\n\n"
            f"Assess: quality, overfitting risk, red flags, market regime dependency."
        )

    elif summary_type == "optimize":
        top = result_data.get("top_configs", [{}])[:3]
        rob = result_data.get("robustness", {})
        top_lines = "\n".join(
            f"  #{i+1}: SMA({c['params'].get('sma_short')}/{c['params'].get('sma_long')}) "
            f"ROC({c['params'].get('roc_window')}) Vol({c['params'].get('vol_target')}) "
            f"→ TestSharpe={c.get('test_sharpe',0):.2f}, CAGR={c.get('test_cagr',0):.1%}"
            for i, c in enumerate(top)
        )
        prompt = (
            f"Analyze these optimization results ({result_data.get('n_combinations',0)} combos tested):\n"
            f"{top_lines}\n"
            f"Robustness: {rob.get('summary','N/A')}\n\n"
            f"Discuss: parameter stability, overfit risk, how to interpret these results."
        )

    elif summary_type == "frankenstein":
        events = result_data.get("anomaly_events", [])
        lvl = {1: 0, 2: 0, 3: 0}
        types = set()
        for e in events:
            lvl[e.get("level", 1)] += 1
            for t in e.get("triggers", []):
                types.add(t.get("type", ""))
        prompt = (
            f"Analyze {len(events)} Frankenstein anomaly events detected:\n"
            f"L1(reduce 25%)={lvl[1]}, L2(reduce 50%)={lvl[2]}, L3(go to cash)={lvl[3]}\n"
            f"Trigger types: {', '.join(types) or 'none'}\n\n"
            f"Explain in plain English: what conditions triggered these, "
            f"effectiveness of the safety mechanism, false positive vs false negative risks."
        )
    else:
        prompt = f"Summarize this quant research run briefly: {str(result_data)[:400]}"

    response = await chat.send_message(UserMessage(text=prompt))
    return response


# ── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(title="ForgeQuant-Lab API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "ForgeQuant-Lab API v1.0", "status": "ok"}


@api_router.post("/backtest/run")
async def start_backtest(req: BacktestRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())[:8]
    await _store_run(run_id, "baseline", req.model_dump())
    background_tasks.add_task(_bt_task, run_id, req)
    return {"run_id": run_id, "status": "queued", "mode": "baseline"}


@api_router.post("/optimize/run")
async def start_optimize(req: OptimizeRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())[:8]
    await _store_run(run_id, "optimize", req.model_dump())
    background_tasks.add_task(_opt_task, run_id, req)
    return {"run_id": run_id, "status": "queued", "mode": "optimize"}


@api_router.post("/walkforward/run")
async def start_walkforward(req: WalkForwardRequest, background_tasks: BackgroundTasks):
    run_id = str(uuid.uuid4())[:8]
    await _store_run(run_id, "walkforward", req.model_dump())
    background_tasks.add_task(_wf_task, run_id, req)
    return {"run_id": run_id, "status": "queued", "mode": "walkforward"}


@api_router.get("/runs/{run_id}")
async def get_run(run_id: str):
    run = await db.runs.find_one({"run_id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@api_router.get("/runs")
async def list_runs(limit: int = 20):
    runs = await db.runs.find({}, {"_id": 0, "result": 0}).sort("created_at", -1).to_list(limit)
    return runs


@api_router.post("/ai/summarize")
async def summarize_run(req: SummarizeRequest):
    run = await db.runs.find_one({"run_id": req.run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run["status"] != "completed":
        raise HTTPException(status_code=400, detail="Run not completed yet")
    try:
        summary = await _ai_summary(run, req.summary_type)
        await db.ai_summaries.update_one(
            {"run_id": req.run_id, "type": req.summary_type},
            {"$set": {"summary": summary, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return {"run_id": req.run_id, "summary_type": req.summary_type, "summary": summary}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI summary failed: {exc}")


@api_router.get("/ai/summary/{run_id}")
async def get_cached_summary(run_id: str, summary_type: str = "backtest"):
    doc = await db.ai_summaries.find_one({"run_id": run_id, "type": summary_type}, {"_id": 0})
    return doc or {"summary": None}


# ── Wire up ──────────────────────────────────────────────────────────────────
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    _mongo_client.close()

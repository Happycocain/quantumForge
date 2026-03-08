"""
ForgeQuant-Lab CLI

EDUCATIONAL USE ONLY – NOT INVESTMENT ADVICE.

Usage examples
--------------
python main.py                                    # baseline on defaults
python main.py --mode optimize --quick            # fast param sweep
python main.py --mode walkforward
python main.py --mode optimize+walkforward --tickers SPY QQQ --start 2016-01-01 --end 2023-01-01
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Ensure backend root is in path
sys.path.insert(0, str(Path(__file__).parent))

from core.data_loader import DEFAULT_END, DEFAULT_START, DEFAULT_TICKERS, load_panel
from core.backtest import run_backtest
from core.metrics import split_and_compute
from core.plots import plot_drawdown, plot_equity_curve, plot_optimizer_comparison
from core.utils import make_serializable
from research.optimizer import run_optimization
from research.robustness import check_robustness
from research.walk_forward import run_walk_forward


DEFAULT_PARAMS = {
    "sma_short": 50,
    "sma_long": 200,
    "roc_window": 20,
    "atr_mult": 2.0,
    "vol_target": 0.12,
    "max_leverage": 1.0,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ForgeQuant-Lab | Quantitative Research Platform (EDUCATIONAL ONLY)"
    )
    parser.add_argument(
        "--mode",
        choices=["baseline", "optimize", "walkforward", "optimize+walkforward"],
        default="baseline",
    )
    parser.add_argument("--tickers", nargs="+", default=DEFAULT_TICKERS)
    parser.add_argument("--start", default=DEFAULT_START)
    parser.add_argument("--end", default=DEFAULT_END)
    parser.add_argument("--output", default="outputs")
    parser.add_argument("--quick", action="store_true", help="Use quick (smaller) param grid")
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(args.output) / ts
    output_dir.mkdir(parents=True, exist_ok=True)

    _banner(args.mode, args.tickers, args.start, args.end, output_dir)

    print("Loading market data (yfinance)...")
    panel = load_panel(args.tickers, args.start, args.end)
    print(f"  Loaded {len(panel)} tickers\n")

    if "baseline" in args.mode:
        _run_baseline(panel, output_dir)

    if "optimize" in args.mode:
        top_configs = _run_optimize(panel, output_dir, args.quick)
    else:
        top_configs = []

    if "walkforward" in args.mode:
        _run_walkforward(panel, DEFAULT_PARAMS, output_dir)

    print(f"\n{'─'*60}")
    print(f"  Results saved to: {output_dir}")
    print(f"{'─'*60}\n")


def _banner(mode, tickers, start, end, output_dir):
    print(f"\n{'═'*60}")
    print(f"  ForgeQuant-Lab | EDUCATIONAL USE ONLY")
    print(f"  Mode   : {mode.upper()}")
    print(f"  Tickers: {', '.join(tickers)}")
    print(f"  Period : {start} → {end}")
    print(f"  Output : {output_dir}")
    print(f"{'═'*60}\n")


def _run_baseline(panel, output_dir):
    print("─── BASELINE BACKTEST ───────────────────────────────────")
    result = run_backtest(panel, DEFAULT_PARAMS)
    metrics = split_and_compute(
        result["equity_curve"],
        result["strategy_returns"],
        result["trades"],
        result["positions"],
    )
    _print_metrics(metrics)

    plot_equity_curve(result["equity_curve"], output_dir / "equity_curve.png")
    plot_drawdown(result["drawdown_series"], output_dir / "drawdown.png")

    with open(output_dir / "baseline_results.json", "w") as f:
        json.dump(
            make_serializable(
                {
                    "metrics": metrics,
                    "trades": result["trades"][:50],
                    "anomaly_events": result["anomaly_events"],
                }
            ),
            f,
            indent=2,
        )

    events = result["anomaly_events"]
    if events:
        print(f"\n  Frankenstein Events: {len(events)}")
        for e in events[:5]:
            print(f"    [{e['date']}] Level {e['level']} → {e['action']}")
            for t in e["triggers"]:
                print(f"      · {t['description']}")


def _run_optimize(panel, output_dir, quick):
    print("\n─── PARAMETER OPTIMIZATION ──────────────────────────────")
    opt = run_optimization(panel, quick_mode=quick)
    rob = check_robustness(opt["all_results"])

    print(f"  Tested {opt['n_combinations']} combinations | {opt['n_valid']} valid")
    print(f"\n  TOP 5 CONFIGS (Test Sharpe):")
    for i, cfg in enumerate(opt["top_configs"][:5]):
        p = cfg["params"]
        print(
            f"  #{i+1}  Sharpe={cfg.get('test_sharpe', 0):.3f} "
            f"CAGR={cfg.get('test_cagr', 0):.1%} "
            f"MaxDD={cfg.get('test_max_dd', 0):.1%}  "
            f"SMA({p.get('sma_short')}/{p.get('sma_long')}) "
            f"ROC({p.get('roc_window')}) Vol({p.get('vol_target')})"
        )
    print(f"\n  Robustness: {rob['summary']}")

    if opt["top_configs"]:
        plot_optimizer_comparison(opt["top_configs"], output_dir / "optimizer_top5.png")

    with open(output_dir / "optimization_results.json", "w") as f:
        json.dump(
            make_serializable(
                {
                    "top_configs": opt["top_configs"][:10],
                    "n_combinations": opt["n_combinations"],
                    "robustness": rob,
                }
            ),
            f,
            indent=2,
        )
    return opt["top_configs"]


def _run_walkforward(panel, params, output_dir):
    print("\n─── WALK-FORWARD ANALYSIS ───────────────────────────────")
    wf = run_walk_forward(panel, params)
    agg = wf.get("aggregate", {})

    print(f"  Windows : {agg.get('n_windows', 0)}")
    print(f"  Avg OOS Sharpe : {agg.get('avg_sharpe', 0):.3f}")
    print(f"  Avg OOS CAGR   : {agg.get('avg_cagr', 0):.1%}")
    print(f"  % Positive     : {agg.get('pct_positive_windows', 0):.0%}")

    with open(output_dir / "walkforward_results.json", "w") as f:
        json.dump(make_serializable(wf), f, indent=2)


def _print_metrics(metrics: dict) -> None:
    print(f"\n  {'Metric':<22} {'Overall':>10} {'Train':>10} {'Test':>10}")
    print(f"  {'─'*54}")
    fields = [
        ("cagr", ".1%"),
        ("sharpe", ".3f"),
        ("sortino", ".3f"),
        ("max_drawdown", ".1%"),
        ("win_rate", ".1%"),
        ("total_trades", "d"),
        ("avg_holding_days", ".1f"),
    ]
    for key, fmt in fields:
        ov = metrics.get("overall", {}).get(key, "-")
        tr = metrics.get("train", {}).get(key, "-")
        te = metrics.get("test", {}).get(key, "-")

        def _f(v):
            if isinstance(v, (int, float)) and fmt != "d":
                return f"{v:{fmt}}"
            elif isinstance(v, int) and fmt == "d":
                return str(v)
            return str(v)

        print(f"  {key:<22} {_f(ov):>10} {_f(tr):>10} {_f(te):>10}")
    print()


if __name__ == "__main__":
    main()

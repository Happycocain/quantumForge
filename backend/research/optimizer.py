"""
AI Self-Optimizing Research Mode: Parameter sweep with train/test evaluation.

Parameter grids
---------------
Quick mode (default for API): 24 combinations
Full mode (CLI --full-grid):  162 combinations

Ranking: test Sharpe (primary) → test max_drawdown (secondary) → total_trades (lower is better)
Overfitting score = max(0, train_sharpe − test_sharpe)
"""
import itertools
import logging
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

QUICK_GRID: Dict[str, List] = {
    "sma_short": [40, 50, 60],
    "sma_long": [150, 200],
    "roc_window": [10, 20],
    "atr_mult": [2.0],
    "vol_target": [0.10, 0.12],
}

FULL_GRID: Dict[str, List] = {
    "sma_short": [40, 50, 60],
    "sma_long": [150, 200],
    "roc_window": [10, 20, 40],
    "atr_mult": [1.5, 2.0, 2.5],
    "vol_target": [0.10, 0.12, 0.15],
}


def run_optimization(
    panel: Dict[str, pd.DataFrame],
    param_grid: Optional[Dict] = None,
    train_frac: float = 0.70,
    top_n: int = 10,
    quick_mode: bool = True,
) -> Dict[str, Any]:
    """
    Run parameter sweep optimization with train/test split.

    Uses 70/30 chronological split.
    Returns ranked results, top configs, and the grid used.
    """
    from core.backtest import run_backtest
    from core.metrics import split_and_compute

    grid = param_grid or (QUICK_GRID if quick_mode else FULL_GRID)
    keys = list(grid.keys())
    combinations = list(itertools.product(*[grid[k] for k in keys]))

    results: List[Dict] = []
    for combo in combinations:
        params = dict(zip(keys, combo))
        try:
            result = run_backtest(panel, params, frankenstein_check=False)
            metrics = split_and_compute(
                result["equity_curve"],
                result["strategy_returns"],
                result["trades"],
                result["positions"],
                train_frac=train_frac,
            )
            results.append(
                {
                    "params": params,
                    "overall_sharpe": metrics["overall"]["sharpe"],
                    "overall_cagr": metrics["overall"]["cagr"],
                    "overall_max_dd": metrics["overall"]["max_drawdown"],
                    "train_sharpe": metrics["train"]["sharpe"],
                    "test_sharpe": metrics["test"]["sharpe"],
                    "train_cagr": metrics["train"]["cagr"],
                    "test_cagr": metrics["test"]["cagr"],
                    "test_max_dd": metrics["test"]["max_drawdown"],
                    "total_trades": metrics["overall"]["total_trades"],
                    "split_date": metrics["split_date"],
                    "overfit_score": max(
                        0.0,
                        (metrics["train"]["sharpe"] or 0) - (metrics["test"]["sharpe"] or 0),
                    ),
                }
            )
        except Exception as exc:
            logger.warning(f"Param combo {params} failed: {exc}")
            results.append({"params": params, "error": str(exc), "test_sharpe": -999})

    valid = [r for r in results if "error" not in r]
    ranked = sorted(
        valid,
        key=lambda x: (
            x.get("test_sharpe", -999),
            abs(x.get("test_max_dd", -999)),       # smaller abs drawdown is better
            -(x.get("total_trades", 9999)),          # fewer trades preferred
        ),
        reverse=True,
    )

    return {
        "all_results": results,
        "ranked_results": ranked,
        "top_configs": ranked[:top_n],
        "n_combinations": len(combinations),
        "n_valid": len(valid),
        "grid_used": grid,
    }

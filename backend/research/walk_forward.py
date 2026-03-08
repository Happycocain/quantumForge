"""
Walk-Forward Analysis: Rolling train/test windows to assess OOS robustness.

Default windows: 3-year train, 1-year test, rolling by 1 year.
For 10 years of data (2014–2024), this produces ~7 OOS windows.

The OOS equity curves are stitched so that each window starts where
the previous one left off (continuous equity curve visualization).
"""
import logging
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from core.backtest import INITIAL_CAPITAL, run_backtest
from core.metrics import compute_metrics

logger = logging.getLogger(__name__)

TRAIN_YEARS_DEFAULT: int = 3
TEST_YEARS_DEFAULT: int = 1
TRADING_DAYS_PER_YEAR: int = 252


def run_walk_forward(
    panel: Dict[str, pd.DataFrame],
    params: Dict[str, Any],
    train_years: int = TRAIN_YEARS_DEFAULT,
    test_years: int = TEST_YEARS_DEFAULT,
) -> Dict[str, Any]:
    """
    Rolling walk-forward analysis.

    Parameters
    ----------
    panel       : full OHLCV panel (multi-ticker)
    params      : strategy parameters (fixed across all windows)
    train_years : training window length in years
    test_years  : out-of-sample test window length in years

    Returns
    -------
    dict with:
        oos_equity     – stitched OOS equity (list of {date, value})
        window_metrics – per-window metrics table
        aggregate      – avg Sharpe, avg CAGR, % positive windows
    """
    all_dates = sorted(list(list(panel.values())[0].index))
    n = len(all_dates)
    train_days = train_years * TRADING_DAYS_PER_YEAR
    test_days = test_years * TRADING_DAYS_PER_YEAR
    min_required = train_days + test_days

    if n < min_required:
        return {
            "oos_equity": [],
            "window_metrics": [],
            "aggregate": {"n_windows": 0},
        }

    windows = []
    i = 0
    while i + train_days + test_days <= n:
        windows.append(
            {
                "train_start": all_dates[i],
                "train_end": all_dates[i + train_days - 1],
                "test_start": all_dates[i + train_days],
                "test_end": all_dates[min(i + train_days + test_days - 1, n - 1)],
            }
        )
        i += test_days  # roll forward by 1 test period

    oos_segments: List[pd.Series] = []
    window_metrics: List[Dict] = []

    for w in windows:
        try:
            test_panel = {
                t: df.loc[w["test_start"] : w["test_end"]]
                for t, df in panel.items()
            }
            # Ensure enough data for indicators
            min_rows = max(params.get("sma_long", 200), 200) + 30
            valid_tickers = {t: df for t, df in test_panel.items() if len(df) >= min_rows}
            if not valid_tickers:
                logger.warning(f"Skipping window {w['test_start']} – insufficient data")
                continue

            result = run_backtest(valid_tickers, params, frankenstein_check=False)
            wm = compute_metrics(
                result["equity_curve"],
                result["strategy_returns"],
                result["trades"],
                result["positions"],
            )
            wm["window"] = (
                f"{w['test_start'].strftime('%Y-%m')} – {w['test_end'].strftime('%Y-%m')}"
            )
            wm["train_period"] = (
                f"{w['train_start'].strftime('%Y-%m')} – {w['train_end'].strftime('%Y-%m')}"
            )
            window_metrics.append(wm)
            oos_segments.append(result["equity_curve"])
        except Exception as exc:
            logger.warning(f"Walk-forward window failed: {exc}")

    if not oos_segments:
        return {"oos_equity": [], "window_metrics": window_metrics, "aggregate": {"n_windows": 0}}

    # Stitch OOS equity curves
    stitched: List[Dict] = []
    running = INITIAL_CAPITAL
    for seg in oos_segments:
        initial = float(seg.iloc[0])
        ratio = running / initial
        for date, val in seg.items():
            stitched.append({"date": date.strftime("%Y-%m-%d"), "value": round(float(val * ratio), 2)})
        running = stitched[-1]["value"]

    # Aggregate stats
    sharpes = [m["sharpe"] for m in window_metrics if m.get("sharpe") is not None]
    cagrs = [m["cagr"] for m in window_metrics if m.get("cagr") is not None]
    aggregate = {
        "n_windows": len(window_metrics),
        "avg_sharpe": round(float(np.mean(sharpes)), 4) if sharpes else 0.0,
        "avg_cagr": round(float(np.mean(cagrs)), 4) if cagrs else 0.0,
        "pct_positive_windows": round(
            sum(1 for c in cagrs if c > 0) / len(cagrs), 4
        ) if cagrs else 0.0,
    }

    return {
        "oos_equity": stitched,
        "window_metrics": window_metrics,
        "aggregate": aggregate,
    }

"""
Frankenstein Mode Safety Layer: Detect unstable / suspicious algorithm behavior.

Detection signals
-----------------
1. vol_shock        : realized vol > rolling median vol × 2.5
2. return_outlier   : |daily_return| > 3 × rolling std dev
3. turnover_spike   : weekly turnover > avg weekly turnover × 2.5
4. dd_acceleration  : drawdown worsening > 0.5%/day (linear slope)

Progressive response
--------------------
- 1 trigger  → Level 1 | reduce_25pct    (exposure × 0.75)
- 2 triggers → Level 2 | reduce_50pct    (exposure × 0.50)
- 3+ triggers → Level 3 | go_to_cash    (exposure = 0, 20-day cooldown)

All events are logged with timestamp, trigger details, and context metrics.
"""
from typing import Any, Dict, List

import numpy as np
import pandas as pd

COOLDOWN_DAYS: int = 20
MIN_GAP_DAYS: int = 5


def detect_anomalies(
    equity_curve: pd.Series,
    returns: pd.Series,
    positions: pd.DataFrame,
    min_gap_days: int = MIN_GAP_DAYS,
) -> List[Dict[str, Any]]:
    """
    Scan historical returns/positions for Frankenstein behavior.

    Parameters
    ----------
    equity_curve : daily portfolio value
    returns      : daily strategy returns
    positions    : daily position sizes (n_days × n_assets)
    min_gap_days : minimum days between reported events

    Returns
    -------
    List of event dicts with keys:
        date, level, action, exposure_mult, triggers, equity, drawdown_pct
    """
    rolling_vol_20 = returns.rolling(20).std() * np.sqrt(252)
    rolling_vol_med = rolling_vol_20.rolling(60).median()
    returns_std = returns.rolling(60).std()
    total_turnover = positions.diff().abs().sum(axis=1)
    weekly_turnover = total_turnover.rolling(5).sum()
    avg_weekly_turnover = weekly_turnover.rolling(60).mean()
    peak = equity_curve.expanding().max()
    dd_series = (equity_curve - peak) / peak

    events: List[Dict] = []
    last_event_idx = -min_gap_days
    cooldown = 0

    for i in range(len(returns)):
        if cooldown > 0:
            cooldown -= 1
            continue
        if i - last_event_idx < min_gap_days:
            continue

        triggers: List[Dict] = []

        # 1. Volatility shock
        rv = rolling_vol_20.iloc[i]
        rv_med = rolling_vol_med.iloc[i]
        if _valid(rv, rv_med) and rv_med > 0 and rv > rv_med * 2.5:
            triggers.append(
                {
                    "type": "vol_shock",
                    "description": f"Realized vol {rv:.1%} > 2.5× median ({rv_med:.1%})",
                    "value": round(float(rv), 4),
                }
            )

        # 2. Return outlier
        ret = returns.iloc[i]
        ret_std = returns_std.iloc[i]
        if _valid(ret, ret_std) and ret_std > 0 and abs(ret) > 3 * ret_std:
            z = abs(ret) / ret_std
            triggers.append(
                {
                    "type": "return_outlier",
                    "description": f"Daily return {ret:.1%} is {z:.1f}σ from mean",
                    "value": round(float(ret), 4),
                }
            )

        # 3. Turnover spike
        wt = weekly_turnover.iloc[i]
        awt = avg_weekly_turnover.iloc[i]
        if _valid(wt, awt) and awt > 0 and wt > awt * 2.5:
            triggers.append(
                {
                    "type": "turnover_spike",
                    "description": f"Weekly turnover {wt:.2f} vs avg {awt:.2f}",
                    "value": round(float(wt), 4),
                }
            )

        # 4. Drawdown acceleration
        if i >= 10:
            dd_slice = dd_series.iloc[i - 10 : i + 1].values
            x = np.arange(len(dd_slice))
            slope = float(np.polyfit(x, dd_slice, 1)[0])
            if slope < -0.005:
                triggers.append(
                    {
                        "type": "dd_acceleration",
                        "description": f"DD slope {slope * 100:.2f}%/day over 10 days",
                        "value": round(slope * 100, 4),
                    }
                )

        if not triggers:
            continue

        n = len(triggers)
        if n >= 3:
            level, action, exp_mult = 3, "go_to_cash", 0.0
            cooldown = COOLDOWN_DAYS
        elif n == 2:
            level, action, exp_mult = 2, "reduce_50pct", 0.5
        else:
            level, action, exp_mult = 1, "reduce_25pct", 0.75

        dd_val = dd_series.iloc[i]
        events.append(
            {
                "date": returns.index[i].strftime("%Y-%m-%d"),
                "level": level,
                "action": action,
                "exposure_mult": exp_mult,
                "triggers": triggers,
                "equity": round(float(equity_curve.iloc[i]), 2),
                "drawdown_pct": round(float(dd_val * 100), 2),
            }
        )
        last_event_idx = i

    return events


def _valid(*vals) -> bool:
    return all(v is not None and not (isinstance(v, float) and np.isnan(v)) for v in vals)

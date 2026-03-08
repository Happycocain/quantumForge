"""
Risk Engine: Volatility targeting, position sizing, drawdown guards, cost model.

Design decisions
----------------
- Volatility targeting: position_size = signal × (target_vol / realized_vol), capped at max_leverage.
- Drawdown guard is applied post-hoc as a multiplier on strategy returns:
    DD > 15% → multiply positions by 0.5
    DD > 25% → multiply positions by 0.0 (kill switch)
- Transaction costs = fee + slippage, charged on abs(position_change) per asset.
"""
from typing import Dict

import pandas as pd

FEE_RATE: float = 0.0005      # 0.05% per trade
SLIPPAGE_RATE: float = 0.0002  # 0.02% per trade
DRAWDOWN_REDUCE_1: float = 0.15
DRAWDOWN_REDUCE_2: float = 0.25


def compute_position_sizes(
    signals: pd.DataFrame,
    vols: pd.DataFrame,
    target_vol: float = 0.12,
    max_leverage: float = 1.0,
) -> pd.DataFrame:
    """
    Compute volatility-targeted position sizes.

    position_size[ticker] = signal[ticker] × (target_vol / realized_vol[ticker])
    Clipped to [0, max_leverage].
    """
    sizes = pd.DataFrame(index=signals.index, columns=signals.columns, dtype=float)
    for ticker in signals.columns:
        vol = vols[ticker].replace(0, None).ffill().bfill().clip(lower=0.01)
        raw = signals[ticker] * (target_vol / vol)
        sizes[ticker] = raw.clip(0, max_leverage)
    return sizes.fillna(0.0)


def transaction_cost_per_unit() -> float:
    """Combined cost (fee + slippage) per unit of position change."""
    return FEE_RATE + SLIPPAGE_RATE


def drawdown_guard_multiplier(dd_series: pd.Series) -> pd.Series:
    """
    Return a scalar multiplier series [0, 0.5, 1.0] for each day.
    Applied to strategy returns to simulate drawdown-triggered de-risking.
    """
    mult = pd.Series(1.0, index=dd_series.index)
    mult[dd_series < -DRAWDOWN_REDUCE_1] = 0.5
    mult[dd_series < -DRAWDOWN_REDUCE_2] = 0.0  # Kill switch overrides
    return mult

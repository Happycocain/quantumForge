"""
Trend + Momentum Strategy: High-level wrapper around core modules.

This class provides a clean interface for the strategy, suitable for both
the backtester and the optimizer.
"""
from typing import Any, Dict

import pandas as pd

from core.indicators import add_indicators
from core.signals import trend_momentum_signal

DEFAULT_PARAMS: Dict[str, Any] = {
    "sma_short": 50,
    "sma_long": 200,
    "roc_window": 20,
    "atr_mult": 2.0,
    "vol_target": 0.12,
    "max_leverage": 1.0,
}


class TrendMomentumStrategy:
    """
    Trend + Momentum Strategy.

    Entry  : SMA_short > SMA_long  AND  ROC > 0
    Exit   : SMA_short < SMA_long  OR   ROC < 0
    """

    def __init__(self, params: Dict[str, Any] = None):
        self.params = {**DEFAULT_PARAMS, **(params or {})}

    def compute_signal(self, df: pd.DataFrame) -> pd.Series:
        """Compute signal for a single ticker's OHLCV DataFrame."""
        df_ind = add_indicators(
            df,
            self.params["sma_short"],
            self.params["sma_long"],
            self.params["roc_window"],
        )
        return trend_momentum_signal(df_ind)

    def compute_portfolio_signals(self, panel: Dict[str, pd.DataFrame]) -> pd.DataFrame:
        """Compute signals for all tickers. Returns DataFrame of signals."""
        return pd.DataFrame(
            {ticker: self.compute_signal(df) for ticker, df in panel.items()}
        )

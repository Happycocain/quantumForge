"""
Indicator Engine: SMA, ROC, ATR, Rolling Volatility, Rolling Correlation.

All functions are pure (no side-effects) and return new Series/DataFrames.
"""
from typing import Dict

import numpy as np
import pandas as pd


def sma(series: pd.Series, window: int) -> pd.Series:
    """Simple Moving Average."""
    return series.rolling(window, min_periods=window).mean()


def roc(series: pd.Series, window: int) -> pd.Series:
    """Rate of Change (percentage)."""
    return series.pct_change(window) * 100


def atr(df: pd.DataFrame, window: int = 14) -> pd.Series:
    """Average True Range."""
    prev_close = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_close).abs(),
            (df["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(window, min_periods=window).mean()


def rolling_vol(series: pd.Series, window: int = 20) -> pd.Series:
    """Annualized rolling volatility of daily returns (std of returns × √252)."""
    returns = series.pct_change()
    return returns.rolling(window, min_periods=window).std() * np.sqrt(252)


def add_indicators(
    df: pd.DataFrame,
    sma_short: int = 50,
    sma_long: int = 200,
    roc_window: int = 20,
    atr_window: int = 14,
    vol_window: int = 20,
) -> pd.DataFrame:
    """Add all standard indicators to a price DataFrame. Returns a new DataFrame."""
    df = df.copy()
    df["sma_short"] = sma(df["close"], sma_short)
    df["sma_long"] = sma(df["close"], sma_long)
    df["roc"] = roc(df["close"], roc_window)
    df["atr"] = atr(df, atr_window)
    df["rolling_vol"] = rolling_vol(df["close"], vol_window)
    df["returns"] = df["close"].pct_change()
    return df


def rolling_correlations(panel: Dict[str, pd.DataFrame], window: int = 60) -> pd.DataFrame:
    """Compute rolling pairwise return correlations across all tickers."""
    closes = pd.DataFrame({t: df["close"] for t, df in panel.items()})
    returns = closes.pct_change()
    return returns.rolling(window, min_periods=window).corr()

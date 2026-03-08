"""
Data Engine: Load and clean OHLCV data via yfinance.

Notes
-----
- Prices use auto_adjust=True (split/dividend adjusted).
- Forward-fill limited to 3 consecutive missing days.
- All tickers aligned to a common date index after loading.
"""
import logging
from typing import Dict, List

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DEFAULT_TICKERS: List[str] = ["SPY", "QQQ", "AAPL", "MSFT"]
DEFAULT_START: str = "2014-01-01"
DEFAULT_END: str = "2024-01-01"


def load_ticker(ticker: str, start: str, end: str) -> pd.DataFrame:
    """
    Load OHLCV data for a single ticker.

    Returns DataFrame with lowercase columns: open, high, low, close, volume.
    Index is a DatetimeIndex of business days.
    """
    df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False, threads=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")

    # Handle multi-level columns from yfinance
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0].lower() for c in df.columns]
    else:
        df.columns = [c.lower() for c in df.columns]

    # Keep only standard OHLCV
    for col in ["open", "high", "low", "close", "volume"]:
        if col not in df.columns:
            df[col] = np.nan

    df = df[["open", "high", "low", "close", "volume"]]
    df.index = pd.to_datetime(df.index)
    df = df.dropna(subset=["close"])

    # Forward-fill price gaps (max 3 days – market holidays OK, not extended outages)
    df[["open", "high", "low", "close"]] = df[["open", "high", "low", "close"]].ffill(limit=3)
    df["volume"] = df["volume"].ffill()

    logger.info(f"Loaded {ticker}: {len(df)} rows [{df.index[0].date()} – {df.index[-1].date()}]")
    return df


def load_panel(
    tickers: List[str] = DEFAULT_TICKERS,
    start: str = DEFAULT_START,
    end: str = DEFAULT_END,
) -> Dict[str, pd.DataFrame]:
    """
    Load OHLCV for multiple tickers, aligned to a common calendar.

    Returns dict of {ticker: DataFrame}.
    """
    raw: Dict[str, pd.DataFrame] = {}
    for ticker in tickers:
        try:
            raw[ticker] = load_ticker(ticker, start, end)
        except Exception as exc:
            logger.warning(f"Skipping {ticker}: {exc}")

    if not raw:
        raise ValueError("No data loaded for any tickers")

    # Build union date index and reindex each ticker
    common_idx = raw[next(iter(raw))].index
    for df in raw.values():
        common_idx = common_idx.union(df.index)

    panel: Dict[str, pd.DataFrame] = {}
    for ticker, df in raw.items():
        df = df.reindex(common_idx)
        df[["open", "high", "low", "close"]] = df[["open", "high", "low", "close"]].ffill(limit=3)
        df = df.dropna(subset=["close"])
        panel[ticker] = df

    return panel

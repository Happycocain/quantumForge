"""
Core Backtester: Daily bars, no look-ahead bias.

Execution model
---------------
Signal[t] is computed using data available at close of day t.
The position is held from close t → close t+1, meaning the strategy
earns return[t+1] on position[t]. This is implemented by shifting signals
forward by 1 bar: position[t] = signal[t-1].

Drawdown guard is applied as a multiplier on daily returns (post-hoc
approximation suitable for research/educational use).
"""
import logging
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from core.indicators import add_indicators
from core.metrics import TRADING_DAYS
from core.risk import (
    FEE_RATE,
    SLIPPAGE_RATE,
    compute_position_sizes,
    drawdown_guard_multiplier,
)
from core.signals import trend_momentum_signal

logger = logging.getLogger(__name__)
INITIAL_CAPITAL: float = 100_000.0


def run_backtest(
    panel: Dict[str, pd.DataFrame],
    params: Dict[str, Any],
    frankenstein_check: bool = True,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Run a vectorized portfolio backtest.

    Parameters
    ----------
    panel : dict of {ticker: OHLCV DataFrame}
    params : strategy/risk config keys:
        sma_short, sma_long, roc_window, atr_mult, vol_target, max_leverage
    frankenstein_check : run anomaly detection
    seed : random seed for reproducibility

    Returns
    -------
    dict with keys:
        equity_curve, drawdown_series, positions, trades,
        anomaly_events, strategy_returns
    """
    np.random.seed(seed)

    sma_short = int(params.get("sma_short", 50))
    sma_long = int(params.get("sma_long", 200))
    roc_window = int(params.get("roc_window", 20))
    vol_target = float(params.get("vol_target", 0.12))
    max_leverage = float(params.get("max_leverage", 1.0))

    # ── Step 1: Compute indicators for each ticker ──────────────────────────
    indicators: Dict[str, pd.DataFrame] = {}
    for ticker, df in panel.items():
        if len(df) < max(sma_long, 200) + 30:
            logger.warning(f"{ticker}: insufficient rows, skipping")
            continue
        indicators[ticker] = add_indicators(df, sma_short, sma_long, roc_window)

    if not indicators:
        raise ValueError("No tickers with sufficient data for backtest")

    # ── Step 2: Align to common date index ──────────────────────────────────
    common_idx = None
    for df_ind in indicators.values():
        common_idx = df_ind.index if common_idx is None else common_idx.intersection(df_ind.index)

    tickers = list(indicators.keys())
    signals_raw = pd.DataFrame(
        {t: trend_momentum_signal(indicators[t].reindex(common_idx)) for t in tickers}
    ).fillna(0.0)

    vols = pd.DataFrame(
        {t: indicators[t]["rolling_vol"].reindex(common_idx) for t in tickers}
    ).fillna(0.15)

    asset_returns = pd.DataFrame(
        {t: indicators[t]["returns"].reindex(common_idx) for t in tickers}
    ).fillna(0.0)

    # ── Step 3: Shift signals by 1 bar (no look-ahead) ──────────────────────
    signals = signals_raw.shift(1).fillna(0.0)
    vols_lagged = vols.shift(1).fillna(0.15)

    # ── Step 4: Volatility-targeted position sizes ───────────────────────────
    positions = compute_position_sizes(signals, vols_lagged, vol_target, max_leverage)

    # ── Step 5: Portfolio daily P&L ──────────────────────────────────────────
    n_assets = len(tickers)
    equal_weight = 1.0 / n_assets

    pos_changes = positions.diff().fillna(0.0).abs()
    costs = (pos_changes * (FEE_RATE + SLIPPAGE_RATE) * equal_weight).sum(axis=1)
    gross_ret = (positions * equal_weight * asset_returns).sum(axis=1)
    strategy_returns = gross_ret - costs

    # ── Step 6: Equity curve + drawdown guard ────────────────────────────────
    equity_curve = (1 + strategy_returns).cumprod() * INITIAL_CAPITAL
    peak = equity_curve.expanding().max()
    dd_series = (equity_curve - peak) / peak

    guard_mult = drawdown_guard_multiplier(dd_series)
    strategy_returns_g = strategy_returns * guard_mult
    equity_curve = (1 + strategy_returns_g).cumprod() * INITIAL_CAPITAL
    peak = equity_curve.expanding().max()
    dd_series = (equity_curve - peak) / peak

    # ── Step 7: Extract trades ───────────────────────────────────────────────
    trades = _extract_trades(positions, panel, common_idx)

    # ── Step 8: Frankenstein anomaly detection ───────────────────────────────
    anomaly_events: List[Dict] = []
    if frankenstein_check:
        try:
            from research.anomaly import detect_anomalies
            anomaly_events = detect_anomalies(equity_curve, strategy_returns_g, positions)
        except Exception as exc:
            logger.warning(f"Anomaly detection failed: {exc}")

    return {
        "equity_curve": equity_curve,
        "drawdown_series": dd_series,
        "positions": positions,
        "trades": trades,
        "anomaly_events": anomaly_events,
        "strategy_returns": strategy_returns_g,
    }


def _extract_trades(
    positions: pd.DataFrame,
    panel: Dict[str, pd.DataFrame],
    idx: pd.DatetimeIndex,
) -> List[Dict]:
    """Extract trade records (entry/exit pairs) from positions DataFrame."""
    trades: List[Dict] = []

    for ticker in positions.columns:
        pos = positions[ticker]
        close_prices = (
            panel[ticker]["close"].reindex(idx).ffill()
            if ticker in panel
            else pd.Series(1.0, index=idx)
        )

        in_trade = False
        entry_date = None
        entry_price = 1.0

        for i in range(len(idx)):
            cur = pos.iloc[i]
            date = idx[i]

            if not in_trade and cur > 0.01:
                in_trade = True
                entry_date = date
                entry_price = float(close_prices.iloc[i]) or 1.0

            elif in_trade and (cur <= 0.01 or i == len(idx) - 1):
                exit_price = float(close_prices.iloc[i]) or entry_price
                pnl_pct = (exit_price / entry_price - 1) * 100
                trades.append(
                    {
                        "ticker": ticker,
                        "entry_date": entry_date.strftime("%Y-%m-%d"),
                        "exit_date": date.strftime("%Y-%m-%d"),
                        "entry_price": round(entry_price, 4),
                        "exit_price": round(exit_price, 4),
                        "position_size": round(float(pos.iloc[max(0, i - 1)]), 4),
                        "pnl_pct": round(pnl_pct, 4),
                        "holding_days": (date - entry_date).days,
                    }
                )
                in_trade = False

    return sorted(trades, key=lambda x: x["entry_date"], reverse=True)

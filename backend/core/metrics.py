"""
Performance Metrics: CAGR, Sharpe, Sortino, Max Drawdown, trade stats.
"""
from typing import Dict, List, Any

import numpy as np
import pandas as pd

TRADING_DAYS: int = 252


def cagr(equity: pd.Series) -> float:
    """Compound Annual Growth Rate."""
    if len(equity) < 2 or equity.iloc[0] == 0:
        return 0.0
    n = len(equity)
    return float((equity.iloc[-1] / equity.iloc[0]) ** (TRADING_DAYS / n) - 1)


def sharpe_ratio(returns: pd.Series) -> float:
    """Annualized Sharpe Ratio (risk-free = 0)."""
    std = returns.std()
    if std == 0 or np.isnan(std):
        return 0.0
    return float((returns.mean() / std) * np.sqrt(TRADING_DAYS))


def sortino_ratio(returns: pd.Series) -> float:
    """Annualized Sortino Ratio (risk-free = 0)."""
    downside = returns[returns < 0]
    if len(downside) == 0:
        return 0.0
    d_std = downside.std()
    if d_std == 0 or np.isnan(d_std):
        return 0.0
    return float((returns.mean() / d_std) * np.sqrt(TRADING_DAYS))


def max_drawdown(equity: pd.Series) -> float:
    """Maximum peak-to-trough drawdown (negative value)."""
    if len(equity) < 2:
        return 0.0
    peak = equity.expanding().max()
    dd = (equity - peak) / peak
    return float(dd.min())


def exposure_pct(positions: pd.DataFrame) -> float:
    """Fraction of days where any position > 1%."""
    if positions.empty:
        return 0.0
    any_pos = (positions.abs() > 0.01).any(axis=1)
    return float(any_pos.sum() / len(positions))


def compute_trade_stats(trades: List[Dict]) -> Dict:
    """Win rate, avg win/loss, profit factor, avg holding days."""
    if not trades:
        return {
            "total_trades": 0,
            "win_rate": 0.0,
            "avg_win_pct": 0.0,
            "avg_loss_pct": 0.0,
            "profit_factor": 0.0,
            "avg_holding_days": 0.0,
        }
    pnls = [t["pnl_pct"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    sum_losses = abs(sum(losses)) if losses else 0
    return {
        "total_trades": len(pnls),
        "win_rate": round(len(wins) / len(pnls), 4),
        "avg_win_pct": round(float(np.mean(wins)), 4) if wins else 0.0,
        "avg_loss_pct": round(float(np.mean(losses)), 4) if losses else 0.0,
        "profit_factor": round(sum(wins) / sum_losses, 4) if sum_losses > 0 else 0.0,
        "avg_holding_days": round(float(np.mean([t["holding_days"] for t in trades])), 1),
    }


def compute_metrics(
    equity: pd.Series,
    returns: pd.Series,
    trades: List[Dict],
    positions: pd.DataFrame,
) -> Dict:
    """Full performance metric set for a single period."""
    result = {
        "cagr": round(cagr(equity), 4),
        "sharpe": round(sharpe_ratio(returns), 4),
        "sortino": round(sortino_ratio(returns), 4),
        "max_drawdown": round(max_drawdown(equity), 4),
        "exposure_pct": round(exposure_pct(positions), 4),
    }
    result.update(compute_trade_stats(trades))
    return result


def split_and_compute(
    equity: pd.Series,
    returns: pd.Series,
    trades: List[Dict],
    positions: pd.DataFrame,
    train_frac: float = 0.70,
) -> Dict:
    """Compute metrics for overall, train, and test periods."""
    n = len(equity)
    split_idx = max(1, int(n * train_frac))
    split_date = equity.index[split_idx].strftime("%Y-%m-%d")

    def _slice(s, start, end):
        return s.iloc[start:end]

    train_trades = [t for t in trades if t.get("entry_date", "") < split_date]
    test_trades = [t for t in trades if t.get("entry_date", "") >= split_date]

    return {
        "overall": compute_metrics(equity, returns, trades, positions),
        "train": compute_metrics(
            _slice(equity, 0, split_idx),
            _slice(returns, 0, split_idx),
            train_trades,
            _slice(positions, 0, split_idx),
        ),
        "test": compute_metrics(
            _slice(equity, split_idx, n),
            _slice(returns, split_idx, n),
            test_trades,
            _slice(positions, split_idx, n),
        ),
        "split_date": split_date,
    }

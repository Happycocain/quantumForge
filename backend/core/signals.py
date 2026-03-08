"""
Signal Engine: Trend + Momentum entry/exit rules.

No look-ahead bias: signals are computed from data available at close of bar t.
The backtest applies them at close t → close t+1 (via a 1-bar shift).

Entry  : SMA_short > SMA_long  AND  ROC > 0  → Long (1)
Exit   : SMA_short < SMA_long  OR   ROC < 0  → Flat (0)
"""
import pandas as pd


def trend_momentum_signal(df: pd.DataFrame) -> pd.Series:
    """
    Compute raw long/flat signal.

    Parameters
    ----------
    df : DataFrame with columns sma_short, sma_long, roc

    Returns
    -------
    pd.Series of {0, 1} with same index as df
    """
    long_cond = (df["sma_short"] > df["sma_long"]) & (df["roc"] > 0)
    signal = pd.Series(0.0, index=df.index)
    signal[long_cond] = 1.0
    return signal

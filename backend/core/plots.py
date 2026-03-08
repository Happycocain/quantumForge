"""
Plot generation for CLI output (uses matplotlib Agg backend – no display needed).
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pathlib import Path
from typing import List, Dict


BG = "#0b0e14"
SURFACE = "#151921"
GRID = "#2a2f3a"
TEXT = "#f8fafc"
MUTED = "#94a3b8"
BLUE = "#3b82f6"
RED = "#ef4444"
GREEN = "#10b981"


def _base_style(ax, title: str) -> None:
    ax.set_facecolor(SURFACE)
    ax.set_title(title, color=TEXT, fontsize=12, pad=10)
    ax.tick_params(colors=MUTED, labelsize=8)
    for spine in ax.spines.values():
        spine.set_color(GRID)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.yaxis.set_tick_params(colors=MUTED)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))


def plot_equity_curve(equity: pd.Series, save_path: Path, title: str = "Equity Curve") -> None:
    fig, ax = plt.subplots(figsize=(12, 4), facecolor=BG)
    ax.plot(equity.index, equity.values, color=BLUE, linewidth=1.5)
    ax.fill_between(equity.index, equity.values, equity.iloc[0], alpha=0.08, color=BLUE)
    _base_style(ax, title)
    ax.set_ylabel("Portfolio Value ($)", color=MUTED, fontsize=9)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x/1000:.0f}k"))
    plt.tight_layout()
    plt.savefig(save_path, dpi=100, bbox_inches="tight", facecolor=BG)
    plt.close()


def plot_drawdown(drawdown: pd.Series, save_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 3), facecolor=BG)
    dd_pct = drawdown.values * 100
    ax.fill_between(drawdown.index, dd_pct, 0, color=RED, alpha=0.4)
    ax.plot(drawdown.index, dd_pct, color=RED, linewidth=1)
    _base_style(ax, "Drawdown (%)")
    ax.set_ylabel("Drawdown (%)", color=MUTED, fontsize=9)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:.0f}%"))
    plt.tight_layout()
    plt.savefig(save_path, dpi=100, bbox_inches="tight", facecolor=BG)
    plt.close()


def plot_optimizer_comparison(top_configs: List[Dict], save_path: Path) -> None:
    if not top_configs:
        return
    fig, ax = plt.subplots(figsize=(10, 4), facecolor=BG)
    labels = [
        f"SMA({c['params']['sma_short']}/{c['params']['sma_long']})\nROC({c['params']['roc_window']})"
        for c in top_configs[:5]
    ]
    sharpes = [c.get("test_sharpe", 0) for c in top_configs[:5]]
    colors = [GREEN if s > 0 else RED for s in sharpes]
    bars = ax.bar(labels, sharpes, color=colors, alpha=0.8, width=0.5)
    ax.axhline(0, color=GRID, linewidth=1)
    _base_style(ax, "Top Configs – Test Sharpe Ratio")
    ax.set_ylabel("Test Sharpe", color=MUTED, fontsize=9)
    for bar, v in zip(bars, sharpes):
        ax.text(bar.get_x() + bar.get_width() / 2, v + 0.02, f"{v:.2f}",
                ha="center", va="bottom", color=TEXT, fontsize=8)
    plt.tight_layout()
    plt.savefig(save_path, dpi=100, bbox_inches="tight", facecolor=BG)
    plt.close()

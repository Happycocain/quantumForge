# ForgeQuant-Lab

> **⚠ EDUCATIONAL USE ONLY — This is NOT investment advice.**
> All backtest results are hypothetical. Past simulated performance does not predict future results.

A modular Python quantitative trading research platform featuring:
- Trend + Momentum baseline strategy with full risk management
- Automated parameter sweep optimization with robustness checks
- Walk-forward out-of-sample evaluation
- **Frankenstein Mode™** – detects unstable/suspicious regime shifts and progressively de-risks

## Stack

- Python 3 · pandas · numpy · yfinance · matplotlib
- FastAPI (REST API for the web dashboard)
- React + Recharts (frontend dashboard)

## Installation

```bash
pip install -r requirements.txt
```

## Running the CLI

```bash
# Baseline backtest (default tickers SPY QQQ AAPL MSFT, 2014–2024)
python main.py

# Parameter optimization (quick grid, ~24 combos)
python main.py --mode optimize --quick

# Full parameter grid (~162 combos, slower)
python main.py --mode optimize

# Walk-forward analysis
python main.py --mode walkforward

# Combined: optimize + walk-forward on custom tickers
python main.py --mode optimize+walkforward --tickers SPY QQQ --start 2016-01-01 --end 2023-01-01

# Results are saved to outputs/<timestamp>/
```

## Web Dashboard

The React dashboard wraps all modules via FastAPI.
Start the backend (handled by supervisor) and open the preview URL.

Features:
- Interactive equity curve and drawdown charts
- Metrics panel (CAGR, Sharpe, Sortino, MaxDD, Win Rate)
- Parameter optimizer table with robustness warnings
- Frankenstein monitor with severity-graded event log
- Walk-forward OOS stitched equity curve
- AI (GPT-4o) plain-English summaries of all results

## Strategy Logic

**Entry**: SMA(50) > SMA(200) **AND** ROC(20) > 0  
**Exit**: SMA(50) < SMA(200) **OR** ROC(20) < 0  

Risk management:
- Volatility targeting (default 12% annual vol)
- Position sizing = signal × (target_vol / realized_vol), capped at 1× leverage
- Drawdown guard: >15% DD → cut 50%; >25% DD → go to cash
- Transaction costs: 0.05% fee + 0.02% slippage per trade

## Frankenstein Mode

Detects regime instability using four signals:

| Signal              | Threshold                                    | Notes                        |
|---------------------|----------------------------------------------|------------------------------|
| Volatility shock    | Realized vol > 2.5× rolling median           | Sudden market turbulence     |
| Return outlier      | \|daily return\| > 3σ                        | Fat-tail event               |
| Turnover spike      | Weekly turnover > 2.5× rolling average       | Unstable signal flip-flopping|
| DD acceleration     | Drawdown slope < −0.5%/day                   | Accelerating losses          |

**Progressive response:**
- **Level 1** (1 trigger): Reduce exposure by 25%
- **Level 2** (2 triggers): Reduce exposure by 50% + tighten stops
- **Level 3** (3+ triggers): Go to cash for 20 trading days

All events are logged with timestamp, trigger context, and equity snapshot.

## Common Pitfalls

1. **Overfitting**: When train Sharpe >> test Sharpe, the strategy is curve-fit to historical noise.
   Always check the robustness table — reject configs with high degradation vs neighbors.

2. **Survivorship bias**: This platform uses current-day tickers (SPY, QQQ, AAPL, MSFT).
   Companies that went bankrupt or were delisted are excluded. Real-world performance would be lower.

3. **Data issues**: yfinance provides adjusted prices (splits/dividends). Be aware that
   adjustments applied retroactively can create artificial signals near corporate events.

4. **Transaction costs**: The 0.07% round-trip cost seems small but compounds. A strategy
   with 100 trades/year loses ~7% annually to costs alone — always include them.

5. **Walk-forward ≠ live trading**: Walk-forward reduces but does not eliminate
   the risk of overfitting. Market regimes shift; past OOS performance is still historical.

6. **Frankenstein false positives**: High vol or turnover events may fire during normal
   volatile periods (e.g., COVID crash 2020). Review all Level 3 events manually.

## Project Structure

```
backend/
  core/          # Data engine, indicators, signals, risk, backtest, metrics
  strategies/    # Trend+Momentum strategy wrapper
  research/      # Optimizer, walk-forward, robustness, anomaly detection
  outputs/       # Auto-created run results (CSV + charts)
  main.py        # CLI entry point
  server.py      # FastAPI REST API
frontend/
  src/
    pages/       # Dashboard, Research, Frankenstein, WalkForward
    components/  # Layout, charts, metric cards
```

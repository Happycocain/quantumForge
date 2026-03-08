import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { Play, RefreshCw, Zap, TrendingDown, Award, Clock, BarChart2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SURFACE = "#151921";
const BORDER = "#2a2f3a";

const TICKERS_ALL = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA"];

function MetricCard({ label, value, sub, color = "#3b82f6" }) {
  return (
    <div className="metric-card" style={{ borderLeftColor: color }} data-testid={`metric-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 22, fontFamily: "Chivo,sans-serif", fontWeight: 700, color: color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, valueKey = "value", prefix = "$", isPercent }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const display = isPercent ? `${(v * 100).toFixed(2)}%` : `${prefix}${v?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div style={{ background: "#151921", border: "1px solid #2a2f3a", padding: "6px 10px", fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}>
      <p style={{ color: "#64748b" }}>{label}</p>
      <p style={{ color: payload[0].stroke || "#3b82f6" }}>{display}</p>
    </div>
  );
}

export default function Dashboard() {
  const [tickers, setTickers] = useState(["SPY", "QQQ", "AAPL", "MSFT"]);
  const [params, setParams] = useState({ sma_short: 50, sma_long: 200, roc_window: 20, vol_target: 0.12 });
  const [startDate, setStartDate] = useState("2014-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");

  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const pollRef = useRef(null);

  const poll = useCallback(async (id) => {
    try {
      const { data } = await axios.get(`${API}/runs/${id}`);
      setStatus(data.status);
      if (data.status === "completed") {
        setResult(data.result);
        clearInterval(pollRef.current);
      } else if (data.status === "error") {
        setError(data.error || "Unknown error");
        clearInterval(pollRef.current);
      }
    } catch { clearInterval(pollRef.current); }
  }, []);

  useEffect(() => {
    if ((status === "queued" || status === "running") && runId) {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => poll(runId), 2500);
      return () => clearInterval(pollRef.current);
    }
  }, [status, runId, poll]);

  const handleRun = async () => {
    setResult(null); setError(null); setAiSummary(null);
    try {
      const { data } = await axios.post(`${API}/backtest/run`, {
        tickers, start_date: startDate, end_date: endDate,
        params: { ...params, atr_mult: 2.0, max_leverage: 1.0 },
        frankenstein_check: true,
      });
      setRunId(data.run_id);
      setStatus("queued");
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to start run");
    }
  };

  const handleAI = async () => {
    if (!runId) return;
    setLoadingAI(true);
    try {
      const { data } = await axios.post(`${API}/ai/summarize`, { run_id: runId, summary_type: "backtest" });
      setAiSummary(data.summary);
    } catch { setAiSummary("AI summary unavailable."); }
    finally { setLoadingAI(false); }
  };

  const toggleTicker = (t) => setTickers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const metrics = result?.metrics?.overall || {};
  const trainM = result?.metrics?.train || {};
  const testM = result?.metrics?.test || {};
  const isRunning = status === "queued" || status === "running";

  const fmt = (v, isP) => v == null ? "—" : isP ? `${(v * 100).toFixed(1)}%` : typeof v === "number" ? v.toFixed(3) : v;
  const metricColor = (v, goodPos = true) => {
    if (v == null) return "#94a3b8";
    return (goodPos ? v >= 0 : v <= 0) ? "#10b981" : "#ef4444";
  };

  return (
    <div className="p-6 space-y-4" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "Chivo,sans-serif", fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>Backtest Dashboard</h1>
          <p style={{ fontSize: 11, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>Trend + Momentum Strategy</p>
        </div>
        <span style={{ fontSize: 9, color: "#334155", fontFamily: "JetBrains Mono,monospace", border: "1px solid #2a2f3a", padding: "3px 8px" }}>
          EDUCATIONAL USE ONLY
        </span>
      </div>

      {/* Controls + Charts row */}
      <div className="grid grid-cols-12 gap-4">
        {/* Controls panel */}
        <div className="col-span-3" style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Configuration</p>

          <div className="space-y-3">
            {/* Tickers */}
            <div>
              <label style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono,monospace" }}>TICKERS</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {TICKERS_ALL.map(t => (
                  <button key={t} onClick={() => toggleTicker(t)} data-testid={`ticker-${t}`}
                    style={{ padding: "2px 7px", fontSize: 10, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, cursor: "pointer", border: "1px solid", borderColor: tickers.includes(t) ? "#3b82f6" : "#2a2f3a", background: tickers.includes(t) ? "rgba(59,130,246,0.12)" : "transparent", color: tickers.includes(t) ? "#3b82f6" : "#64748b", transition: "all 0.1s" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            {[["START DATE", startDate, setStartDate], ["END DATE", endDate, setEndDate]].map(([lbl, val, setter]) => (
              <div key={lbl}>
                <label style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono,monospace" }}>{lbl}</label>
                <input type="date" value={val} onChange={e => setter(e.target.value)} data-testid={`input-${lbl.toLowerCase().replace(/ /g, "-")}`}
                  style={{ display: "block", width: "100%", marginTop: 3, background: "#0b0e14", border: "1px solid #2a2f3a", color: "#f8fafc", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, outline: "none" }} />
              </div>
            ))}

            {/* Params */}
            <div>
              <label style={{ fontSize: 10, color: "#94a3b8", fontFamily: "JetBrains Mono,monospace" }}>PARAMETERS</label>
              <div className="space-y-2 mt-1">
                {[
                  ["SMA Short", "sma_short", 20, 100, 5],
                  ["SMA Long", "sma_long", 100, 300, 10],
                  ["ROC Window", "roc_window", 5, 60, 5],
                  ["Vol Target %", "vol_target", 0.05, 0.25, 0.01],
                ].map(([lbl, key, min, max, step]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>{lbl}</span>
                    <div className="flex items-center gap-1">
                      <input type="number" value={params[key]} min={min} max={max} step={step}
                        onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                        data-testid={`param-${key}`}
                        style={{ width: 60, background: "#0b0e14", border: "1px solid #2a2f3a", color: "#f8fafc", padding: "2px 6px", fontSize: 11, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, outline: "none", textAlign: "right" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Run button */}
            <button onClick={handleRun} disabled={isRunning || tickers.length === 0}
              data-testid="run-backtest-btn"
              className={isRunning ? "running-pulse" : ""}
              style={{ width: "100%", padding: "8px 0", background: isRunning ? "rgba(59,130,246,0.2)" : "#3b82f6", color: "#fff", border: "none", borderRadius: 2, fontSize: 11, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.1s" }}>
              {isRunning ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={12} />}
              {isRunning ? `${status.toUpperCase()}...` : "RUN BACKTEST"}
            </button>

            {error && <p style={{ fontSize: 10, color: "#ef4444", fontFamily: "JetBrains Mono,monospace", wordBreak: "break-word" }}>{error}</p>}
          </div>
        </div>

        {/* Charts column */}
        <div className="col-span-9 space-y-4">
          {/* Equity curve */}
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
            <div className="flex items-center justify-between mb-3">
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Equity Curve</p>
              {result && <span style={{ fontSize: 10, color: "#10b981", fontFamily: "JetBrains Mono,monospace" }}>+{fmt(metrics.cagr, true)} CAGR</span>}
            </div>
            {result?.equity_curve?.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={result.equity_curve}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1a2030" vertical={false} />
                  <XAxis dataKey="date" stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center" style={{ height: 220, color: "#334155" }}>
                <div className="text-center">
                  <BarChart2 size={24} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                  <p style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}>{isRunning ? "Computing…" : "Run a backtest to see results"}</p>
                </div>
              </div>
            )}
          </div>

          {/* Drawdown */}
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Drawdown</p>
            {result?.drawdown_series?.length ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={result.drawdown_series}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1a2030" vertical={false} />
                  <XAxis dataKey="date" stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip content={<ChartTooltip valueKey="drawdown" isPercent />} />
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="url(#ddGrad)" strokeWidth={1} dot={false} />
                  <ReferenceLine y={-0.15} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
                  <ReferenceLine y={-0.25} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155" }}>
                <TrendingDown size={20} style={{ opacity: 0.3 }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      {result && (
        <div>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Performance Metrics</p>
          <div className="grid grid-cols-6 gap-3">
            <MetricCard label="CAGR" value={fmt(metrics.cagr, true)} sub="overall" color={metricColor(metrics.cagr)} />
            <MetricCard label="Sharpe Ratio" value={fmt(metrics.sharpe)} sub={`Test: ${fmt(testM.sharpe)}`} color={metricColor(metrics.sharpe)} />
            <MetricCard label="Sortino" value={fmt(metrics.sortino)} sub="downside adj." color={metricColor(metrics.sortino)} />
            <MetricCard label="Max Drawdown" value={fmt(metrics.max_drawdown, true)} sub="peak-to-trough" color={metricColor(metrics.max_drawdown, false)} />
            <MetricCard label="Win Rate" value={fmt(metrics.win_rate, true)} sub={`${metrics.total_trades ?? "—"} trades`} color="#f59e0b" />
            <MetricCard label="Exposure" value={fmt(metrics.exposure_pct, true)} sub={`Avg hold ${metrics.avg_holding_days?.toFixed(0) ?? "—"}d`} color="#8b5cf6" />
          </div>

          {/* Train/Test split */}
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2, marginTop: 12 }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Train / Test Split — cutoff: {result.metrics?.split_date}
            </p>
            <div className="grid grid-cols-4 gap-3">
              {[["CAGR", "cagr", true], ["Sharpe", "sharpe", false], ["Max DD", "max_drawdown", true], ["Win Rate", "win_rate", true]].map(([lbl, k, isP]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #1a2030" }}>
                  <span style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>{lbl}</span>
                  <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 11 }}>
                    <span style={{ color: "#3b82f6" }}>{fmt(trainM[k], isP)}</span>
                    <span style={{ color: "#334155", margin: "0 4px" }}>/</span>
                    <span style={{ color: metricColor(testM[k], k !== "max_drawdown") }}>{fmt(testM[k], isP)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Trades */}
      {result?.trades?.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent Trades</p>
            <span style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>{result.trades.length} records</span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 220, overflowY: "auto" }}>
            <table className="dense-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>Ticker</th><th>Entry</th><th>Exit</th><th>Entry $</th><th>Exit $</th><th>P&L %</th><th>Days</th></tr></thead>
              <tbody>
                {result.trades.slice(0, 30).map((t, i) => (
                  <tr key={i} data-testid={`trade-row-${i}`}>
                    <td style={{ color: "#3b82f6" }}>{t.ticker}</td>
                    <td>{t.entry_date}</td>
                    <td>{t.exit_date}</td>
                    <td style={{ textAlign: "right" }}>{t.entry_price?.toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{t.exit_price?.toFixed(2)}</td>
                    <td style={{ textAlign: "right", color: t.pnl_pct >= 0 ? "#10b981" : "#ef4444" }}>{t.pnl_pct?.toFixed(2)}%</td>
                    <td style={{ textAlign: "right" }}>{t.holding_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Summary */}
      {result && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={13} color="#f59e0b" strokeWidth={1.5} />
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Analysis (GPT-4o)</p>
            </div>
            <button onClick={handleAI} disabled={loadingAI} data-testid="generate-ai-summary-btn"
              style={{ padding: "4px 12px", fontSize: 10, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: loadingAI ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 2, cursor: loadingAI ? "not-allowed" : "pointer", transition: "background 0.1s" }}>
              {loadingAI ? "GENERATING…" : "GENERATE INSIGHT"}
            </button>
          </div>
          {aiSummary ? (
            <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Manrope,sans-serif", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiSummary}</p>
          ) : (
            <p style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>Click "Generate Insight" for an AI-powered analysis of these results.</p>
          )}
        </div>
      )}
    </div>
  );
}

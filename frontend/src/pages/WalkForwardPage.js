import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, Play, RefreshCw, Zap } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SURFACE = "#151921";
const BORDER = "#2a2f3a";

export default function WalkForwardPage() {
  const [tickers] = useState(["SPY", "QQQ", "AAPL", "MSFT"]);
  const [trainYears, setTrainYears] = useState(3);
  const [testYears, setTestYears] = useState(1);
  const [params, setParams] = useState({ sma_short: 50, sma_long: 200, roc_window: 20, vol_target: 0.12, atr_mult: 2.0, max_leverage: 1.0 });
  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const poll = useCallback(async (id) => {
    try {
      const { data } = await axios.get(`${API}/runs/${id}`);
      setStatus(data.status);
      if (data.status === "completed") { setResult(data.result); clearInterval(pollRef.current); }
      else if (data.status === "error") { setError(data.error); clearInterval(pollRef.current); }
    } catch { clearInterval(pollRef.current); }
  }, []);

  useEffect(() => {
    if ((status === "queued" || status === "running") && runId) {
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => poll(runId), 3000);
      return () => clearInterval(pollRef.current);
    }
  }, [status, runId, poll]);

  const handleRun = async () => {
    setResult(null); setError(null);
    try {
      const { data } = await axios.post(`${API}/walkforward/run`, {
        tickers, params, train_years: trainYears, test_years: testYears,
      });
      setRunId(data.run_id); setStatus("queued");
    } catch (e) { setError(e.response?.data?.detail || "Failed to start"); }
  };

  const isRunning = status === "queued" || status === "running";
  const agg = result?.aggregate || {};
  const windowMetrics = result?.window_metrics || [];
  const oosEquity = result?.oos_equity || [];

  const fmt = (v, isP) => v == null ? "—" : isP ? `${(v * 100).toFixed(1)}%` : typeof v === "number" ? v.toFixed(3) : String(v);

  return (
    <div className="p-6 space-y-4" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp size={20} color="#3b82f6" strokeWidth={1.5} />
          <div>
            <h1 style={{ fontFamily: "Chivo,sans-serif", fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>Walk-Forward Analysis</h1>
            <p style={{ fontSize: 11, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>Rolling OOS evaluation — stitched equity curve</p>
          </div>
        </div>
        <span style={{ fontSize: 9, color: "#334155", fontFamily: "JetBrains Mono,monospace", border: "1px solid #2a2f3a", padding: "3px 8px" }}>EDUCATIONAL USE ONLY</span>
      </div>

      {/* Controls */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
        <div className="flex items-end gap-8 flex-wrap">
          {/* Window config */}
          <div className="flex gap-6">
            {[["TRAIN WINDOW (years)", trainYears, setTrainYears, 1, 5], ["TEST WINDOW (years)", testYears, setTestYears, 1, 3]].map(([lbl, val, setter, min, max]) => (
              <div key={lbl}>
                <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", marginBottom: 6 }}>{lbl}</p>
                <div className="flex items-center gap-2">
                  <input type="range" min={min} max={max} step={1} value={val}
                    onChange={e => setter(parseInt(e.target.value))}
                    data-testid={`wf-${lbl.toLowerCase().replace(/ /g, "-")}`}
                    style={{ width: 80, accentColor: "#3b82f6" }} />
                  <span style={{ fontSize: 14, fontFamily: "Chivo,sans-serif", fontWeight: 700, color: "#f8fafc", minWidth: 20 }}>{val}y</span>
                </div>
              </div>
            ))}
          </div>

          {/* Key params */}
          <div className="flex gap-4">
            {[["SMA Short", "sma_short"], ["SMA Long", "sma_long"], ["ROC Win", "roc_window"]].map(([lbl, key]) => (
              <div key={key}>
                <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", marginBottom: 4 }}>{lbl}</p>
                <input type="number" value={params[key]}
                  onChange={e => setParams(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                  data-testid={`wf-param-${key}`}
                  style={{ width: 60, background: "#0b0e14", border: "1px solid #2a2f3a", color: "#f8fafc", padding: "4px 8px", fontSize: 11, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, outline: "none" }} />
              </div>
            ))}
          </div>

          <button onClick={handleRun} disabled={isRunning} data-testid="run-wf-btn"
            className={isRunning ? "running-pulse" : ""}
            style={{ padding: "8px 20px", background: isRunning ? "rgba(59,130,246,0.2)" : "#3b82f6", color: "#fff", border: "none", borderRadius: 2, fontSize: 11, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.1s" }}>
            {isRunning ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> {status.toUpperCase()}…</> : <><Play size={12} /> RUN WALK-FORWARD</>}
          </button>

          {error && <p style={{ fontSize: 10, color: "#ef4444", fontFamily: "JetBrains Mono,monospace" }}>{error}</p>}
        </div>
      </div>

      {/* Aggregate stats */}
      {result && (
        <div className="grid grid-cols-4 gap-3">
          {[
            ["OOS Windows", agg.n_windows, "#3b82f6"],
            ["Avg OOS Sharpe", agg.avg_sharpe?.toFixed(3), (agg.avg_sharpe ?? 0) >= 0 ? "#10b981" : "#ef4444"],
            ["Avg OOS CAGR", `${((agg.avg_cagr ?? 0) * 100).toFixed(1)}%`, (agg.avg_cagr ?? 0) >= 0 ? "#10b981" : "#ef4444"],
            ["% Positive Windows", `${((agg.pct_positive_windows ?? 0) * 100).toFixed(0)}%`, (agg.pct_positive_windows ?? 0) >= 0.5 ? "#10b981" : "#f59e0b"],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2 }}>
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{lbl}</p>
              <p style={{ fontSize: 26, fontFamily: "Chivo,sans-serif", fontWeight: 700, color, marginTop: 2 }}>{val ?? "—"}</p>
            </div>
          ))}
        </div>
      )}

      {/* OOS Equity curve */}
      {oosEquity.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Out-of-Sample Stitched Equity Curve
          </p>
          <p style={{ fontSize: 10, color: "#334155", fontFamily: "JetBrains Mono,monospace", marginBottom: 8 }}>
            Each segment uses a different test window. Windows are stitched end-to-end.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={oosEquity}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1a2030" vertical={false} />
              <XAxis dataKey="date" stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "#151921", border: "1px solid #2a2f3a", fontSize: 11, fontFamily: "JetBrains Mono,monospace" }}
                formatter={v => [`$${v?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, "OOS Equity"]} />
              <defs>
                <linearGradient id="oosGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={2} fill="url(#oosGrad)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-window metrics table */}
      {windowMetrics.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Window-by-Window OOS Metrics</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="dense-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>OOS Window</th>
                  <th>Train Period</th>
                  <th>OOS CAGR</th>
                  <th>OOS Sharpe</th>
                  <th>OOS Sortino</th>
                  <th>Max DD</th>
                  <th>Win Rate</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {windowMetrics.map((w, i) => (
                  <tr key={i} data-testid={`wf-window-${i}`}>
                    <td style={{ color: "#3b82f6" }}>{w.window}</td>
                    <td style={{ color: "#64748b" }}>{w.train_period}</td>
                    <td style={{ color: (w.cagr ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>{fmt(w.cagr, true)}</td>
                    <td style={{ color: (w.sharpe ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>{fmt(w.sharpe)}</td>
                    <td style={{ color: (w.sortino ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>{fmt(w.sortino)}</td>
                    <td style={{ color: "#ef4444" }}>{fmt(w.max_drawdown, true)}</td>
                    <td>{fmt(w.win_rate, true)}</td>
                    <td>{w.total_trades ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !isRunning && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <TrendingUp size={40} color="#2a2f3a" strokeWidth={1} />
          <p style={{ fontSize: 13, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>Configure rolling windows and run walk-forward analysis</p>
        </div>
      )}
    </div>
  );
}

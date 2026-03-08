import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Play, RefreshCw, AlertCircle, Zap, Activity } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SURFACE = "#151921";
const BORDER = "#2a2f3a";

export default function ResearchPage() {
  const [tickers] = useState(["SPY", "QQQ", "AAPL", "MSFT"]);
  const [quickMode, setQuickMode] = useState(true);
  const [trainFrac, setTrainFrac] = useState(0.70);
  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [sortKey, setSortKey] = useState("test_sharpe");
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
    setResult(null); setError(null); setAiSummary(null);
    try {
      const { data } = await axios.post(`${API}/optimize/run`, {
        tickers, quick_mode: quickMode, train_frac: trainFrac,
      });
      setRunId(data.run_id); setStatus("queued");
    } catch (e) { setError(e.response?.data?.detail || "Failed to start"); }
  };

  const handleAI = async () => {
    if (!runId) return;
    setLoadingAI(true);
    try {
      const { data } = await axios.post(`${API}/ai/summarize`, { run_id: runId, summary_type: "optimize" });
      setAiSummary(data.summary);
    } catch { setAiSummary("AI summary unavailable."); }
    finally { setLoadingAI(false); }
  };

  const isRunning = status === "queued" || status === "running";
  const allResults = result?.all_results || [];
  const sorted = [...allResults].sort((a, b) => {
    if (sortKey === "test_sharpe") return (b.test_sharpe ?? -999) - (a.test_sharpe ?? -999);
    if (sortKey === "test_cagr") return (b.test_cagr ?? -999) - (a.test_cagr ?? -999);
    if (sortKey === "overfit_score") return (a.overfit_score ?? 999) - (b.overfit_score ?? 999);
    return (b[sortKey] ?? -999) - (a[sortKey] ?? -999);
  });

  const chartData = (result?.top_configs || []).slice(0, 5).map((c, i) => ({
    name: `SMA(${c.params?.sma_short}/${c.params?.sma_long}) R${c.params?.roc_window}`,
    train: +(c.train_sharpe ?? 0).toFixed(3),
    test: +(c.test_sharpe ?? 0).toFixed(3),
  }));

  return (
    <div className="p-6 space-y-4" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "Chivo,sans-serif", fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>Parameter Optimizer</h1>
          <p style={{ fontSize: 11, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>70/30 chronological train/test split</p>
        </div>
        <span style={{ fontSize: 9, color: "#334155", fontFamily: "JetBrains Mono,monospace", border: "1px solid #2a2f3a", padding: "3px 8px" }}>EDUCATIONAL USE ONLY</span>
      </div>

      {/* Controls */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
        <div className="flex items-center gap-8 flex-wrap">
          <div>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", marginBottom: 6 }}>Mode</p>
            <div className="flex gap-2">
              {[["Quick (24 combos)", true], ["Full (162 combos)", false]].map(([lbl, val]) => (
                <button key={lbl} onClick={() => setQuickMode(val)} data-testid={`mode-${lbl.split(" ")[0].toLowerCase()}`}
                  style={{ padding: "5px 12px", fontSize: 10, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, cursor: "pointer", border: "1px solid", borderColor: quickMode === val ? "#3b82f6" : "#2a2f3a", background: quickMode === val ? "rgba(59,130,246,0.12)" : "transparent", color: quickMode === val ? "#3b82f6" : "#64748b", transition: "all 0.1s" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", marginBottom: 6 }}>Train Split</p>
            <div className="flex items-center gap-2">
              <input type="range" min={0.5} max={0.85} step={0.05} value={trainFrac}
                onChange={e => setTrainFrac(parseFloat(e.target.value))} data-testid="train-frac-slider"
                style={{ width: 100, accentColor: "#3b82f6" }} />
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono,monospace", color: "#f8fafc" }}>{(trainFrac * 100).toFixed(0)}%</span>
            </div>
          </div>

          <button onClick={handleRun} disabled={isRunning} data-testid="run-optimize-btn"
            className={isRunning ? "running-pulse" : ""}
            style={{ padding: "8px 20px", background: isRunning ? "rgba(59,130,246,0.2)" : "#3b82f6", color: "#fff", border: "none", borderRadius: 2, fontSize: 11, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.1s" }}>
            {isRunning ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> {status.toUpperCase()}…</> : <><Play size={12} /> RUN OPTIMIZER</>}
          </button>

          {error && <p style={{ fontSize: 10, color: "#ef4444", fontFamily: "JetBrains Mono,monospace" }}>{error}</p>}
        </div>
      </div>

      {/* Stats row */}
      {result && (
        <div className="grid grid-cols-4 gap-3">
          {[
            ["Combinations Tested", result.n_combinations, "#3b82f6"],
            ["Valid Runs", result.n_valid, "#10b981"],
            ["Overfit Warnings", result.robustness?.overfit_warnings ?? 0, "#f59e0b"],
            ["Grid", result.grid_used ? `${Object.values(result.grid_used).reduce((a, v) => a * v.length, 1)} combos` : "—", "#8b5cf6"],
          ].map(([lbl, val, color]) => (
            <div key={lbl} style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2 }}>
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{lbl}</p>
              <p style={{ fontSize: 24, fontFamily: "Chivo,sans-serif", fontWeight: 700, color, marginTop: 2 }}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top 5 chart */}
      {chartData.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Top 5 Configs — Train vs Test Sharpe</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1a2030" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} stroke="#2a2f3a" tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} stroke="#2a2f3a" tickLine={false} />
              <Tooltip contentStyle={{ background: "#151921", border: "1px solid #2a2f3a", fontSize: 11, fontFamily: "JetBrains Mono,monospace" }} />
              <Bar dataKey="train" fill="#3b82f6" fillOpacity={0.5} name="Train Sharpe" radius={[2, 2, 0, 0]} />
              <Bar dataKey="test" name="Test Sharpe" radius={[2, 2, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.test >= d.train * 0.8 ? "#10b981" : "#ef4444"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Robustness */}
      {result?.robustness?.sensitivity_table?.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <AlertCircle size={12} color="#f59e0b" strokeWidth={1.5} />
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Robustness Analysis</p>
            </div>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", marginTop: 2 }}>{result.robustness.summary}</p>
          </div>
          <table className="dense-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>SMA</th><th>ROC</th><th>Vol</th><th>Base Sharpe</th><th>Avg Neighbor</th><th>Degradation</th><th>Status</th></tr></thead>
            <tbody>
              {result.robustness.sensitivity_table.map((s, i) => (
                <tr key={i}>
                  <td>{s.params?.sma_short}/{s.params?.sma_long}</td>
                  <td>{s.params?.roc_window}</td>
                  <td>{((s.params?.vol_target || 0) * 100).toFixed(0)}%</td>
                  <td style={{ color: "#f8fafc" }}>{s.base_metric?.toFixed(3)}</td>
                  <td>{s.avg_neighbor_metric?.toFixed(3) ?? "—"}</td>
                  <td style={{ color: (s.degradation ?? 0) > 0.5 ? "#ef4444" : "#10b981" }}>{s.degradation?.toFixed(3) ?? "—"}</td>
                  <td>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 2, ...(s.overfit_warning ? { background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" } : { background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }) }}>
                      {s.overfit_warning ? "OVERFIT RISK" : "STABLE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Results Table */}
      {sorted.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>All Results ({sorted.length})</p>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)} data-testid="sort-select"
              style={{ background: "#0b0e14", border: "1px solid #2a2f3a", color: "#94a3b8", padding: "3px 8px", fontSize: 10, fontFamily: "JetBrains Mono,monospace", borderRadius: 2, outline: "none" }}>
              <option value="test_sharpe">Sort: Test Sharpe</option>
              <option value="test_cagr">Sort: Test CAGR</option>
              <option value="test_max_dd">Sort: Max DD</option>
              <option value="overfit_score">Sort: Overfit Score</option>
            </select>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <table className="dense-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th>#</th><th>SMA</th><th>ROC</th><th>ATR</th><th>Vol</th><th>Train Sharpe</th><th>Test Sharpe</th><th>Test CAGR</th><th>Test MaxDD</th><th>Overfit</th></tr></thead>
              <tbody>
                {sorted.slice(0, 40).map((r, i) => (
                  r.error ? null : (
                    <tr key={i} data-testid={`result-row-${i}`}>
                      <td style={{ color: "#3b82f6" }}>#{i + 1}</td>
                      <td>{r.params?.sma_short}/{r.params?.sma_long}</td>
                      <td>{r.params?.roc_window}</td>
                      <td>{r.params?.atr_mult}</td>
                      <td>{((r.params?.vol_target || 0) * 100).toFixed(0)}%</td>
                      <td style={{ color: "#94a3b8" }}>{r.train_sharpe?.toFixed(3)}</td>
                      <td style={{ color: (r.test_sharpe ?? 0) > 0 ? "#10b981" : "#ef4444" }}>{r.test_sharpe?.toFixed(3)}</td>
                      <td style={{ color: (r.test_cagr ?? 0) > 0 ? "#10b981" : "#ef4444" }}>{((r.test_cagr ?? 0) * 100).toFixed(1)}%</td>
                      <td style={{ color: "#ef4444" }}>{((r.test_max_dd ?? 0) * 100).toFixed(1)}%</td>
                      <td style={{ color: (r.overfit_score ?? 0) > 0.5 ? "#ef4444" : "#64748b" }}>{r.overfit_score?.toFixed(2)}</td>
                    </tr>
                  )
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
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Optimizer Analysis</p>
            </div>
            <button onClick={handleAI} disabled={loadingAI} data-testid="ai-optimize-btn"
              style={{ padding: "4px 12px", fontSize: 10, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 2, cursor: loadingAI ? "not-allowed" : "pointer", transition: "background 0.1s" }}>
              {loadingAI ? "GENERATING…" : "GENERATE INSIGHT"}
            </button>
          </div>
          {aiSummary ? (
            <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Manrope,sans-serif", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiSummary}</p>
          ) : (
            <p style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>Generate an AI-powered explanation of what these optimization results mean.</p>
          )}
        </div>
      )}
    </div>
  );
}

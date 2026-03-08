import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ReferenceDot,
} from "recharts";
import { AlertTriangle, Zap, Play, RefreshCw, ShieldOff, Shield } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SURFACE = "#151921";
const BORDER = "#2a2f3a";

const LEVEL_CONFIG = {
  1: { label: "L1 · REDUCE 25%", color: "#f59e0b", badgeClass: "badge-l1", icon: "⚡" },
  2: { label: "L2 · REDUCE 50%", color: "#ef4444", badgeClass: "badge-l2", icon: "⚠" },
  3: { label: "L3 · GO TO CASH", color: "#ff4444", badgeClass: "badge-l3", icon: "☠" },
};

const TRIGGER_COLORS = {
  vol_shock: "#f59e0b",
  return_outlier: "#ef4444",
  turnover_spike: "#8b5cf6",
  dd_acceleration: "#ef4444",
};

export default function FrankensteinPage() {
  const [tickers] = useState(["SPY", "QQQ", "AAPL", "MSFT"]);
  const [status, setStatus] = useState("idle");
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
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
      pollRef.current = setInterval(() => poll(runId), 2500);
      return () => clearInterval(pollRef.current);
    }
  }, [status, runId, poll]);

  const handleRun = async () => {
    setResult(null); setError(null); setAiSummary(null); setSelectedEvent(null);
    try {
      const { data } = await axios.post(`${API}/backtest/run`, {
        tickers, frankenstein_check: true,
        params: { sma_short: 50, sma_long: 200, roc_window: 20, atr_mult: 2.0, vol_target: 0.12, max_leverage: 1.0 },
      });
      setRunId(data.run_id); setStatus("queued");
    } catch (e) { setError(e.response?.data?.detail || "Failed to start"); }
  };

  const handleAI = async () => {
    if (!runId) return;
    setLoadingAI(true);
    try {
      const { data } = await axios.post(`${API}/ai/summarize`, { run_id: runId, summary_type: "frankenstein" });
      setAiSummary(data.summary);
    } catch { setAiSummary("AI summary unavailable."); }
    finally { setLoadingAI(false); }
  };

  const isRunning = status === "queued" || status === "running";
  const events = result?.anomaly_events || [];
  const lvlCounts = events.reduce((acc, e) => { acc[e.level] = (acc[e.level] || 0) + 1; return acc; }, {});

  // Prepare equity curve data with event annotations
  const equityData = result?.equity_curve || [];
  const eventDates = new Set(events.map(e => e.date));

  return (
    <div className="p-6 space-y-4" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} color="#ef4444" strokeWidth={1.5} />
          <div>
            <h1 style={{ fontFamily: "Chivo,sans-serif", fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>Frankenstein Monitor</h1>
            <p style={{ fontSize: 11, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>Regime instability detection + progressive de-risking</p>
          </div>
        </div>
        <button onClick={handleRun} disabled={isRunning} data-testid="run-frankenstein-btn"
          className={isRunning ? "running-pulse" : ""}
          style={{ padding: "8px 20px", background: isRunning ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.9)", color: "#fff", border: "none", borderRadius: 2, fontSize: 11, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: isRunning ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.1s" }}>
          {isRunning ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> SCANNING…</> : <><Play size={12} /> RUN SCAN</>}
        </button>
      </div>

      {error && <p style={{ fontSize: 10, color: "#ef4444", fontFamily: "JetBrains Mono,monospace" }}>{error}</p>}

      {/* Detection signals explainer */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Volatility Shock", "Realized vol > 2.5× rolling median", "#f59e0b"],
          ["Return Outlier", "|Daily return| > 3 std devs", "#ef4444"],
          ["Turnover Spike", "Weekly turnover > 2.5× avg", "#8b5cf6"],
          ["DD Acceleration", "Drawdown slope < −0.5%/day", "#ef4444"],
        ].map(([title, desc, color]) => (
          <div key={title} style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2, borderLeft: `3px solid ${color}` }}>
            <p style={{ fontSize: 10, color, fontFamily: "JetBrains Mono,monospace", fontWeight: 600, marginBottom: 3 }}>{title}</p>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "Manrope,sans-serif", lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* Stats */}
      {result && (
        <div className="grid grid-cols-4 gap-3">
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2 }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase" }}>Total Events</p>
            <p style={{ fontSize: 28, fontFamily: "Chivo,sans-serif", fontWeight: 700, color: events.length > 0 ? "#ef4444" : "#10b981" }}>{events.length}</p>
          </div>
          {[1, 2, 3].map(l => (
            <div key={l} style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 12, borderRadius: 2 }}>
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase" }}>Level {l} Events</p>
              <p style={{ fontSize: 28, fontFamily: "Chivo,sans-serif", fontWeight: 700, color: LEVEL_CONFIG[l].color }}>{lvlCounts[l] || 0}</p>
              <p style={{ fontSize: 9, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>{LEVEL_CONFIG[l].label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Equity curve with event markers */}
      {equityData.length > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Equity Curve — Frankenstein Events Marked
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={equityData}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1a2030" vertical={false} />
              <XAxis dataKey="date" stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#2a2f3a" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "JetBrains Mono,monospace" }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "#151921", border: "1px solid #2a2f3a", fontSize: 11, fontFamily: "JetBrains Mono,monospace" }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
              {events.map((ev, i) => {
                const pt = equityData.find(d => d.date === ev.date);
                if (!pt) return null;
                return (
                  <ReferenceDot key={i} x={ev.date} y={pt.value}
                    r={5} fill={LEVEL_CONFIG[ev.level]?.color || "#ef4444"} stroke="none" />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            {[1, 2, 3].map(l => (
              <div key={l} className="flex items-center gap-1">
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL_CONFIG[l].color }} />
                <span style={{ fontSize: 9, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>Level {l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Log */}
      {result && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2 }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Event Log — {events.length} events detected
            </p>
          </div>
          {events.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-10">
              <Shield size={20} color="#10b981" strokeWidth={1.5} />
              <p style={{ fontSize: 12, color: "#10b981", fontFamily: "JetBrains Mono,monospace" }}>No Frankenstein events detected — strategy appears stable.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {events.map((ev, i) => {
                const cfg = LEVEL_CONFIG[ev.level] || LEVEL_CONFIG[1];
                const isSelected = selectedEvent === i;
                return (
                  <div key={i} onClick={() => setSelectedEvent(isSelected ? null : i)}
                    data-testid={`event-row-${i}`}
                    style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", background: isSelected ? "rgba(255,255,255,0.03)" : "transparent", transition: "background 0.1s" }}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 text-xs rounded-sm font-mono ${cfg.badgeClass}`} style={{ fontSize: 9, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "JetBrains Mono,monospace" }}>{ev.date}</span>
                        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>Action: <span style={{ color: cfg.color }}>{ev.action}</span></span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>
                          DD: <span style={{ color: "#ef4444" }}>{ev.drawdown_pct?.toFixed(1)}%</span>
                        </span>
                        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace" }}>
                          Equity: <span style={{ color: "#f8fafc" }}>${ev.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 space-y-1">
                        {ev.triggers.map((t, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span style={{ fontSize: 8, color: TRIGGER_COLORS[t.type] || "#94a3b8", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", marginTop: 2, minWidth: 90 }}>{t.type}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Manrope,sans-serif" }}>{t.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      {result && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, padding: 16, borderRadius: 2 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={13} color="#f59e0b" strokeWidth={1.5} />
              <p style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono,monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Frankenstein Analysis</p>
            </div>
            <button onClick={handleAI} disabled={loadingAI} data-testid="ai-frankenstein-btn"
              style={{ padding: "4px 12px", fontSize: 10, fontFamily: "Chivo,sans-serif", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 2, cursor: loadingAI ? "not-allowed" : "pointer", transition: "background 0.1s" }}>
              {loadingAI ? "GENERATING…" : "EXPLAIN EVENTS"}
            </button>
          </div>
          {aiSummary ? (
            <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Manrope,sans-serif", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiSummary}</p>
          ) : (
            <p style={{ fontSize: 11, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>Get an AI explanation of what triggered these Frankenstein events and how the safety mechanism responded.</p>
          )}
        </div>
      )}

      {/* Placeholder when no run */}
      {!result && !isRunning && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <ShieldOff size={40} color="#2a2f3a" strokeWidth={1} />
          <p style={{ fontSize: 13, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>Run a scan to detect regime instability events</p>
        </div>
      )}
    </div>
  );
}

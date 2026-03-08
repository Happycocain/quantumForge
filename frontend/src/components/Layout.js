import { NavLink } from "react-router-dom";
import { BarChart2, Activity, AlertTriangle, TrendingUp, Terminal } from "lucide-react";

const navItems = [
  { to: "/",             icon: BarChart2,    label: "Dashboard" },
  { to: "/research",     icon: Activity,     label: "Research" },
  { to: "/frankenstein", icon: AlertTriangle, label: "Frankenstein" },
  { to: "/walkforward",  icon: TrendingUp,   label: "Walk-Forward" },
];

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen" style={{ background: "#0b0e14" }}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className="flex flex-col"
        style={{
          width: 220,
          minWidth: 220,
          background: "#0d1017",
          borderRight: "1px solid #2a2f3a",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4" style={{ borderBottom: "1px solid #2a2f3a" }}>
          <Terminal size={16} color="#3b82f6" strokeWidth={1.5} />
          <span style={{ fontFamily: "Chivo,sans-serif", fontWeight: 700, fontSize: 13, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            ForgeQuant
          </span>
          <span style={{ fontFamily: "Chivo,sans-serif", fontWeight: 400, fontSize: 11, color: "#64748b", marginTop: 1 }}>
            Lab
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-2 pt-3 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-xs font-semibold tracking-wide rounded-sm cursor-pointer ${
                  isActive ? "nav-active" : "text-[#64748b] hover:text-[#94a3b8] hover:bg-white/5"
                }`
              }
              data-testid={`nav-${label.toLowerCase().replace(/ /g, "-")}`}
              style={{ fontFamily: "Manrope,sans-serif", transition: "color 0.1s, background 0.1s" }}
            >
              <Icon size={14} strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3" style={{ borderTop: "1px solid #2a2f3a" }}>
          <p style={{ fontSize: 9, color: "#334155", fontFamily: "JetBrains Mono,monospace", lineHeight: 1.5 }}>
            EDUCATIONAL USE ONLY<br />NOT INVESTMENT ADVICE
          </p>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="flex-1 overflow-auto" style={{ minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}

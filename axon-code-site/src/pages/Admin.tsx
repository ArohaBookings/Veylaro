import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { GlowCard, CountUp, Reveal } from "../components/FX";
import { VeylaroMark } from "../components/Logo";
import { AdminGate } from "../components/AdminGate";
import { InterestAdminPanel } from "../components/Interest";
import {
  Users, DownloadIcon, Gauge, Globe, Apple, Windows, Refresh, Shield, Bolt, Eye, TerminalIcon,
} from "../components/Icons";

/* =================== mock data =================== */
const DAILY_DOWNLOADS = [
  310, 342, 355, 328, 396, 441, 462, 430, 458, 490, 515, 549, 522, 561, 590,
  612, 648, 631, 672, 699, 748, 792, 761, 823, 867, 905, 948, 1004, 1082, 1146,
];
const DAILY_MRR = [
  52.1, 52.8, 53.2, 53.9, 54.6, 55.1, 55.8, 56.7, 57.2, 58.1, 58.9, 59.6, 60.2, 61.4, 62.1,
  62.8, 63.9, 64.5, 65.8, 66.4, 67.2, 68.1, 68.8, 69.7, 70.3, 71.2, 71.8, 72.4, 72.9, 73.1,
];

const COUNTRIES: [string, number][] = [
  ["United States", 34], ["Germany", 11], ["United Kingdom", 9], ["India", 8],
  ["Australia", 6], ["Canada", 5], ["Japan", 5], ["Brazil", 4], ["Other", 18],
];

const RECENT_USERS = [
  ["Mia Chen", "mia@lumenlabs.dev", "Pro", "macOS", "Active", "2 min ago"],
  ["Jonas Weber", "jonas@webercode.de", "Free", "Windows", "Active", "11 min ago"],
  ["Priya Nair", "priya.n@stackforge.io", "Pro", "macOS", "Trial", "26 min ago"],
  ["Tom Okafor", "tom@okafor.dev", "Pro", "Windows", "Active", "38 min ago"],
  ["Sofia Ricci", "sofia@riccistudio.it", "Free", "macOS", "Active", "1 hr ago"],
  ["Daniel Kim", "dkim@parallax.app", "Team", "macOS", "Active", "1 hr ago"],
  ["Lena Fischer", "lena@fischer.codes", "Pro", "Windows", "Past due", "2 hrs ago"],
  ["Arjun Patel", "arjun@nimbusworks.in", "Free", "Windows", "Active", "2 hrs ago"],
  ["Grace Liu", "grace@liu.engineering", "Pro", "macOS", "Active", "3 hrs ago"],
  ["Omar Haddad", "omar@haddad.dev", "Free", "macOS", "Churned", "4 hrs ago"],
];

const TRANSACTIONS = [
  ["#INV-8841", "Mia Chen", "Pro · annual", "$290.00", "Paid", "Today 14:22"],
  ["#INV-8840", "Daniel Kim", "Team · monthly", "$119.00", "Paid", "Today 13:05"],
  ["#INV-8839", "Tom Okafor", "Pro · monthly", "$29.00", "Paid", "Today 11:48"],
  ["#INV-8838", "Lena Fischer", "Pro · monthly", "$29.00", "Failed", "Today 10:12"],
  ["#INV-8837", "Priya Nair", "Pro · annual", "$290.00", "Paid", "Yesterday"],
  ["#INV-8836", "Ravi Shah", "Pro · monthly", "$29.00", "Refunded", "Yesterday"],
];

const TICKETS = [
  ["#4821", "Model won't load on M1 8GB", "Priya Nair", "Open", "High", "26 min"],
  ["#4820", "Annual invoice needs VAT ID", "Jonas Weber", "Open", "Low", "2 hrs"],
  ["#4819", "Index stuck at 97% on monorepo", "Daniel Kim", "In progress", "High", "5 hrs"],
  ["#4818", "Feature: JetBrains plugin?", "Grace Liu", "Open", "Med", "9 hrs"],
  ["#4817", "License moved to new laptop", "Tom Okafor", "Resolved", "Med", "1 day"],
  ["#4816", "Crash when pasting 40MB log", "Sofia Ricci", "Resolved", "High", "1 day"],
];

const VERSIONS: [string, number][] = [["v2.1.4", 58], ["v2.1.0", 24], ["v2.0.2", 11], ["≤ v2.0.0", 7]];
const FEED = [
  ["#dfa876", "New Pro subscription — mia@lumenlabs.dev (annual)", "14:22"],
  ["#b06a3a", "Download — macOS arm64 · Berlin, DE", "14:21"],
  ["#34d399", "Trial converted — dkim@parallax.app → Team", "14:17"],
  ["#b06a3a", "Download — Windows x64 · Austin, US", "14:16"],
  ["#f87171", "Payment failed — lena@fischer.codes (card expired)", "14:09"],
  ["#b06a3a", "Download — macOS arm64 · Sydney, AU", "14:05"],
  ["#dfa876", "New Pro trial started — priya.n@stackforge.io", "13:58"],
  ["#fbbf24", "Support ticket opened — #4821 model load M1", "13:54"],
  ["#b06a3a", "Download — Windows x64 · Mumbai, IN", "13:49"],
  ["#34d399", "Refund processed — #INV-8836", "13:41"],
];

/* =================== tiny chart components =================== */
function AreaChart({ data, color = "#d89a66", height = 180, suffix = "" }: { data: number[]; color?: string; height?: number; suffix?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const w = 600, h = height, pad = 6;
  const min = Math.min(...data) * 0.92, max = Math.max(...data) * 1.04;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / (max - min)) * (h - pad * 2),
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w - pad},${h - pad} L${pad},${h - pad} Z`;
  const gid = useMemo(() => `ag${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <svg ref={ref} viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad} x2={w - pad} y1={h * f} y2={h * f} stroke="rgba(255,255,255,0.05)" />
      ))}
      <path d={area} fill={`url(#${gid})`} opacity={on ? 1 : 0} style={{ transition: "opacity 1.4s ease 0.5s" }} />
      <path
        d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={1400} strokeDashoffset={on ? 0 : 1400}
        style={{ transition: "stroke-dashoffset 2s var(--ease-out)" }}
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4.5" fill={color} opacity={on ? 1 : 0} style={{ transition: "opacity 0.4s ease 1.8s" }}>
        <animate attributeName="r" values="4.5;6.5;4.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={w - pad - 8} y={Math.max(16, pts[pts.length - 1][1] - 12)} textAnchor="end" fill={color} fontSize="13" fontFamily="var(--font-mono)" fontWeight="600" opacity={on ? 1 : 0} style={{ transition: "opacity 0.4s ease 1.9s" }}>
        {data[data.length - 1].toLocaleString()}{suffix}
      </text>
    </svg>
  );
}

function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
      <svg viewBox="0 0 140 140" style={{ width: 150, flexShrink: 0 }}>
        {slices.map((s) => {
          const frac = s.value / total;
          const dash = `${frac * C} ${C}`;
          const rot = (acc / total) * 360 - 90;
          acc += s.value;
          return (
            <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={dash} transform={`rotate(${rot} 70 70)`} strokeLinecap="butt" opacity="0.9" />
          );
        })}
        <text x="70" y="66" textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700" fontFamily="var(--font-display)">{total}%</text>
        <text x="70" y="84" textAnchor="middle" fill="var(--dim)" fontSize="9.5">of fleet</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
            <span style={{ color: "var(--muted)" }}>{s.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--dim)", marginLeft: 8 }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({ rows, suffix = "%" }: { rows: [string, number][]; suffix?: string }) {
  const max = Math.max(...rows.map((r) => r[1]));
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.2 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref}>
      {rows.map(([label, v]) => (
        <div className="hbar-row" key={label}>
          <span style={{ color: "var(--muted)" }}>{label}</span>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: on ? `${(v / max) * 100}%` : 0 }} /></div>
          <span>{v}{suffix}</span>
        </div>
      ))}
    </div>
  );
}

const statusBadge = (s: string) =>
  s === "Active" || s === "Paid" || s === "Resolved" ? "green"
    : s === "Trial" || s === "In progress" ? "violet"
    : s === "Past due" || s === "Failed" || s === "Open" ? "amber"
    : "dim";

/* =================== views =================== */
// Day one: no data yet. Flip to true when real analytics are wired.
const LAUNCHED = false;

function ZeroView({ kpis, note }: { kpis: [string, string | number][]; note?: string }) {
  return (
    <>
      <div className="kpis">
        {kpis.map(([label, val]) => (
          <GlowCard className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{val}</div>
            <div className="kpi-delta" style={{ color: "var(--dim)" }}>— no data yet</div>
          </GlowCard>
        ))}
      </div>
      <GlowCard className="panel" style={{ marginTop: 16, textAlign: "center", padding: "52px 24px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 21, marginBottom: 8 }}>You're at the starting line. ✦</div>
        <p style={{ color: "var(--dim)", fontSize: 14, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          {note || "Every metric is reset to zero — this is day one. Live numbers appear here the moment Veylaro launches and real users arrive. Watch the Register interest tab fill up first."}
        </p>
      </GlowCard>
    </>
  );
}

function Overview() {
  if (!LAUNCHED) return <ZeroView kpis={[["Total users", 0], ["Downloads", 0], ["MRR", "$0"], ["Paying subs", 0]]} />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">Total users <Users size={15} /></div><div className="kpi-value"><CountUp to={48213} /></div><div className="kpi-delta up">▲ 12.4% vs last 30d</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Downloads <DownloadIcon size={15} /></div><div className="kpi-value"><CountUp to={61842} /></div><div className="kpi-delta up">▲ 18.1% vs last 30d</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">MRR <Gauge size={15} /></div><div className="kpi-value"><CountUp to={73080} prefix="$" /></div><div className="kpi-delta up">▲ 8.9% vs last 30d</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Paying subs <Shield size={15} /></div><div className="kpi-value"><CountUp to={2520} /></div><div className="kpi-delta up">▲ 6.2% · 5.2% free→pro conv.</div></GlowCard>
      </div>

      <div className="admin-grid">
        <GlowCard className="panel">
          <h4>Downloads — last 30 days <span className="hint">daily, all platforms</span></h4>
          <AreaChart data={DAILY_DOWNLOADS} color="#d89a66" />
        </GlowCard>
        <GlowCard className="panel">
          <h4>Live activity <span className="badge green">● live</span></h4>
          <div className="feed">
            {FEED.map(([c, t, time], i) => (
              <div className="feed-item" key={i} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="feed-dot" style={{ background: c as string }} />
                <span>{t}</span>
                <time>{time}</time>
              </div>
            ))}
          </div>
        </GlowCard>
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <GlowCard className="panel">
          <h4>Platform split</h4>
          <Donut slices={[
            { label: "macOS · Apple Silicon", value: 57, color: "#d89a66" },
            { label: "Windows · GPU", value: 31, color: "#b06a3a" },
            { label: "Windows · CPU", value: 12, color: "#3a322c" },
          ]} />
        </GlowCard>
        <GlowCard className="panel">
          <h4>Version adoption</h4>
          <HBars rows={VERSIONS} />
        </GlowCard>
        <GlowCard className="panel">
          <h4>Top countries <span className="hint">by downloads</span></h4>
          <HBars rows={COUNTRIES.slice(0, 6)} />
        </GlowCard>
      </div>

      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Recent signups <span className="hint">latest 10</span></h4>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>User</th><th>Email</th><th>Plan</th><th>Platform</th><th>Status</th><th>Seen</th></tr></thead>
            <tbody>
              {RECENT_USERS.map((u) => (
                <tr key={u[1]}>
                  <td>{u[0]}</td><td>{u[1]}</td>
                  <td><span className={`badge ${u[2] === "Free" ? "dim" : "violet"}`}>{u[2]}</span></td>
                  <td>{u[3] === "macOS" ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Apple size={13} /> macOS</span> : <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Windows size={12} /> Windows</span>}</td>
                  <td><span className={`badge ${statusBadge(u[4])}`}>{u[4]}</span></td>
                  <td>{u[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlowCard>
    </>
  );
}

function UsersView() {
  const [q, setQ] = useState("");
  const rows = RECENT_USERS.filter((u) => (u[0] + u[1] + u[2] + u[4]).toLowerCase().includes(q.toLowerCase()));
  if (!LAUNCHED) return <ZeroView kpis={[["Free tier", 0], ["Pro", 0], ["Team seats", 0], ["30-day churn", "—"]]} />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">Free tier</div><div className="kpi-value"><CountUp to={45693} /></div><div className="kpi-delta up">▲ 13.0%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Pro</div><div className="kpi-value"><CountUp to={2341} /></div><div className="kpi-delta up">▲ 6.4%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Team seats</div><div className="kpi-value"><CountUp to={179} /></div><div className="kpi-delta up">▲ 3.8%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">30-day churn</div><div className="kpi-value">2.1%</div><div className="kpi-delta up">▼ 0.4 pts — improving</div></GlowCard>
      </div>
      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>
          All users
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, plan…"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", color: "var(--text)", fontSize: 13, outline: "none", width: 240, fontFamily: "var(--font-body)" }}
          />
        </h4>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>User</th><th>Email</th><th>Plan</th><th>Platform</th><th>Status</th><th>Last seen</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u[1]}>
                  <td>{u[0]}</td><td>{u[1]}</td>
                  <td><span className={`badge ${u[2] === "Free" ? "dim" : "violet"}`}>{u[2]}</span></td>
                  <td>{u[3]}</td>
                  <td><span className={`badge ${statusBadge(u[4])}`}>{u[4]}</span></td>
                  <td>{u[5]}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}>No users match "{q}"</td></tr>}
            </tbody>
          </table>
        </div>
      </GlowCard>
    </>
  );
}

function DownloadsView() {
  if (!LAUNCHED) return <ZeroView kpis={[["Total downloads", 0], ["Today", 0], ["Install completion", "—"], ["Download → weekly active", "—"]]} />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">Total downloads</div><div className="kpi-value"><CountUp to={61842} /></div><div className="kpi-delta up">▲ 18.1%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Today</div><div className="kpi-value"><CountUp to={1146} /></div><div className="kpi-delta up">▲ 5.9% vs yesterday</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Install completion</div><div className="kpi-value">94.2%</div><div className="kpi-delta up">▲ 1.1 pts</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Download → weekly active</div><div className="kpi-value">61%</div><div className="kpi-delta up">▲ 2.3 pts</div></GlowCard>
      </div>
      <div className="admin-grid">
        <GlowCard className="panel">
          <h4>Daily downloads <span className="hint">30 days</span></h4>
          <AreaChart data={DAILY_DOWNLOADS} color="#b06a3a" />
        </GlowCard>
        <GlowCard className="panel">
          <h4>By geography</h4>
          <HBars rows={COUNTRIES} />
        </GlowCard>
      </div>
      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <GlowCard className="panel">
          <h4>Platform split</h4>
          <Donut slices={[
            { label: "macOS .dmg", value: 57, color: "#d89a66" },
            { label: "Windows .exe", value: 43, color: "#b06a3a" },
          ]} />
        </GlowCard>
        <GlowCard className="panel">
          <h4>Acquisition source <span className="hint">last 30d</span></h4>
          <HBars rows={[["Direct / word of mouth", 38], ["X / Twitter", 22], ["YouTube reviews", 16], ["Search", 13], ["Hacker News", 7], ["Other", 4]]} />
        </GlowCard>
      </div>
    </>
  );
}

function RevenueView() {
  if (!LAUNCHED) return <ZeroView kpis={[["MRR", "$0"], ["ARR run-rate", "$0"], ["ARPU", "$0"], ["Annual plan share", "—"]]} note="Revenue starts counting the moment your first Stripe subscription lands. Pricing is live; the counter is at zero." />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">MRR</div><div className="kpi-value"><CountUp to={73080} prefix="$" /></div><div className="kpi-delta up">▲ 8.9%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">ARR run-rate</div><div className="kpi-value"><CountUp to={876960} prefix="$" /></div><div className="kpi-delta up">▲ 8.9%</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">ARPU</div><div className="kpi-value">$29.00</div><div className="kpi-delta up">flat by design</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Annual plan share</div><div className="kpi-value">41%</div><div className="kpi-delta up">▲ 4.0 pts</div></GlowCard>
      </div>
      <div className="admin-grid">
        <GlowCard className="panel">
          <h4>MRR — last 30 days <span className="hint">$k</span></h4>
          <AreaChart data={DAILY_MRR} color="#34d399" suffix="k" />
        </GlowCard>
        <GlowCard className="panel">
          <h4>MRR by plan</h4>
          <HBars rows={[["Pro monthly", 46], ["Pro annual", 33], ["Team", 18], ["Other", 3]]} />
          <p className="footnote" style={{ marginTop: 16 }}>Team beta expanding this quarter — expected to reach ~30% of MRR by year end.</p>
        </GlowCard>
      </div>
      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Recent transactions</h4>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {TRANSACTIONS.map((t) => (
                <tr key={t[0]}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{t[0]}</td>
                  <td>{t[1]}</td><td>{t[2]}</td><td>{t[3]}</td>
                  <td><span className={`badge ${statusBadge(t[4])}`}>{t[4]}</span></td>
                  <td>{t[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlowCard>
    </>
  );
}

function ReleasesView() {
  if (!LAUNCHED) return <ZeroView kpis={[["Current version", "v1.0.0"], ["Fleet on latest", "—"], ["Update opt-in rate", "—"], ["Crash-free sessions", "—"]]} note="v1.0.0 is the launch build. Fleet health numbers appear once installs are out in the wild." />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">Current version</div><div className="kpi-value">v2.1.4</div><div className="kpi-delta up">shipped Jul 2</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Fleet on latest</div><div className="kpi-value">58%</div><div className="kpi-delta up">▲ 9 pts this week</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Update opt-in rate</div><div className="kpi-value">87%</div><div className="kpi-delta up">▲ 1.2 pts</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Crash-free sessions</div><div className="kpi-value">99.7%</div><div className="kpi-delta up">▲ 0.1 pts</div></GlowCard>
      </div>
      <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <GlowCard className="panel">
          <h4>Version adoption</h4>
          <HBars rows={VERSIONS} />
        </GlowCard>
        <GlowCard className="panel">
          <h4>Model variants in the fleet</h4>
          <HBars rows={[["Veylaro-2 Large (24 GB+)", 22], ["Veylaro-2 (16 GB)", 51], ["Veylaro-2 Compact (8 GB)", 27]]} />
          <p className="footnote" style={{ marginTop: 16 }}>Variant is auto-selected by hardware. Reported via opt-in crash/health pings only — never tied to usage content.</p>
        </GlowCard>
      </div>
    </>
  );
}

function SupportView() {
  if (!LAUNCHED) return <ZeroView kpis={[["Open tickets", 0], ["Median first response", "—"], ["CSAT (30d)", "—"], ["Refund rate", "—"]]} />;
  return (
    <>
      <div className="kpis">
        <GlowCard className="kpi"><div className="kpi-label">Open tickets</div><div className="kpi-value"><CountUp to={14} /></div><div className="kpi-delta down">▲ 3 today</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Median first response</div><div className="kpi-value">2.4h</div><div className="kpi-delta up">▼ 0.8h</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">CSAT (30d)</div><div className="kpi-value">4.8/5</div><div className="kpi-delta up">▲ 0.1</div></GlowCard>
        <GlowCard className="kpi"><div className="kpi-label">Refund rate</div><div className="kpi-value">1.3%</div><div className="kpi-delta up">▼ 0.2 pts</div></GlowCard>
      </div>
      <GlowCard className="panel" style={{ marginTop: 16 }}>
        <h4>Ticket queue</h4>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>ID</th><th>Subject</th><th>User</th><th>Status</th><th>Priority</th><th>Age</th></tr></thead>
            <tbody>
              {TICKETS.map((t) => (
                <tr key={t[0]}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{t[0]}</td>
                  <td>{t[1]}</td><td>{t[2]}</td>
                  <td><span className={`badge ${statusBadge(t[3])}`}>{t[3]}</span></td>
                  <td><span className={`badge ${t[4] === "High" ? "amber" : "dim"}`}>{t[4]}</span></td>
                  <td>{t[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlowCard>
    </>
  );
}

/* =================== shell =================== */
const VIEWS = [
  { id: "interest", label: "Register interest", icon: <Globe size={16} /> },
  { id: "overview", label: "Overview", icon: <Gauge size={16} /> },
  { id: "users", label: "Users", icon: <Users size={16} /> },
  { id: "downloads", label: "Downloads", icon: <DownloadIcon size={16} /> },
  { id: "revenue", label: "Revenue", icon: <Bolt size={16} /> },
  { id: "releases", label: "Releases", icon: <Refresh size={16} /> },
  { id: "support", label: "Support", icon: <Eye size={16} /> },
] as const;

export function Admin() {
  return <AdminGate>{(user, logout) => <AdminInner userEmail={user.email || ""} logout={logout} />}</AdminGate>;
}

function AdminInner({ userEmail, logout }: { userEmail: string; logout: () => void }) {
  const [view, setView] = useState<string>("interest");
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px 16px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          <VeylaroMark size={26} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)", letterSpacing: "0.06em" }}>MISSION CONTROL</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{userEmail}</div>
          </div>
        </div>
        <div className="side-label">Analytics</div>
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)}>
            {v.icon} {v.label}
          </button>
        ))}
        <div className="side-label">Environment</div>
        <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="badge green">● API healthy</span>
          <span className="badge green">● Payments live</span>
          <span className="badge violet">● CDN 12 regions</span>
        </div>
      </aside>

      <div className="admin-main">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26 }}>{VIEWS.find((v) => v.id === view)?.label}</h1>
            <p style={{ color: "var(--dim)", fontSize: 13.5 }}>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · pre-launch — starting from zero</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {/* mobile view switcher */}
            <select
              value={view}
              onChange={(e) => setView(e.target.value)}
              className="admin-mobile-switch"
              style={{ background: "rgba(255,255,255,0.05)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 13.5 }}
            >
              {VIEWS.map((v) => <option key={v.id} value={v.id} style={{ color: "#000" }}>{v.label}</option>)}
            </select>
            {view !== "interest" && <span className="badge amber" style={{ alignSelf: "center" }}>Sample data — real analytics land with launch</span>}
            {view === "interest" && <span className="badge green" style={{ alignSelf: "center" }}>● Live — Supabase</span>}
            <button className="btn ghost sm" style={{ alignSelf: "center" }} onClick={logout}>Sign out</button>
          </div>
        </div>

        {view === "interest" && <InterestAdminPanel />}
        {view === "overview" && <Overview />}
        {view === "users" && <UsersView />}
        {view === "downloads" && <DownloadsView />}
        {view === "revenue" && <RevenueView />}
        {view === "releases" && <ReleasesView />}
        {view === "support" && <SupportView />}
      </div>
    </div>
  );
}

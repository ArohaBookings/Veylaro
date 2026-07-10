import { useStore } from "../state/store";
import { UsageRing } from "./widgets";
import { FileIc, FolderIc, LogOut, Plus, User, Gear } from "./icons";

export function Sidebar({
  onNewSession,
  onSignIn,
  onSettings,
  onUpgrade,
  onIntelligence,
}: {
  onNewSession: () => void;
  onSignIn: () => void;
  onSettings: () => void;
  onUpgrade: () => void;
  onIntelligence: () => void;
}) {
  const store = useStore();
  const { sessions, activeId, account, active } = store;

  const files = active ? Object.values(active.files) : [];
  const plan = account?.plan ?? "free";

  return (
    <aside className="side">
      <div className="side-top">
        <button className="btn primary" onClick={onNewSession}>
          <Plus size={15} /> New session
        </button>
      </div>

      <div className="side-label">Sessions</div>
      <div className="sess-list">
        {sessions.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 12.5, padding: "4px 10px" }}>
            Nothing yet. Start a session and point Laro at a file.
          </div>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`sess ${s.id === activeId ? "on" : ""}`}
            onClick={() => store.selectSession(s.id)}
            role="button"
          >
            {s.scopeKind === "folder" ? <FolderIc size={14} /> : <FileIc size={14} />}
            <span className="t">{s.title}</span>
            <button
              className="x"
              aria-label={`Delete ${s.title}`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete session "${s.title}"?`)) store.deleteSession(s.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <>
          <div className="side-label">Working on</div>
          <div className="activity">
            {files.map((f) => (
              <div key={f.path} className={`file-row ${f.active ? "working" : ""}`}>
                {f.active ? <span className="work-dot" /> : f.verified ? <span className="ok-dot" /> : <span className="idle-dot" />}
                <span className="path" title={f.path}>{f.path}</span>
                <span className="plus">+{f.plus}</span>
                <span className="minus">−{f.minus}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="account">
        <UsageRing />
        {plan === "free" && (
          <button className="btn ghost sm" onClick={onUpgrade}>
            ✦ Unlock unlimited — Pro
          </button>
        )}
        {account ? (
          <div className="acct-row">
            <span className="avatar">{account.name.slice(0, 1).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div className="acct-name">{account.name}</div>
              <div className="acct-mail">{account.email}</div>
            </div>
            <span className={`plan-pill ${plan}`}>{plan}</span>
            <button className="icon-btn" title="Sign out" onClick={() => store.signOut()} style={{ width: 30, height: 30 }}>
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button className="btn ghost" onClick={onSignIn}>
            <User size={14} /> Sign in to your Veylaro account
          </button>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={onIntelligence}>
            ⚡ Intelligence
          </button>
          <button className="btn ghost sm" style={{ flex: 1 }} onClick={onSettings}>
            <Gear size={13} /> Settings
          </button>
        </div>
      </div>
    </aside>
  );
}

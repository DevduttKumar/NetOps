import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import NetOpsLogo from "./NetOpsLogo";
import { useAuth } from "./RequireAuth";
import { BACKEND } from "../config";

const NAV = [
  { id: "network", label: "Network Setting", icon: "🌐" },
  { id: "ntp", label: "NTP Synchronization", icon: "⏱️" },
  { id: "snmp", label: "SNMP & Monitoring", icon: "📡" },
  { id: "system", label: "System Settings", icon: "⚙️" },
];

function fmtBootTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }) + ", " +
      d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
}

export default function Sidebar() {
  const { role, username } = useAuth();
  const isAdmin = role === "admin";

  const [bootTime, setBootTime] = useState(null);
  const [rebootPending, setRebootPending] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("app_theme") || "light");

  // Secret Admin Audit Log State
  const [showSecretLogs, setShowSecretLogs] = useState(false);
  const [secretLogs, setSecretLogs] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === "light" ? "dark" : "light"));

  useEffect(() => {
    const load = () => {
      axios.get(`${BACKEND}/api/system-info`, { withCredentials: true }).then(r => setBootTime(r.data?.boot_time || null)).catch(() => { });
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Secret hotkey trigger: Ctrl + Shift + L
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        openSecretLogs();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdmin]);

  const openSecretLogs = () => {
    if (!isAdmin) return;
    setLogLoading(true);
    axios.get(`${BACKEND}/api/login-logs`)
      .then(r => {
        setSecretLogs(r.data || []);
        setShowSecretLogs(true);
      })
      .catch(() => { })
      .finally(() => setLogLoading(false));
  };

  const confirmReboot = () => {
    setRebootPending(false);
    setRebooting(true);
    axios.post(`${BACKEND}/api/reboot`).catch(() => { }).finally(() => {
      setTimeout(() => { window.location.href = "/"; }, 1500);
    });
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-logo" style={{ paddingBottom: "14px" }}>
        <NetOpsLogo height={42} />
      </div>

      {/* ── USER INFO CARD ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)", marginBottom: "8px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--blue-dim)", color: "var(--blue-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: "0.85rem"
          }}>
            {(username || "U")[0].toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "var(--txt)" }}>{username || "User"}</span>
            <span style={{ fontSize: "0.68rem", color: "var(--txt-3)", textTransform: "capitalize" }}>{role || "viewer"}</span>
          </div>
        </div>
        <span className={`pill ${isAdmin ? "online" : "warning"}`} style={{ padding: "2px 8px", fontSize: "0.64rem" }}>
          {isAdmin ? "Admin" : "User"}
        </span>
      </div>

      {/* ── LAST BOOT TELEMETRY ── */}
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "var(--txt-3)",
        textAlign: "center", padding: "10px 12px", background: "var(--bg-subtle)",
        borderRadius: "var(--radius-sm)", marginBottom: "14px", border: "1px solid var(--border)"
      }}>
        <div style={{ letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px", fontSize: "0.64rem", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <span>🕒</span>
          <span>Last System Boot</span>
        </div>
        <div style={{ color: "var(--txt)", fontWeight: 600, fontSize: "0.8rem" }}>{fmtBootTime(bootTime)}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
        {NAV.map(({ id, label, icon }) => (
          <NavLink
            key={id}
            to={`/${id}`}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}
          >
            <span style={{ fontSize: "1.05rem", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", width: "22px" }}>
              {icon}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
        <button className="theme-toggle-btn" onClick={toggleTheme}>
          <span>{theme === "light" ? "☀️ Light" : "🌙 Dark"}</span>
        </button>

        {isAdmin && (
          <button
            className="nav-item"
            style={{ color: "var(--amber)", display: "flex", alignItems: "center", gap: "10px" }}
            onClick={() => setRebootPending(true)}
            disabled={rebooting}
          >
            <span style={{ fontSize: "1rem", lineHeight: 1, width: "22px", textAlign: "center" }}>🔄</span>
            <span>{rebooting ? "Rebooting…" : "Reboot System"}</span>
          </button>
        )}

        <button
          className="nav-item"
          style={{ color: "var(--red)", cursor: "pointer", textAlign: "left", width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", gap: "10px" }}
          onClick={async () => {
            try {
              await axios.post(`${BACKEND}/api/logout`, {}, { withCredentials: true, timeout: 2000 });
            } catch (err) {
              console.error(err);
            } finally {
              window.location.href = "/login";
            }
          }}
        >
          <span style={{ fontSize: "1rem", lineHeight: 1, width: "22px", textAlign: "center" }}>🚪</span>
          <span>Sign Out</span>
        </button>

        {/* Discreet footer: double-clicking 'Console v1.0' triggers secret log viewer */}
        <div className="sidebar-footer" style={{ userSelect: "none", cursor: isAdmin ? "pointer" : "default" }} onDoubleClick={openSecretLogs} title={isAdmin ? "Double click to inspect audit trail" : ""}>
          <span>Console</span>
          <span>v1.0</span>
        </div>
      </div>

      {/* Reboot Modal */}
      {rebootPending && (
        <div className="modal-overlay" onClick={() => setRebootPending(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ color: "var(--txt)", fontWeight: 700, fontSize: "1.15rem", marginBottom: 10 }}>Confirm System Reboot</div>
            {/* <p style={{ color: "var(--txt-2)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: 22 }}> */}
              {/* The system will restart immediately. */}
            {/* </p> */}
            <div className="btn-row">
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={confirmReboot}>Reboot Now</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRebootPending(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SECRET ADMIN AUDIT LOG MODAL ── */}
      {showSecretLogs && (
        <div className="modal-overlay" onClick={() => setShowSecretLogs(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 720, width: "95%", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--txt)" }}>Confidential Login Audit Trail</div>
                <div style={{ fontSize: "0.75rem", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Restricted to Administrator Access</div>
              </div>
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.78rem", padding: "4px 12px" }}
                onClick={openSecretLogs}
                disabled={logLoading}
              >
                Refresh
              </button>
            </div>

            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
              {secretLogs.length === 0 ? (
                <div style={{ color: "var(--txt-3)", fontSize: "0.85rem", padding: "16px 0", textAlign: "center" }}>
                  No login history recorded.
                </div>
              ) : (
                secretLogs.map((log, idx) => {
                  const isSuccess = log.status === "SUCCESS";
                  return (
                    <div
                      key={idx}
                      style={{
                        background: "var(--bg-subtle)",
                        borderLeft: `3px solid ${isSuccess ? "var(--green)" : "var(--red)"}`,
                        borderTop: "1px solid var(--border)",
                        borderRight: "1px solid var(--border)",
                        borderBottom: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <span className={`pill ${isSuccess ? "online" : "offline"}`} style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                          {log.status}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--txt)" }}>
                          {log.username}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--txt-3)" }}>
                          {log.ip}
                        </span>
                        {log.reason && (
                          <span style={{ fontSize: "0.75rem", color: "var(--red)", fontStyle: "italic" }}>
                            ({log.reason})
                          </span>
                        )}
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--txt-3)" }}>
                        {new Date(log.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setShowSecretLogs(false)}>
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
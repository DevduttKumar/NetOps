import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAuth } from "./RequireAuth";

const BACKEND = `${window.location.protocol}//${window.location.hostname}:5050`;

const TRAP_CATEGORIES = [
  { id: "ip_change", label: "IP Change", icon: "🌐", color: "var(--blue-primary)", bg: "var(--blue-dim)" },
  { id: "time_sync", label: "Time Sync", icon: "⏱️", color: "#6366f1", bg: "rgba(99, 102, 241, 0.12)" },
  { id: "new_login", label: "New Login", icon: "👤", color: "var(--green)", bg: "var(--green-dim)" },
  { id: "new_signup", label: "New Signup", icon: "📝", color: "var(--amber)", bg: "var(--amber-dim)" }
];

function getTrapMeta(message = "") {
  const m = message.toUpperCase();
  if (m.includes("IP CHANGE") || m.includes("INTERFACE") || m.includes("NETWORK")) {
    return {
      type: "ip_change",
      label: "IP Change",
      color: "var(--blue-primary)",
      bg: "var(--blue-dim)",
      icon: "🌐"
    };
  }
  if (m.includes("TIME SYNC") || m.includes("NTP") || m.includes("AUTO-SYNC") || m.includes("SYNCHRONIZED") || m.includes("MANUAL TIME")) {
    return {
      type: "time_sync",
      label: "Time Sync",
      color: "#6366f1",
      bg: "rgba(99, 102, 241, 0.12)",
      icon: "⏱️"
    };
  }
  if (m.includes("NEW LOGIN") || m.includes("LOGGED IN") || m.includes("AUTH")) {
    return {
      type: "new_login",
      label: "New Login",
      color: "var(--green)",
      bg: "var(--green-dim)",
      icon: "👤"
    };
  }
  if (m.includes("NEW SIGNUP") || m.includes("ACCOUNT CREATED") || m.includes("SIGNUP")) {
    return {
      type: "new_signup",
      label: "New Signup",
      color: "var(--amber)",
      bg: "var(--amber-dim)",
      icon: "📝"
    };
  }
  return {
    type: "other",
    label: "System Alert",
    color: "var(--txt-3)",
    bg: "var(--bg-subtle)",
    icon: "🔔"
  };
}

export default function SnmpPanel() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [config, setConfig] = useState(null);
  const [trapLog, setTrapLog] = useState([]);
  const [newDevice, setNewDevice] = useState({ ip: "", port: "9162" });
  const [msg, setMsg] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");

  const loadAll = () => {
    axios.get(`${BACKEND}/api/snmp-config`, { withCredentials: true })
      .then(r => {
        if (r.data) setConfig(r.data);
      })
      .catch((err) => {
        console.error("Failed to load SNMP config:", err);
        setConfig(prev => prev || { devices: [{ ip: "127.0.0.1", port: 9162 }], community: "public" });
      });

    axios.get(`${BACKEND}/api/snmp-log`, { withCredentials: true })
      .then(r => setTrapLog(r.data || []))
      .catch(() => { });
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 6000);
    return () => clearInterval(interval);
  }, []);

  const addDevice = async () => {
    if (!isAdmin || !newDevice.ip) return;
    try {
      const r = await axios.post(`${BACKEND}/api/snmp-config/devices`, {
        ip: newDevice.ip,
        port: parseInt(newDevice.port, 10)
      });
      setConfig(r.data.config);
      setNewDevice({ ip: "", port: "9162" });
      setMsg({ type: "success", text: `NMS Target ${newDevice.ip}:${newDevice.port} added.` });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
  };

  const removeDevice = async (ip, port) => {
    if (!isAdmin) return;
    try {
      const r = await axios.delete(`${BACKEND}/api/snmp-config/devices`, { data: { ip, port } });
      setConfig(r.data.config);
      setMsg({ type: "success", text: `NMS Target ${ip}:${port} removed.` });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
  };

  const exportLogsCSV = () => {
    if (!trapLog.length) return;
    const headers = "Timestamp,Type,Message,Targets\n";
    const rows = trapLog
      .map(log => {
        const meta = getTrapMeta(log.message);
        return `"${log.time}","${meta.label}","${(log.message || "").replace(/"/g, '""')}","${(log.targets || []).join('; ')}"`;
      })
      .join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snmp_traps_3months_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredLogs = useMemo(() => {
    const reversed = [...trapLog].reverse();
    if (activeFilter === "all") return reversed;
    return reversed.filter(entry => {
      const meta = getTrapMeta(entry.message);
      return meta.type === activeFilter;
    });
  }, [trapLog, activeFilter]);

  if (!config) return <div style={{ color: "var(--txt-3)" }}>Loading SNMP configuration…</div>;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: "1400px" }}>
      {/* ── STATUS MESSAGE BANNER ── */}
      {msg && (
        <div style={{
          background: msg.type === "success" ? "var(--green-dim)" : "var(--red-dim)",
          border: `1px solid ${msg.type === "success" ? "rgba(22, 163, 74, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "12px 16px",
          color: msg.type === "success" ? "var(--green)" : "var(--red)",
          fontSize: "0.88rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 1. SNMP TRAP TARGET CONFIGURATION ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="card-title">SNMP Trap Notification Targets</div>
            <p style={{ color: "var(--txt-3)", fontSize: "0.85rem", marginTop: 4 }}>
              Active NMS listening stations receiving automated telemetry traps.
            </p>
          </div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--green-dim)",
            color: "var(--green)",
            padding: "5px 12px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: 600,
            border: "1px solid rgba(22, 163, 74, 0.25)"
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", display: "inline-block" }}></span>
            Auto-Dispatch Active
          </div>
        </div>

        {/* Informative Auto-Dispatch Note */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: "0.82rem",
          color: "var(--txt-2)"
        }}>
          <span style={{ fontSize: "1.1rem" }}>⚡</span>
          <span>
            SNMP traps are automatically broadcast to all listening targets when an <strong>IP change</strong>, <strong>time sync</strong>, <strong>new login</strong>, or <strong>new signup</strong> occurs.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {config.devices.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 14px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--txt)" }}>{d.ip}:{d.port}</span>
              {isAdmin && (
                <button className="btn btn-danger" style={{ fontSize: "0.72rem", padding: "4px 10px" }} onClick={() => removeDevice(d.ip, d.port)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: "200px", display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>NMS Server IP Address</label>
              <input className="form-input" placeholder="192.168.x.x" value={newDevice.ip} onChange={e => setNewDevice(d => ({ ...d, ip: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: "100px", display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Port</label>
              <input className="form-input" placeholder="9162" value={newDevice.port} onChange={e => setNewDevice(d => ({ ...d, port: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={addDevice} style={{ height: "42px" }}>
              Add NMS Server
            </button>
          </div>
        )}
      </div>

      {/* ── 2. TRAP EVENT LOG (REAL-TIME STREAM & FILTER) ── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="card-title">Trap Event Log</div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  fontSize: "0.75rem",
                  fontWeight: activeFilter === "all" ? 700 : 500,
                  background: activeFilter === "all" ? "var(--blue-primary)" : "var(--bg-subtle)",
                  color: activeFilter === "all" ? "#ffffff" : "var(--txt-2)",
                  cursor: "pointer"
                }}
              >
                All ({trapLog.length})
              </button>
              {TRAP_CATEGORIES.map(t => {
                const count = trapLog.filter(l => getTrapMeta(l.message).type === t.id).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveFilter(t.id)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.75rem",
                      fontWeight: activeFilter === t.id ? 700 : 500,
                      background: activeFilter === t.id ? t.color : "var(--bg-subtle)",
                      color: activeFilter === t.id ? "#ffffff" : "var(--txt-2)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5
                    }}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                    <span style={{ opacity: 0.85, fontSize: "0.7rem" }}>({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "8px 16px" }} onClick={exportLogsCSV}>
            Export 3-Month Log
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "var(--txt-3)", fontSize: "0.85rem" }}>
              No trap events recorded for the selected filter.
            </div>
          ) : (
            filteredLogs.map((entry, i) => {
              const meta = getTrapMeta(entry.message);
              return (
                <div
                  key={i}
                  style={{
                    background: "var(--bg-subtle)",
                    padding: "12px 16px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: "260px" }}>
                    <span
                      style={{
                        background: meta.bg,
                        color: meta.color,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--txt)", wordBreak: "break-word" }}>
                      {entry.message}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {entry.targets && entry.targets.length > 0 && (
                      <span style={{ fontSize: "0.72rem", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>
                        NMS: {entry.targets.join(", ")}
                      </span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "var(--txt-3)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                      {entry.time
                        ? new Date(entry.time).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: true
                        })
                        : "—"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
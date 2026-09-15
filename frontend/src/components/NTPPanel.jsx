import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import axios from "axios";
import { useAuth } from "./RequireAuth";
import { BACKEND } from "../config";
const MAX_SERVERS = 5;

export default function NTPPanel() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [ntp, setNtp] = useState(null);
  const [msg, setMsg] = useState(null);
  const [applying, setApplying] = useState(false);
  const [servers, setServers] = useState(["", "", ""]);

  useEffect(() => {
    axios.get(`${BACKEND}/api/ntp-status`).then(r => setNtp(r.data)).catch(() => {});
    axios.get(`${BACKEND}/api/ntp-servers`).then(r => {
      const list = r.data?.servers || [];
      setServers([...list, "", "", ""].slice(0, Math.max(3, list.length)));
    }).catch(() => {});

    const socket = io(BACKEND, {
      transports: ["polling", "websocket"],
      withCredentials: true,
      autoConnect: true,
    });
    socket.on("ntp_update", data => setNtp(data));
    return () => socket.disconnect();
  }, []);

  const updateSlot = (i, value) => {
    if (!isAdmin) return;
    setServers(s => s.map((v, idx) => (idx === i ? value : v)));
  };

  const addSlot = () => {
    if (!isAdmin || servers.length >= MAX_SERVERS) return;
    setServers(s => [...s, ""]);
  };

  const removeSlot = (i) => {
    if (!isAdmin || i === 0) return;
    setServers(s => s.filter((_, idx) => idx !== i));
  };

  const applyServers = async () => {
    if (!isAdmin) return;
    const cleaned = servers.map(s => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setMsg({ type: "error", text: "Master clock address is required." });
      return;
    }
    setApplying(true);
    try {
      const r = await axios.post(`${BACKEND}/api/ntp-servers`, { servers: cleaned });
      setMsg({ type: r.data.status === "success" ? "ok" : "error", text: r.data.message });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
    setApplying(false);
  };

  const action = async (endpoint) => {
    if (!isAdmin) return;
    try {
      const r = await axios.post(`${BACKEND}/api/${endpoint}`);
      setMsg({ type: r.data.status === "success" ? "ok" : "error", text: r.data.message });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 28, width: "100%", maxWidth: "1400px" }}>
      <div className="stat-grid">
        <div className="stat-box">
          <div className="stat-label">Active Source</div>
          <div className="stat-value accent" style={{ fontSize: "1.15rem" }}>{ntp?.server || "—"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ textTransform: "capitalize" }}>{ntp?.status || "Unknown"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">NTP Daemon</div>
          <div className="stat-value" style={{ color: ntp?.service_running ? "var(--green)" : "var(--red)" }}>
            {ntp?.service_running ? "Active" : "Stopped"}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div className="card-title">NTP Server Configuration</div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ padding: "8px 18px" }} onClick={() => action("ntp-sync")}>Force Sync</button>
              <button className="btn btn-secondary" style={{ padding: "8px 18px" }} onClick={() => action("ntp-restart")}>Restart Service</button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 24 }}>
          {servers.map((val, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: i === 0 ? "var(--blue-primary)" : "var(--txt-2)" }}>
                {i === 0 ? "Master Clock Address " : `Fallback Server ${i} `}
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input
                  className="form-input"
                  value={val}
                  onChange={e => updateSlot(i, e.target.value)}
                  placeholder={i === 0 ? "e.g. 192.168.1.10 or time.google.com" : "Optional fallback IP"}
                  disabled={!isAdmin}
                  style={{ opacity: !isAdmin ? 0.7 : 1, cursor: !isAdmin ? "not-allowed" : "text" }}
                />
                {isAdmin && i > 0 && (
                  <button className="btn btn-secondary" style={{ color: "var(--red)" }} onClick={() => removeSlot(i)}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isAdmin && servers.length < MAX_SERVERS && (
          <button className="btn btn-secondary" style={{ marginBottom: 24 }} onClick={addSlot}>+ Add Fallback Server</button>
        )}

        {msg && (
          <div style={{
            background: msg.type === "ok" ? "var(--cyan-dim)" : "var(--red-dim)",
            border: `1px solid ${msg.type === "ok" ? "rgba(0,102,204,0.3)" : "rgba(220,38,38,0.3)"}`,
            borderRadius: "var(--radius-sm)", padding: "14px 18px", color: msg.type === "ok" ? "var(--blue-primary)" : "var(--red)",
            marginBottom: 20
          }}>
            {msg.text}
          </div>
        )}

        {isAdmin && (
          <div className="btn-row">
            <button className="btn btn-primary" onClick={applyServers} disabled={applying}>
              {applying ? "Saving…" : "Save NTP Servers"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
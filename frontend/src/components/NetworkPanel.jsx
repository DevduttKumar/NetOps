import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAuth } from "./RequireAuth";

const BACKEND = `${window.location.protocol}//${window.location.hostname}:5050`;

const SUBNET_PRESETS = [
  { label: "/24 — 255.255.255.0", value: "255.255.255.0" },
  { label: "/16 — 255.255.0.0", value: "255.255.0.0" },
  { label: "/28 — 255.255.255.240", value: "255.255.255.240" },
];

function isValidIPv4(ip) {
  if (!ip) return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && (part === "0" || !part.startsWith("0"));
  });
}

export default function NetworkPanel() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [current, setCurrent] = useState({ adapter: "—", adapters: [], ip: "—", subnet: "—", gateway: "—" });
  const [form, setForm] = useState({ adapter: "", ip: "", subnet: "255.255.255.0", gateway: "" });
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [countdown, setCountdown] = useState(4);
  const [targetUrl, setTargetUrl] = useState("");

  const loadCurrent = async () => {
    setRefreshing(true);
    try {
      const res = await axios.get(`${BACKEND}/api/current-network`, { withCredentials: true });
      if (res.data) {
        setCurrent(res.data);
        setForm(prev => ({
          adapter: prev.adapter || res.data.adapter || "",
          ip: prev.ip || "",
          subnet: prev.subnet || (isValidIPv4(res.data.subnet) ? res.data.subnet : "255.255.255.0"),
          gateway: prev.gateway || (isValidIPv4(res.data.gateway) ? res.data.gateway : ""),
        }));
      }
    } catch (err) {
      console.error("Failed to load current network:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCurrent();
  }, []);

  const ipValid = useMemo(() => isValidIPv4(form.ip), [form.ip]);
  const subnetValid = useMemo(() => isValidIPv4(form.subnet), [form.subnet]);
  const gatewayValid = useMemo(() => !form.gateway || isValidIPv4(form.gateway), [form.gateway]);
  const canApply = isAdmin && form.adapter && ipValid && subnetValid && gatewayValid;

  const requestApply = () => {
    if (!isAdmin) return;
    if (!form.adapter || !form.ip || !form.subnet) {
      setMsg({ type: "error", text: "Please provide a valid adapter, IP address, and subnet mask." });
      return;
    }
    if (!ipValid) {
      setMsg({ type: "error", text: "Invalid IP address format (must be 4 valid octets 0-255)." });
      return;
    }
    if (!subnetValid) {
      setMsg({ type: "error", text: "Invalid subnet mask format." });
      return;
    }
    if (form.gateway && !gatewayValid) {
      setMsg({ type: "error", text: "Invalid default gateway format." });
      return;
    }
    setMsg(null);
    setPending(true);
  };

  const confirmApply = async () => {
    setPending(false);
    setReconnecting(true);
    setCountdown(4);

    const { protocol, port } = window.location;
    const nextUrl = `${protocol}//${form.ip.trim()}${port ? ":" + port : ""}/network`;
    setTargetUrl(nextUrl);

    try {
      await axios.post(`${BACKEND}/api/change-ip`, form, {
        withCredentials: true,
        timeout: 4000,
      });
    } catch (e) {
      console.warn("Connection switched before HTTP return:", e);
    }

    // Begin countdown to redirect to the new permanent IP
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          window.location.href = nextUrl;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: "1400px" }}>
      {/* ── HEADER TITLE ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--txt)", letterSpacing: "-0.5px", margin: 0 }}>
            Network Telemetry &amp; Configuration
          </h2>
          <p style={{ color: "var(--txt-3)", fontSize: "0.86rem", marginTop: 4, margin: 0 }}>
            Live interface telemetry and permanent static IP persistence across reboots.
          </p>
        </div>

        <button
          className="btn btn-secondary"
          onClick={loadCurrent}
          disabled={refreshing}
          style={{ fontSize: "0.84rem", padding: "9px 18px", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ display: "inline-block", transform: refreshing ? "rotate(360deg)" : "none", transition: "transform 0.5s ease" }}>🔄</span>
          <span>{refreshing ? "Refreshing…" : "Refresh Telemetry"}</span>
        </button>
      </div>

      {/* ── TOP TELEMETRY METRIC BOXES ── */}
      <div className="stat-grid">
        {/* Active IP Box */}
        <div className="stat-box" style={{ borderTop: "3px solid var(--blue-primary)" }}>
          <div className="stat-label">
            <span>🌐 Active IPv4 Address</span>
            <span className="live-dot" title="Interface active"></span>
          </div>
          <div className="stat-value accent" style={{ fontSize: "1.35rem" }}>
            {current.ip}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--txt-3)", marginTop: 8 }}>
            Current assigned address
          </div>
        </div>

        {/* Subnet Mask Box */}
        <div className="stat-box" style={{ borderTop: "3px solid var(--txt-3)" }}>
          <div className="stat-label">
            <span>🛡️ Subnet Mask</span>
          </div>
          <div className="stat-value" style={{ fontSize: "1.35rem" }}>
            {current.subnet}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--txt-3)", marginTop: 8 }}>
            Local subnet broadcast zone
          </div>
        </div>

        {/* Gateway Box */}
        <div className="stat-box" style={{ borderTop: "3px solid #6366f1" }}>
          <div className="stat-label">
            <span>🔀 Default Gateway</span>
          </div>
          <div className="stat-value" style={{ fontSize: "1.35rem" }}>
            {current.gateway}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--txt-3)", marginTop: 8 }}>
            Upstream route egress
          </div>
        </div>

        {/* Interface Adapter Box */}
        <div className="stat-box" style={{ borderTop: "3px solid var(--green)" }}>
          <div className="stat-label">
            <span>⚡ Active Interface</span>
            <span className="pill online" style={{ fontSize: "0.62rem", padding: "2px 6px" }}>UP</span>
          </div>
          <div className="stat-value" style={{ fontSize: "1.35rem" }}>
            {current.adapter}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--txt-3)", marginTop: 8 }}>
            Physical controller
          </div>
        </div>
      </div>

      {/* ── STATUS MESSAGE BANNER ── */}
      {msg && (
        <div style={{
          background: msg.type === "ok" ? "var(--green-dim)" : "var(--red-dim)",
          border: `1px solid ${msg.type === "ok" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          borderRadius: "var(--radius-sm)",
          padding: "14px 18px",
          color: msg.type === "ok" ? "var(--green)" : "var(--red)",
          fontSize: "0.88rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── PERMANENT STATIC IP CONFIGURATION CARD ── */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="card-title">Permanent Static IP Configuration</div>
              <span
                style={{
                  background: "var(--green-dim)",
                  color: "var(--green)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: "20px",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5
                }}
              >
                <span>🔒</span> Persistent Across Reboots
              </span>
            </div>
            <p style={{ color: "var(--txt-3)", fontSize: "0.84rem", marginTop: 6, margin: "6px 0 0 0" }}>
              Applies permanently to Linux host configuration files (NetworkManager, Netplan, systemd-networkd) so settings never revert on reboot.
            </p>
          </div>

          {!isAdmin && (
            <span className="pill warning">Read Only (Admin Required)</span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "22px 24px", marginBottom: 28 }}>
          {/* Adapter Field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--txt-2)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>
              Network Adapter
            </label>
            {current.adapters && current.adapters.length > 0 ? (
              <select
                className="form-select"
                value={form.adapter}
                onChange={e => setForm(f => ({ ...f, adapter: e.target.value }))}
                disabled={!isAdmin}
              >
                {current.adapters.map(ad => (
                  <option key={ad} value={ad}>
                    {ad} {ad === current.adapter ? "— (Active Default)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="form-input"
                name="adapter"
                value={form.adapter}
                onChange={e => setForm(f => ({ ...f, adapter: e.target.value }))}
                placeholder="e.g. eth0, enp3s0"
                disabled={!isAdmin}
              />
            )}
            <span style={{ fontSize: "0.72rem", color: "var(--txt-3)" }}>
              Target hardware controller interface
            </span>
          </div>

          {/* New IP Address Field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--txt-2)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>
                New Static IP Address
              </label>
              {form.ip && (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: ipValid ? "var(--green)" : "var(--red)" }}>
                  {ipValid ? "✓ Valid IPv4" : "✗ Invalid format"}
                </span>
              )}
            </div>
            <input
              className="form-input"
              name="ip"
              value={form.ip}
              onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
              placeholder="e.g. 192.168.1.150"
              disabled={!isAdmin}
              style={{
                borderColor: form.ip && !ipValid ? "var(--red)" : undefined
              }}
            />
            <span style={{ fontSize: "0.72rem", color: "var(--txt-3)" }}>
              Target static host address
            </span>
          </div>

          {/* Subnet Mask Field with Presets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--txt-2)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>
                Subnet Mask
              </label>
              {form.subnet && (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: subnetValid ? "var(--green)" : "var(--red)" }}>
                  {subnetValid ? "✓ Valid" : "✗ Invalid"}
                </span>
              )}
            </div>
            <input
              className="form-input"
              name="subnet"
              value={form.subnet}
              onChange={e => setForm(f => ({ ...f, subnet: e.target.value }))}
              placeholder="255.255.255.0"
              disabled={!isAdmin}
            />
            {/* Quick Presets */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SUBNET_PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setForm(f => ({ ...f, subnet: p.value }))}
                  style={{
                    background: form.subnet === p.value ? "var(--blue-dim)" : "var(--bg-subtle)",
                    border: `1px solid ${form.subnet === p.value ? "var(--blue-primary)" : "var(--border)"}`,
                    color: form.subnet === p.value ? "var(--blue-primary)" : "var(--txt-3)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.68rem",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer"
                  }}
                >
                  {p.value}
                </button>
              ))}
            </div>
          </div>

          {/* Default Gateway Field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--txt-2)", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "var(--font-mono)" }}>
                Default Gateway
              </label>
              {form.gateway && (
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: gatewayValid ? "var(--green)" : "var(--red)" }}>
                  {gatewayValid ? "✓ Valid" : "✗ Invalid"}
                </span>
              )}
            </div>
            <input
              className="form-input"
              name="gateway"
              value={form.gateway}
              onChange={e => setForm(f => ({ ...f, gateway: e.target.value }))}
              placeholder="e.g. 192.168.1.1"
              disabled={!isAdmin}
              style={{
                borderColor: form.gateway && !gatewayValid ? "var(--red)" : undefined
              }}
            />
            <span style={{ fontSize: "0.72rem", color: "var(--txt-3)" }}>
              Router or switch IP for default gateway route
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="btn-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <button
              className="btn btn-primary"
              disabled={!canApply}
              onClick={requestApply}
              style={{
                padding: "11px 24px",
                fontSize: "0.92rem",
                fontWeight: 700,
                opacity: canApply ? 1 : 0.6,
                cursor: canApply ? "pointer" : "not-allowed"
              }}
            >
              🔒 Apply Permanent IP Change
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setForm({
                adapter: current.adapter || "",
                ip: "",
                subnet: current.subnet || "255.255.255.0",
                gateway: current.gateway || ""
              })}
            >
              Reset Inputs
            </button>
          </div>
        )}
      </div>

      {/* ── CONFIRMATION MODAL ── */}
      {pending && (
        <div className="modal-overlay" onClick={() => setPending(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: "1.4rem" }}>⚠️</span>
              <div style={{ color: "var(--txt)", fontWeight: 800, fontSize: "1.18rem" }}>
                Confirm Permanent IP Reconfiguration
              </div>
            </div>

            <p style={{ color: "var(--txt-2)", fontSize: "0.88rem", lineHeight: 1.5, marginBottom: 20 }}>
              This will rebind interface <strong>{form.adapter}</strong> to the new static IP and permanently persist the setting in Linux network configuration files.
            </p>

            {/* Before vs After Comparison */}
            <div style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "14px 18px",
              marginBottom: 22,
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                <span style={{ color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Adapter:</span>
                <span style={{ fontWeight: 700, color: "var(--txt)", fontFamily: "var(--font-mono)" }}>{form.adapter}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <span style={{ color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Current IP:</span>
                <span style={{ color: "var(--txt-3)", fontFamily: "var(--font-mono)", textDecoration: "line-through" }}>{current.ip}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", background: "var(--blue-dim)", padding: "6px 8px", borderRadius: "6px" }}>
                <span style={{ fontWeight: 700, color: "var(--blue-primary)", fontFamily: "var(--font-mono)" }}>New Permanent IP:</span>
                <span style={{ fontWeight: 800, color: "var(--blue-primary)", fontFamily: "var(--font-mono)" }}>{form.ip}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                <span style={{ color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Subnet:</span>
                <span style={{ fontWeight: 600, color: "var(--txt)", fontFamily: "var(--font-mono)" }}>{form.subnet}</span>
              </div>
              {form.gateway && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
                  <span style={{ color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>Gateway:</span>
                  <span style={{ fontWeight: 600, color: "var(--txt)", fontFamily: "var(--font-mono)" }}>{form.gateway}</span>
                </div>
              )}
            </div>

            <div className="btn-row">
              <button className="btn btn-primary" style={{ flex: 1, padding: "12px", fontWeight: 700 }} onClick={confirmApply}>
                Confirm &amp; Apply Permanently
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, padding: "12px" }} onClick={() => setPending(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AUTOMATIC REDIRECT COUNTDOWN OVERLAY ── */}
      {reconnecting && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460, textAlign: "center", padding: "36px 28px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🚀</div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--txt)", marginBottom: 8 }}>
              Network Reconfigured Permanently!
            </h3>
            <p style={{ color: "var(--txt-3)", fontSize: "0.88rem", lineHeight: 1.5, marginBottom: 20 }}>
              The host network interface is now configured to <strong>{form.ip}</strong>. Reconnecting your browser console session:
            </p>

            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--blue-dim)",
              color: "var(--blue-primary)",
              fontSize: "1.6rem",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              marginBottom: 20
            }}>
              {countdown}
            </div>

            <div>
              <a
                href={targetUrl}
                className="btn btn-primary"
                style={{ textDecoration: "none", display: "inline-block", width: "100%", padding: "12px" }}
              >
                Go to http://{form.ip}:{window.location.port || 5173} Now ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
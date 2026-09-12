import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import { useAuth } from "./RequireAuth";

const BACKEND = `${window.location.protocol}//${window.location.hostname}:5050`;
const CLOCK_FORMAT_KEY = "netops.clockFormat";

function loadSavedFormat() {
  try {
    return localStorage.getItem(CLOCK_FORMAT_KEY) === "24" ? "24" : "12";
  } catch {
    return "12";
  }
}

function fmtClock(date, hour12) {
  if (!date) return "—:—:—";
  try {
    return date.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12
    });
  } catch { return "—:—:—"; }
}

function fmtDate(date) {
  if (!date) return "—";
  try {
    return date.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long", day: "2-digit", month: "short", year: "numeric"
    });
  } catch { return "—"; }
}

function getISTParts(date) {
  if (!date) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23"
    });
    const parts = fmt.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return {
      dateStr: `${parts.year}-${parts.month}-${parts.day}`,
      hour24: parseInt(parts.hour, 10),
      minute: parseInt(parts.minute, 10),
      second: parseInt(parts.second, 10)
    };
  } catch { return null; }
}

function pad2(n) { return String(n).padStart(2, "0"); }

function SegmentStepper({ value, onChange, min, max, label, disabled }) {
  const step = (delta) => {
    if (disabled) return;
    let next = value + delta;
    if (next > max) next = min;
    if (next < min) next = max;
    onChange(next);
  };

  const btnStyle = {
    background: "var(--bg-subtle)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)", color: "var(--blue-primary)", cursor: disabled ? "not-allowed" : "pointer",
    width: "100%", padding: "5px 0", fontSize: "0.75rem", lineHeight: 1,
    fontFamily: "var(--font-mono)", fontWeight: 700, opacity: disabled ? 0.5 : 1
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 72 }}>
      <button type="button" onClick={() => step(1)} style={btnStyle} disabled={disabled} aria-label={`Increase ${label}`}>▲</button>
      <input
        value={pad2(value)}
        onChange={e => {
          if (disabled) return;
          const digits = e.target.value.replace(/\D/g, "").slice(-2);
          if (digits === "") { onChange(min); return; }
          onChange(Math.min(max, parseInt(digits, 10)));
        }}
        onFocus={e => e.target.select()}
        inputMode="numeric"
        maxLength={2}
        disabled={disabled}
        style={{
          width: "100%", textAlign: "center",
          background: "var(--bg-input)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--blue-primary)",
          fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.9rem",
          padding: "10px 0", outline: "none", opacity: disabled ? 0.7 : 1
        }}
      />
      <button type="button" onClick={() => step(-1)} style={btnStyle} disabled={disabled} aria-label={`Decrease ${label}`}>▼</button>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
    </div>
  );
}

function ModernDateTimePicker({ value, onChange, format, currentTime, disabled }) {
  const parsed = value ? value.split(/[T ]/) : null;
  const todayIST = getISTParts(currentTime || new Date())?.dateStr || "";
  const dateStr = parsed?.[0] || todayIST;
  const [hh, mm, ss] = parsed?.[1]?.split(":").map(n => parseInt(n, 10)) || [null, null, null];

  const hour24 = hh ?? null;
  const displayHour = hour24 == null ? null
    : format === "12" ? (hour24 % 12 === 0 ? 12 : hour24 % 12)
    : hour24;
  const ampm = hour24 == null ? "AM" : (hour24 >= 12 ? "PM" : "AM");

  const emit = ({ date = dateStr, h24 = hour24, min = mm, sec = ss }) => {
    if (disabled) return;
    onChange(`${date}T${pad2(h24 ?? 0)}:${pad2(min ?? 0)}:${pad2(sec ?? 0)}`);
  };

  const setDisplayHour = (newDisplayHour) => {
    if (disabled) return;
    let newHour24;
    if (format === "12") {
      const isPM = ampm === "PM";
      newHour24 = isPM ? (newDisplayHour === 12 ? 12 : newDisplayHour + 12)
                        : (newDisplayHour === 12 ? 0 : newDisplayHour);
    } else {
      newHour24 = newDisplayHour;
    }
    emit({ h24: newHour24 });
  };

  const toggleAmPm = () => {
    if (disabled || hour24 == null) return;
    const newHour24 = ampm === "AM" ? hour24 + 12 : hour24 - 12;
    emit({ h24: ((newHour24 % 24) + 24) % 24 });
  };

  const useNow = () => {
    if (disabled) return;
    const parts = getISTParts(currentTime || new Date());
    if (!parts) return;
    onChange(`${parts.dateStr}T${pad2(parts.hour24)}:${pad2(parts.minute)}:${pad2(parts.second)}`);
  };

  const hourMax = format === "12" ? 12 : 23;
  const hourMin = format === "12" ? 1 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <SegmentStepper
          label="Hour"
          value={displayHour ?? hourMin}
          min={hourMin}
          max={hourMax}
          onChange={setDisplayHour}
          disabled={disabled}
        />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "2rem", color: "var(--txt-3)", paddingBottom: 38 }}>:</div>
        <SegmentStepper
          label="Minute"
          value={mm ?? 0}
          min={0} max={59}
          onChange={v => emit({ min: v })}
          disabled={disabled}
        />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "2rem", color: "var(--txt-3)", paddingBottom: 38 }}>:</div>
        <SegmentStepper
          label="Second"
          value={ss ?? 0}
          min={0} max={59}
          onChange={v => emit({ sec: v })}
          disabled={disabled}
        />

        {format === "12" && (
          <button
            type="button"
            onClick={toggleAmPm}
            disabled={disabled}
            className="btn btn-secondary"
            style={{ alignSelf: "center", marginBottom: 26, minWidth: 68, padding: "12px 16px", fontWeight: 700, fontFamily: "var(--font-mono)", opacity: disabled ? 0.6 : 1 }}
          >
            {ampm}
          </button>
        )}

        <button
          type="button"
          onClick={useNow}
          disabled={disabled}
          className="btn btn-secondary"
          style={{ alignSelf: "center", marginBottom: 26, padding: "12px 18px", color: "var(--blue-primary)", fontWeight: 700, opacity: disabled ? 0.6 : 1 }}
        >
          Set To Now
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 280 }}>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--txt-2)" }}>
           Date
        </label>
        <input
          type="date"
          className="form-input"
          value={dateStr}
          disabled={disabled}
          onChange={e => emit({ date: e.target.value })}
          style={{ opacity: disabled ? 0.7 : 1, cursor: disabled ? "not-allowed" : "text" }}
        />
      </div>
    </div>
  );
}

function MsgBox({ msg }) {
  if (!msg) return null;
  const isOk = msg.type === "ok";
  return (
    <div style={{
      background: isOk ? "var(--cyan-dim)" : "var(--red-dim)",
      border: `1px solid ${isOk ? "rgba(0, 102, 204, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
      borderRadius: "var(--radius-sm)",
      padding: "14px 18px",
      color: isOk ? "var(--blue-primary)" : "var(--red)",
      fontFamily: "var(--font-mono)",
      fontSize: "0.9rem",
      marginBottom: 20
    }}>
      {msg.text}
    </div>
  );
}

export default function SystemSettings() {
  const { role, username: authUser } = useAuth();
  const isAdmin = role === "admin";

  const [ntp, setNtp] = useState(null);
  const [displayTime, setDisplayTime] = useState(null);
  const [format, setFormatState] = useState(loadSavedFormat);

  const [manualDateTime, setManualDateTime] = useState("");
  const [applyingTime, setApplyingTime] = useState(false);
  const [manualTimeMsg, setManualTimeMsg] = useState(null);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const anchorRef = useRef({ serverMs: null, perfMs: null });

  useEffect(() => {
    axios.get(`${BACKEND}/api/ntp-status`).then(r => setNtp(r.data)).catch(() => {});
    const socket = io(BACKEND, { transports: ["websocket"] });
    socket.on("ntp_update", data => setNtp(data));
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (ntp?.server_time) {
      anchorRef.current = {
        serverMs: new Date(ntp.server_time).getTime(),
        perfMs: performance.now()
      };
    }
  }, [ntp?.server_time]);

  useEffect(() => {
    const id = setInterval(() => {
      const { serverMs, perfMs } = anchorRef.current;
      if (serverMs == null) return;
      setDisplayTime(new Date(serverMs + (performance.now() - perfMs)));
    }, 250);
    return () => clearInterval(id);
  }, []);

  const setFormat = (value) => {
    setFormatState(value);
    try { localStorage.setItem(CLOCK_FORMAT_KEY, value); } catch {}
  };

  const applyManualTime = async () => {
    if (!isAdmin) return;
    if (!manualDateTime) {
      setManualTimeMsg({ type: "error", text: "Please pick a date and time first." });
      setTimeout(() => setManualTimeMsg(null), 4000);
      return;
    }
    setApplyingTime(true);
    try {
      const r = await axios.post(`${BACKEND}/api/set-manual-time`, { datetime: manualDateTime });
      setManualTimeMsg({ type: r.data.status === "success" ? "ok" : "error", text: r.data.message });
    } catch (e) {
      setManualTimeMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
    setApplyingTime(false);
    setTimeout(() => setManualTimeMsg(null), 6000);
  };

  const changePassword = async () => {
    if (!pwForm.current || !pwForm.next) {
      setPwMsg({ type: "error", text: "Fill in both current and new password." });
      setTimeout(() => setPwMsg(null), 4000);
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "New password and confirmation do not match." });
      setTimeout(() => setPwMsg(null), 4000);
      return;
    }
    setChangingPw(true);
    try {
      const r = await axios.post(`${BACKEND}/api/change-password`, {
        current_password: pwForm.current,
        new_password: pwForm.next
      });
      setPwMsg({ type: r.data.status === "success" ? "ok" : "error", text: r.data.message });
      if (r.data.status === "success") setPwForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      setPwMsg({ type: "error", text: e.response?.data?.message || e.message });
    }
    setChangingPw(false);
    setTimeout(() => setPwMsg(null), 5000);
  };

  const getStatusPill = () => {
    if (!ntp?.status) return <span className="pill warning"><span className="pill-dot"></span>Unknown</span>;
    if (ntp.status === "free_running") return <span className="pill warning"><span className="pill-dot"></span>Free Running</span>;
    if (ntp.status === "synced")      return <span className="pill online"><span className="pill-dot"></span>Synchronized</span>;
    if (ntp.status === "syncing")     return <span className="pill online" style={{ color: "var(--blue-primary)", background: "var(--blue-dim)" }}><span className="pill-dot" style={{ background: "var(--blue-primary)" }}></span>Syncing…</span>;
    if (ntp.status === "offset")      return <span className="pill warning"><span className="pill-dot"></span>Re-Synchronizing</span>;
    if (ntp.status === "unreachable") return <span className="pill offline"><span className="pill-dot"></span>Unreachable</span>;
    return <span className="pill warning"><span className="pill-dot"></span>{ntp.status}</span>;
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 28, width: "100%", maxWidth: "1400px" }}>

      {/* Synchronized Big Clock Card */}
      <div className="card" style={{ textAlign: "center", padding: "40px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title">System Clock</div>
          {getStatusPill()}
        </div>

        <div style={{
          fontFamily: "var(--font-mono)", fontWeight: 700,
          fontSize: "clamp(2.8rem, 6vw, 4.4rem)", letterSpacing: "1px",
          color: "var(--blue-primary)", lineHeight: 1.15, marginTop: 8
        }}>
          {fmtClock(displayTime, format === "12")}
        </div>

        <div style={{ fontFamily: "var(--font-mono)", color: "var(--txt-2)", fontSize: "1.05rem", fontWeight: 500, marginTop: 8 }}>
          {fmtDate(displayTime)}
        </div>

        {/* Display Format Controls */}
        <div style={{ display: "inline-flex", gap: 10, marginTop: 24 }}>
          <button
            className={`btn ${format === "12" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 20px" }}
            onClick={() => setFormat("12")}
          >
            12-Hour
          </button>
          <button
            className={`btn ${format === "24" ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "8px 20px" }}
            onClick={() => setFormat("24")}
          >
            24-Hour
          </button>
        </div>
      </div>

      {/* Manual Time Configuration Card */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 20 }}>Manual Clock Setting</div>
        <MsgBox msg={manualTimeMsg} />

        <div style={{ marginBottom: 24 }}>
          <ModernDateTimePicker
            value={manualDateTime}
            onChange={setManualDateTime}
            format={format}
            currentTime={displayTime}
            disabled={!isAdmin}
          />
        </div>

        {isAdmin && (
          <div className="btn-row">
            <button
              className="btn btn-amber"
              onClick={applyManualTime}
              disabled={applyingTime}
              style={{ opacity: applyingTime ? 0.7 : 1 }}
            >
              {applyingTime ? "Applying Manual Time…" : "Set System Clock"}
            </button>
          </div>
        )}
      </div>

      {/* ── ACCOUNT SETTINGS SECTION ── */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 20 }}>Account Settings</div>

        {/* Profile Overview Banner */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "16px 20px",
          marginBottom: 24
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--blue-dim)",
              border: "1px solid var(--border-focus)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--blue-primary)",
              fontWeight: 700,
              fontSize: "1.1rem",
              fontFamily: "var(--font-mono)"
            }}>
              {(authUser || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--txt)", fontSize: "0.95rem" }}>
                {authUser || "Active User"}
              </div>
              {/* <div style={{ fontSize: "0.78rem", color: "var(--txt-3)", fontFamily: "var(--font-mono)" }}>
                {isAdmin ? "System Administrator" : "User"}
              </div> */}
            </div>
          </div>
          <span className={`pill ${isAdmin ? "online" : "warning"}`}>
            {isAdmin ? "System Administrator" : "User "}
          </span>
        </div>

        <MsgBox msg={pwMsg} />

        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--txt-2)", marginBottom: 14, letterSpacing: "0.5px" }}>
          Update Your Password
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px 24px", marginBottom: 24 }}>
          {[
            { key: "current", label: "Current Password" },
            { key: "next", label: "New Password" },
            { key: "confirm", label: "Confirm New Password" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--txt-2)" }}>
                {label}
              </label>
              <input
                type="password"
                className="form-input"
                value={pwForm[key]}
                onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={`Enter ${label.toLowerCase()}`}
              />
            </div>
          ))}
        </div>

        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={changePassword}
            disabled={changingPw}
            style={{ opacity: changingPw ? 0.7 : 1 }}
          >
            {changingPw ? "Updating Account…" : "Save Account Changes"}
          </button>
        </div>
      </div>

    </div>
  );
}
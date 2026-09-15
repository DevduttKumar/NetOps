import React, { useState } from "react";
import axios from "axios";
import NetOpsLogo from "./NetOpsLogo";
import { BACKEND } from "../config";

export default function Login({ onLoggedIn }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setError(null);
    setSuccess(null);
    setPassword("")
    setConfirmPassword("");
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        const r = await axios.post(
          `${BACKEND}/api/signup`,
          { username, password },
          { withCredentials: true }
        );
        if (r.data.status === "success") {
          setSuccess("Account created successfully! Please sign in.");
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
        } else {
          setError(r.data.message || "Registration failed.");
        }
      } else {
        const r = await axios.post(
          `${BACKEND}/api/login`,
          { username, password },
          { withCredentials: true }
        );
        if (r.data.status === "success") {
          if (typeof onLoggedIn === "function") {
            onLoggedIn();
          } else {
            window.location.href = "/network";
          }
        } else {
          setError(r.data.message || "Incorrect username or password.");
        }
      }
    } catch (e) {
      setError(e.response?.data?.message || "Authentication failed.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: "flex",
      width: "100vw",
      height: "100vh",
      background: "var(--bg)",
      fontFamily: "var(--font-ui)",
      overflow: "hidden",
      position: "relative"
    }}>
      {/* ── AMBIENT GLOW BACKDROP ── */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(2, 132, 199, 0.15) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)",
        filter: "blur(60px)",
        pointerEvents: "none"
      }} />

      {/* ── SIGN-IN FORM PANEL ── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        zIndex: 1
      }}>
        <div style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "36px 36px 40px",
          boxShadow: "var(--shadow-lg)",
          backdropFilter: "blur(16px)"
        }}>
          <form onSubmit={handleAuth} style={{ width: "100%", display: "flex", flexDirection: "column" }}>

          {/* Header & Logo */}
          <div style={{ marginBottom: "28px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <NetOpsLogo height={58} />
            </div>
            <p style={{ color: "var(--txt-3)", fontSize: "0.88rem", margin: "4px 0 0 0" }}>
              Enterprise Network Operations & Telemetry
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{
            display: "flex", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)",
            padding: "4px", marginBottom: "22px", border: "1px solid var(--border)"
          }}>
            <button
              type="button"
              onClick={() => { setIsSignUp(false); resetForm(); }}
              style={{
                flex: 1, padding: "9px", borderRadius: "6px", border: "none",
                background: !isSignUp ? "var(--bg-card)" : "transparent",
                color: !isSignUp ? "var(--blue-primary)" : "var(--txt-3)",
                fontWeight: !isSignUp ? 700 : 500, fontSize: "0.9rem", cursor: "pointer",
                boxShadow: !isSignUp ? "var(--shadow-sm)" : "none"
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); resetForm(); }}
              style={{
                flex: 1, padding: "9px", borderRadius: "6px", border: "none",
                background: isSignUp ? "var(--bg-card)" : "transparent",
                color: isSignUp ? "var(--blue-primary)" : "var(--txt-3)",
                fontWeight: isSignUp ? 700 : 500, fontSize: "0.9rem", cursor: "pointer",
                boxShadow: isSignUp ? "var(--shadow-sm)" : "none"
              }}
            >
              Sign Up
            </button>
          </div>

          {/* Username Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--txt-2)" }}>Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              placeholder="Enter username"
              style={{ padding: "12px 16px", fontSize: "0.95rem" }}
            />
          </div>

          {/* Password Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: isSignUp ? 18 : 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--txt-2)" }}>Password</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "0.82rem",
                    color: "var(--blue-primary)",
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "none"
                  }}
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div style={{ position: "relative", width: "100%" }}>
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="Enter password"
                style={{ padding: "12px 46px 12px 16px", fontSize: "0.95rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "transparent", border: "none", cursor: "pointer", color: "var(--txt-3)"
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPassword ? <path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /> : <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />}
                </svg>
              </button>
            </div>
          </div>

          {/* Confirm Password (Sign Up Only) */}
          {isSignUp && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--txt-2)" }}>Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                style={{ padding: "12px 16px", fontSize: "0.95rem" }}
              />
            </div>
          )}

          {error && (
            <div style={{
              background: "var(--red-dim)", border: "1px solid rgba(220, 38, 38, 0.3)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", color: "var(--red)", fontSize: "0.88rem", marginTop: 8, marginBottom: 16
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: "var(--green-dim)", border: "1px solid rgba(22, 163, 74, 0.3)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", color: "var(--green)", fontSize: "0.88rem", marginTop: 8, marginBottom: 16
            }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px", fontSize: "1rem", fontWeight: 700, marginTop: isSignUp ? 4 : 14 }}
          >
            {loading ? "Processing…" : (isSignUp ? "Sign Up" : "Sign In")}
          </button>
        </form>
        </div>
      </div>

      {/* ── FORGOT PASSWORD MODAL ── */}
      {showForgotModal && (
        <div className="modal-overlay" onClick={() => setShowForgotModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ color: "var(--txt)", fontWeight: 700, fontSize: "1.15rem", marginBottom: 12 }}>
              Reset Account Access
            </div>
            <p style={{ color: "var(--txt-2)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: 20 }}>
              To recover or reset your login credentials, please contact the local network administrator directly or execute a CLI credential reset on the host unit terminal.
            </p>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => setShowForgotModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
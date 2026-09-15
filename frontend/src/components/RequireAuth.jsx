import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import axios from "axios";
import { BACKEND } from "../config";

const AuthContext = createContext({
  authenticated: false,
  username: null,
  role: "viewer",
  loading: true,
  checkAuth: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    username: null,
    role: "viewer",
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get(`${BACKEND}/api/auth-check`, {
        withCredentials: true,
        timeout: 4000,
      });
      setAuthState({
        loading: false,
        authenticated: Boolean(res.data?.authenticated),
        username: res.data?.username || null,
        role: res.data?.role || "viewer",
      });
    } catch {
      setAuthState({
        loading: false,
        authenticated: false,
        username: null,
        role: "viewer",
      });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${BACKEND}/api/logout`, {}, { withCredentials: true });
    } catch {
      // Ignore network errors on logout
    } finally {
      setAuthState({
        loading: false,
        authenticated: false,
        username: null,
        role: "viewer",
      });
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <AuthContext.Provider value={{ ...authState, checkAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export default function RequireAuth({ children, adminOnly = false }) {
  const { loading, authenticated, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "#666", fontFamily: "sans-serif" }}>
        Loading Console Session...
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && role !== "admin") {
    return <Navigate to="/network" replace />;
  }

  return children;
}
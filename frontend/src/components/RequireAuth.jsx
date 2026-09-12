// import React, { createContext, useContext, useEffect, useState } from "react";
// import axios from "axios";
// import Login from "./Login";

// const BACKEND = `${window.location.protocol}//${window.location.hostname}:5050`;
// // const BACKEND = window.location.port === "5050" || window.location.port === "5173" || window.location.port === "3000"
// //   ? `${window.location.protocol}//${window.location.hostname}:5050`
// //   : "";
// axios.defaults.withCredentials = true;

// const AuthContext = createContext({ role: "viewer", username: "", refresh: () => {} });

// export function useAuth() {
//   return useContext(AuthContext);
// }

// export default function RequireAuth({ children }) {
//   const [status, setStatus] = useState("checking");
//   const [userData, setUserData] = useState({ role: "viewer", username: "" });

//   const checkAuth = () => {
//     axios.get(`${BACKEND}/api/auth-check`)
//       .then(r => {
//         if (r.data?.authenticated) {
//           setUserData({ role: r.data.role || "viewer", username: r.data.username || "" });
//           setStatus("in");
//         } else {
//           setStatus("out");
//         }
//       })
//       .catch(() => setStatus("out"));
//   };

//   useEffect(() => { checkAuth(); }, []);

//   if (status === "checking") {
//     return (
//       <div style={{
//         minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
//         background: "var(--bg)", color: "var(--txt-3)", fontFamily: "var(--font-mono)"
//       }}>
//         Loading Console Session…
//       </div>
//     );
//   }

//   if (status === "out") {
//     return <Login onLoggedIn={checkAuth} />;
//   }

//   return (
//     <AuthContext.Provider value={{ ...userData, refresh: checkAuth }}>
//       {children}
//     </AuthContext.Provider>
//   );
// }

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import axios from "axios";

const BACKEND = `${window.location.protocol}//${window.location.hostname}:5050`;

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
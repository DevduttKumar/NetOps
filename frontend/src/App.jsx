import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth, { AuthProvider, useAuth } from "./components/RequireAuth";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import NetworkPanel from "./components/NetworkPanel";
import NTPPanel from "./components/NTPPanel";
import SNMPLog from "./components/SNMPLog";
import Setting from "./components/Setting";
import "./App.css";

function DashboardLayout() {
  return (
    <RequireAuth>
      <div className="app-layout" style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main className="content-area" style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
          <Routes>
            <Route path="/network" element={<NetworkPanel />} />
            <Route path="/ntp" element={<NTPPanel />} />
            <Route path="/snmp" element={<SNMPLog />} />
            <Route path="/system" element={<Setting />} />
            <Route path="*" element={<Navigate to="/network" replace />} />
          </Routes>
        </main>
      </div>
    </RequireAuth>
  );
}

function PublicLogin() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: "2rem", color: "#666" }}>Loading Console Session...</div>;
  }

  if (authenticated) {
    return <Navigate to="/network" replace />;
  }

  return <Login onLoggedIn={() => { window.location.href = "/network"; }} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Always send root directly to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<PublicLogin />} />
        <Route path="/*" element={<DashboardLayout />} />
      </Routes>
    </AuthProvider>
  );
}
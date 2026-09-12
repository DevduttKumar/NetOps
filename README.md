# NetOps Console — Intelligent Network Operations Platform

Modern, enterprise-grade Network Operations & Telemetry Console designed for managing Linux network infrastructure, NTP clock synchronization, SNMP trap telemetry, and security access.

![NetOps Console](https://img.shields.io/badge/NetOps-v1.0-0284c7?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square)
![Flask](https://img.shields.io/badge/Flask-Gevent-black?style=flat-square)

---

## 🚀 Features

- **🌐 Permanent Static IP Configuration**:
  - Multi-engine Linux persistence (`NetworkManager` / `nmcli`, `systemd-networkd`, `netplan`).
  - Live IPv4 validation and subnet presets.
  - Before-and-after confirmation diff with automatic browser reconnection timer.
  - Hardware adapter auto-detection and link monitoring.

- **⏱️ NTP Time Synchronization & Master Clock**:
  - Live stratum offset, delay, and jitter telemetry via WebSocket.
  - Multi-server master/backup clock hierarchy.
  - Manual step calibration and clock freerun controls.

- **📡 Automated SNMP Trap Broadcasts**:
  - Automated trap dispatch to configured NMS listening stations for:
    - 🌐 **IP Changes** (Interface IP/subnet modifications)
    - ⏱️ **Time Sync** (NTP auto-sync, manual calibration, service restarts)
    - 👤 **New Logins** (Console authentication events)
    - 📝 **New Signups** (User account registration records)
  - Real-time rolling 90-day retention with filterable audit log and CSV export.

- **🔒 Role-Based Access Control**:
  - Authenticated sessions with Admin and Viewer privileges.
  - Secret hotkey audit trail viewer (`Ctrl + Shift + L`).

- **✨ Modern UI & Aesthetics**:
  - Custom design tokens with Google Fonts (`Plus Jakarta Sans` and `JetBrains Mono`).
  - Glassmorphic card containers, micro-interactions, live telemetry status beacons, and seamless Dark/Light theme switching.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, React Router, Socket.IO Client, Axios, Vanilla CSS.
- **Backend**: Python 3, Flask, Gevent-WebSocket, PySNMP, Werkzeug.
- **System Layer**: Linux `iproute2`, `nmcli`, `netplan`, `chrony` / `ntpdate`.

---

## 📦 Getting Started

### 1. Prerequisites
- Linux OS (Ubuntu, Debian, CentOS, or RHEL recommended)
- Node.js (v18+) & npm
- Python 3.10+

### 2. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```
*Backend runs on `http://0.0.0.0:5050`*

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend dev server runs on `http://localhost:5173`*

### 4. Production Build
```bash
cd frontend
npm run build
```

---

## 📄 License
This project is licensed under the MIT License.

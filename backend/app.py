from gevent import monkey
# Patch only network/IO; prevent thread and subprocess deadlocks in Python 3.12
monkey.patch_all()
import gevent

import socket
import threading
import subprocess
import shutil
import time
import struct
import re
import os
import json
import datetime
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.security import generate_password_hash, check_password_hash

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.datetime.now(IST).isoformat()

app = Flask(__name__)
# Static key preserves sessions across restarts
app.secret_key = "netops-production-secret-key"

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False
)

CORS(
    app,
    supports_credentials=True,
    origins=re.compile(r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$")
)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent", manage_session=False)

# ─────────────────────────────────────────────
#  FILE PATHS & LOCKS
# ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUTH_CONFIG_PATH        = os.path.join(BASE_DIR, "auth_config.json")
LOGIN_LOG_PATH          = os.path.join(BASE_DIR, "login_logs.json")
SNMP_LOG_PATH           = os.path.join(BASE_DIR, "snmp_trap_logs.json")
SNMP_CONFIG_PATH        = os.path.join(BASE_DIR, "snmp_config.json")
NTP_SERVERS_CONFIG_PATH = os.path.join(BASE_DIR, "ntp_servers_config.json")
NETWORK_CONFIG_PATH     = os.path.join(BASE_DIR, "network_config.json")

login_log_lock   = threading.Lock()
snmp_log_lock    = threading.Lock()
snmp_config_lock = threading.Lock()
ntp_servers_lock = threading.Lock()

def _read_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return default() if callable(default) else (default if default is not None else {})

def _write_json(path, data, mode=0o666):
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        if mode:
            os.chmod(path, mode)
    except Exception:
        pass

# ─────────────────────────────────────────────
#  AUTHENTICATION & LOGIN AUDIT
# ─────────────────────────────────────────────
def _load_or_create_auth_config():
    cfg = _read_json(AUTH_CONFIG_PATH)
    if cfg:
        if "users" in cfg:
            return cfg
        if cfg.get("username") and cfg.get("password_hash"):
            return {"users": [{"username": cfg["username"], "password_hash": cfg["password_hash"], "role": "admin"}]}

    cfg = {"users": [{"username": "admin", "password_hash": generate_password_hash("admin"), "role": "admin"}]}
    _write_json(AUTH_CONFIG_PATH, cfg)
    return cfg

AUTH_CONFIG = _load_or_create_auth_config()

def record_login_attempt(username, status, ip_address, role=None, reason=None):
    """Saves every login attempt with timestamp, role, IP, and status (capacity: 200)."""
    entry = {
        "timestamp": now_ist(),
        "username": username or "Unknown",
        "status": status,
        "role": role or "—",
        "ip": ip_address,
        "reason": reason or ""
    }
    with login_log_lock:
        logs = _read_json(LOGIN_LOG_PATH, [])
        logs.append(entry)
        if len(logs) > 200:
            logs = logs[-200:]
        _write_json(LOGIN_LOG_PATH, logs)

_AUTH_EXEMPT_PATHS = {"/api/login", "/api/signup", "/api/auth-check"}
_ADMIN_WRITE_PATHS = {
    "/api/change-ip", "/api/reboot", "/api/set-manual-time",
    "/api/ntp-servers", "/api/ntp-restart", "/api/ntp-sync",
    "/api/snmp-config/devices", "/api/snmp-config/settings", "/api/snmp-test"
}

@app.before_request
def _require_login():
    if not request.path.startswith("/api/"):
        return
    if request.method == "OPTIONS":
        return
    if request.path in _AUTH_EXEMPT_PATHS:
        return
    if not session.get("authenticated"):
        return jsonify({"status": "error", "message": "Not authenticated"}), 401
    
    if request.path in _ADMIN_WRITE_PATHS and request.method in ["POST", "PUT", "DELETE"]:
        if session.get("role") != "admin":
            return jsonify({"status": "error", "message": "Access Denied: Read-only viewer privileges"}), 403

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)

    user = next((u for u in AUTH_CONFIG.get("users", []) if u["username"].lower() == username.lower()), None)

    if user and check_password_hash(user.get("password_hash", ""), password):
        session.clear()
        session["authenticated"] = True
        session["username"] = user.get("username")
        session["role"] = user.get("role", "viewer")
        session.permanent = True
        record_login_attempt(username, "SUCCESS", client_ip, role=session["role"])
        send_snmp_trap(f"AUTH [NEW LOGIN]: User '{username}' logged in successfully from {client_ip}")
        return jsonify({"status": "success", "message": "Logged in successfully.", "role": session["role"], "username": session["username"]}), 200

    record_login_attempt(username, "FAILED", client_ip, reason="Invalid credentials")
    return jsonify({"status": "error", "message": "Incorrect username or password."}), 401

@app.route("/api/signup", methods=["POST"])
def api_signup():
    global AUTH_CONFIG
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"status": "error", "message": "Username and password are required."}), 400
    if len(username) < 3:
        return jsonify({"status": "error", "message": "Username must be at least 3 characters."}), 400
    if len(password) < 6:
        return jsonify({"status": "error", "message": "Password must be at least 6 characters."}), 400

    if any(u["username"].lower() == username.lower() for u in AUTH_CONFIG.get("users", [])):
        return jsonify({"status": "error", "message": "Username already exists."}), 409

    new_user = {"username": username, "password_hash": generate_password_hash(password), "role": "viewer"}
    AUTH_CONFIG.setdefault("users", []).append(new_user)
    with open(AUTH_CONFIG_PATH, "w") as f:
        json.dump(AUTH_CONFIG, f, indent=2)

    send_snmp_trap(f"SECURITY [NEW SIGNUP]: New user account created for '{username}'")
    return jsonify({"status": "success", "message": "Account created! Please sign in."}), 201

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"status": "success", "message": "Logged out."}), 200

@app.route("/api/auth-check")
def api_auth_check():
    return jsonify({
        "authenticated": bool(session.get("authenticated")),
        "username": session.get("username"),
        "role": session.get("role", "viewer")
    }), 200

@app.route("/api/change-password", methods=["POST"])
def api_change_password():
    global AUTH_CONFIG
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    uname = session.get("username")

    user = next((u for u in AUTH_CONFIG.get("users", []) if u["username"] == uname), None)
    if not user or not check_password_hash(user.get("password_hash", ""), current):
        return jsonify({"status": "error", "message": "Current password is incorrect."}), 400
    if len(new) < 6:
        return jsonify({"status": "error", "message": "New password must be at least 6 characters."}), 400

    user["password_hash"] = generate_password_hash(new)
    with open(AUTH_CONFIG_PATH, "w") as f:
        json.dump(AUTH_CONFIG, f, indent=2)

    send_snmp_trap(f"SECURITY: Password changed for user '{uname}'")
    return jsonify({"status": "success", "message": "Password updated successfully."}), 200

@app.route("/api/login-logs")
def api_get_login_logs():
    """Confidential: strictly restricted to active admin sessions."""
    if not session.get("authenticated") or session.get("role") != "admin":
        return jsonify({"status": "error", "message": "Access Denied"}), 403

    with login_log_lock:
        logs = _read_json(LOGIN_LOG_PATH, [])
    return jsonify(list(reversed(logs))), 200

# ─────────────────────────────────────────────
#  PERSISTENT SNMP TRAPS (90-DAY RETENTION)
# ─────────────────────────────────────────────
SNMP_DEVICES = [("127.0.0.1", 9162)]
COMMUNITY = "public"
DEFAULT_SNMP_CONFIG = {
    "devices": [{"ip": ip, "port": port} for ip, port in SNMP_DEVICES],
    "community": COMMUNITY,
    "reboot_alert_enabled": True,
    "hw_failure": {"enabled": True, "temp_threshold_c": 75, "check_interval_sec": 30},
}

def _load_and_prune_snmp_logs(days_retention=90):
    """Loads records and drops events older than 90 days (3 months)."""
    logs = _read_json(SNMP_LOG_PATH, [])
    cutoff = datetime.datetime.now(IST) - datetime.timedelta(days=days_retention)
    valid = []
    for entry in logs:
        try:
            if datetime.datetime.fromisoformat(entry["time"]) >= cutoff:
                valid.append(entry)
        except Exception:
            continue
    return valid

def record_snmp_trap(entry):
    """Saves trap to disk while maintaining rolling 90-day retention."""
    with snmp_log_lock:
        logs = _load_and_prune_snmp_logs(days_retention=90)
        logs.append(entry)
        _write_json(SNMP_LOG_PATH, logs)

def send_snmp_trap(message):
    entry = {
        "time": now_ist(),
        "message": message,
        "targets": [f"{ip}:{port}" for ip, port in SNMP_DEVICES]
    }
    record_snmp_trap(entry)
    socketio.emit("snmp_trap", entry)
    return True

def get_snmp_config():
    with snmp_config_lock:
        return _read_json(SNMP_CONFIG_PATH, lambda: json.loads(json.dumps(DEFAULT_SNMP_CONFIG)))

def update_snmp_config(mutator):
    global SNMP_DEVICES, COMMUNITY
    with snmp_config_lock:
        cfg = _read_json(SNMP_CONFIG_PATH, lambda: json.loads(json.dumps(DEFAULT_SNMP_CONFIG)))
        cfg = mutator(cfg)
        _write_json(SNMP_CONFIG_PATH, cfg)
        SNMP_DEVICES = [(d["ip"], d["port"]) for d in cfg.get("devices", [])]
        COMMUNITY = cfg.get("community", "public")
        return cfg

@app.route("/api/snmp-log")
def get_snmp_log():
    with snmp_log_lock:
        logs = _load_and_prune_snmp_logs(days_retention=90)
    return jsonify(list(reversed(logs))), 200

@app.route("/api/snmp-config", methods=["GET"])
def api_snmp_config():
    return jsonify(get_snmp_config()), 200

@app.route("/api/snmp-config/devices", methods=["POST", "DELETE"])
def api_snmp_devices():
    data = request.get_json(silent=True) or {}
    ip = (data.get("ip") or "").strip()
    port = int(data.get("port") or 0)
    if request.method == "POST":
        cfg = update_snmp_config(lambda c: c.setdefault("devices", []).append({"ip": ip, "port": port}) or c)
        return jsonify({"status": "success", "message": f"Added target {ip}:{port}", "config": cfg}), 200
    cfg = update_snmp_config(lambda c: dict(c, devices=[d for d in c.get("devices", []) if not (d["ip"] == ip and d["port"] == port)]))
    return jsonify({"status": "success", "message": f"Removed target {ip}:{port}", "config": cfg}), 200

@app.route("/api/snmp-config/settings", methods=["POST"])
def api_snmp_settings():
    data = request.get_json(silent=True) or {}
    def mutator(cfg):
        if "reboot_alert_enabled" in data:
            cfg["reboot_alert_enabled"] = bool(data["reboot_alert_enabled"])
        return cfg
    cfg = update_snmp_config(mutator)
    return jsonify({"status": "success", "message": "SNMP settings saved.", "config": cfg}), 200

@app.route("/api/snmp-test", methods=["POST"])
def api_snmp_test():
    data = request.get_json(silent=True) or {}
    trap_type = data.get("type", "test")
    custom_msg = (data.get("message") or "").strip()

    if custom_msg:
        msg = custom_msg
    elif trap_type == "ip_change":
        net_info = get_current_network_info()
        adapter = net_info.get("adapter") or "eth0"
        ip = net_info.get("ip") or "192.168.1.100"
        msg = f"NETWORK [IP CHANGE]: Interface {adapter} IP address updated to {ip}"
    elif trap_type == "time_sync":
        msg = "TIME SYNC [NTP]: System clock synchronized with master NTP reference"
    elif trap_type == "new_login":
        uname = session.get("username") or "admin"
        client_ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        msg = f"AUTH [NEW LOGIN]: User '{uname}' logged in successfully from {client_ip}"
    elif trap_type == "new_signup":
        msg = "SECURITY [NEW SIGNUP]: New user registration event captured"
    else:
        msg = "TEST ALERT: Manual test trap dispatched"

    sent = send_snmp_trap(msg)
    return jsonify({"status": "success" if sent else "error", "message": f"Trap dispatched: {msg}"}), 200

# ─────────────────────────────────────────────
#  TELEMETRY & NTP MONITOR
# ─────────────────────────────────────────────
ntp_state = {
    "server": None, "master_server": None, "using_fallback": False,
    "server_time": None, "local_time": None, "offset": None, "delay": None,
    "status": "unknown", "service_running": False, "alert_active": False, "last_checked": None
}
ntp_problem_active = False
FREE_RUNNING = False

NTP_PORT = 123
TIME_THRESHOLD = 1
AUTO_SYNC_THRESHOLD = 2
NTP_CHECK_INTERVAL = 15
DEFAULT_NTP_SERVERS_CONFIG = {"servers": ["time.google.com"]}

def run_cmd(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

def _have(tool):
    return shutil.which(tool) is not None

def get_ntp_servers_config():
    with ntp_servers_lock:
        return _read_json(NTP_SERVERS_CONFIG_PATH, lambda: json.loads(json.dumps(DEFAULT_NTP_SERVERS_CONFIG)))

def set_ntp_servers_config(servers):
    with ntp_servers_lock:
        cfg = {"servers": servers}
        _write_json(NTP_SERVERS_CONFIG_PATH, cfg)
        return cfg

def get_ntp_time(server=None):
    if not server:
        cfg = get_ntp_servers_config()
        servers = cfg.get("servers", [])
        server = servers[0] if servers else "time.google.com"
    host = server
    client = None
    try:
        client = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        client.settimeout(1.5)
        msg = b'\x1b' + 47 * b'\0'
        t1 = time.time()
        client.sendto(msg, (host, NTP_PORT))
        data, _ = client.recvfrom(1024)
        t4 = time.time()
        if data:
            unpacked = struct.unpack("!12I", data)
            t3 = unpacked[10] + float(unpacked[11]) / 2**32
            t3 -= 2208988800
            offset = ((t3 - t1) + (t3 - t4)) / 2
            delay  = t4 - t1
            return {
                "server_time": datetime.datetime.fromtimestamp(t3, IST).isoformat(),
                "local_time":  datetime.datetime.fromtimestamp(t4, IST).isoformat(),
                "offset": round(offset, 6),
                "delay":  round(delay,  6)
            }
    except Exception:
        pass
    finally:
        if client:
            try:
                client.close()
            except Exception:
                pass
    return None

def get_active_ntp_server():
    cfg = get_ntp_servers_config()
    for host in cfg.get("servers", []):
        if not host:
            continue
        data = get_ntp_time(host)
        if data is not None:
            return host, data
    return None, None

def check_ntp_service():
    try:
        for proc in ["chronyd", "ntpd", "systemd-timesyncd"]:
            if os.path.exists(f"/var/run/{proc}.pid") or os.path.exists(f"/run/{proc}.pid"):
                return True
        r = subprocess.run(["pgrep", "-f", "chronyd|ntpd|systemd-timesyncd"], capture_output=True, text=True)
        return r.returncode == 0
    except Exception:
        return False

def restart_ntp_service():
    try:
        for service in ["chrony", "chronyd", "ntp", "ntpd", "systemd-timesyncd"]:
            r = run_cmd(f"systemctl restart {service} 2>/dev/null")
            if r.returncode == 0:
                time.sleep(0.3)
                return True
        return False
    except Exception:
        return False

def sync_time():
    host, ntp_data = get_active_ntp_server()
    try:
        if not ntp_data:
            return False
        server_dt = datetime.datetime.fromisoformat(ntp_data["server_time"])
        target_dt = server_dt + datetime.timedelta(seconds=ntp_data["delay"] / 2)
        iso_str = target_dt.strftime("%Y-%m-%d %H:%M:%S")
        r = run_cmd(f'date -s "{iso_str}"')
        if r.returncode == 0:
            if _have("chronyc"):
                run_cmd("chronyc makestep")
            return True
        return False
    except Exception:
        return False

def set_manual_time(target_dt):
    try:
        iso_str = target_dt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
        r = run_cmd(f'date -s "{iso_str}"')
        if r.returncode == 0:
            if _have("chronyc"):
                run_cmd("chronyc makestep")
            return True
        return False
    except Exception:
        return False

_sync_in_progress = threading.Event()
_local_time_rebaseline = threading.Event()

def _do_sync(offset, source="NTP monitor"):
    global ntp_problem_active
    now = now_ist()
    ntp_state.update({"status": "syncing", "last_checked": now})
    socketio.emit("ntp_update", ntp_state)

    sync_result = sync_time()
    now = now_ist()
    if sync_result:
        ntp_state.update({"status": "synced", "last_checked": now, "alert_active": False, "offset": 0.0})
        if ntp_problem_active:
            send_snmp_trap(f"RECOVERY: NTP TIME SYNCHRONIZED (was {offset:+.3f}s)")
            ntp_problem_active = False
        socketio.emit("ntp_update", ntp_state)
        return True
    else:
        ntp_state.update({"status": "offset", "last_checked": now})
        send_snmp_trap(f"ALERT: Auto-sync failed — offset {offset:+.3f}s")
        socketio.emit("ntp_update", ntp_state)
        return False

def monitor_ntp():
    global ntp_problem_active
    while True:
        cfg = get_ntp_servers_config()
        servers = cfg.get("servers", [])
        master = servers[0] if servers else None
        host, data = get_active_ntp_server()
        now = now_ist()

        if data:
            offset = data["offset"]
            service_ok = check_ntp_service()
            abs_offset = abs(offset)
            on_fallback = bool(master and host != master)

            if FREE_RUNNING:
                status = "free_running"
            elif abs_offset <= TIME_THRESHOLD:
                status = "synced"
            else:
                status = "offset"

            ntp_state.update({
                **data, "server": host, "master_server": master,
                "using_fallback": on_fallback, "status": status,
                "service_running": service_ok, "alert_active": ntp_problem_active,
                "last_checked": now
            })
            socketio.emit("ntp_update", ntp_state)
            if not FREE_RUNNING and abs_offset > AUTO_SYNC_THRESHOLD:
                if not _sync_in_progress.is_set():
                    _sync_in_progress.set()
                    try:
                        _do_sync(offset, source=f"large offset {offset:+.3f}s")
                    finally:
                        _sync_in_progress.clear()
        else:
            ntp_state.update({"status": "unreachable", "server": None, "master_server": master, "using_fallback": False, "last_checked": now})
            socketio.emit("ntp_update", ntp_state)

        gevent.sleep(NTP_CHECK_INTERVAL)

def watch_local_time():
    mono_base = time.monotonic()
    wall_base = time.time()
    while True:
        gevent.sleep(0.5)
        if _local_time_rebaseline.is_set():
            _local_time_rebaseline.clear()
            mono_base = time.monotonic()
            wall_base = time.time()
            continue
        mono_now = time.monotonic()
        wall_now = time.time()
        drift = wall_now - (wall_base + (mono_now - mono_base))
        if abs(drift) > 2.0:
            if not FREE_RUNNING and not _sync_in_progress.is_set():
                _sync_in_progress.set()
                try:
                    _do_sync(drift, source="manual jump")
                finally:
                    _sync_in_progress.clear()
            mono_base = time.monotonic()
            wall_base = time.time()
        else:
            mono_base = mono_now
            wall_base = wall_now

def get_system_uptime_seconds():
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except Exception:
        return None

def get_cpu_temperatures():
    results = []
    try:
        base = "/sys/class/thermal"
        if not os.path.isdir(base):
            return results
        for zone in os.listdir(base):
            if not zone.startswith("thermal_zone"):
                continue
            with open(os.path.join(base, zone, "temp")) as f:
                milli_c = int(f.read().strip())
            results.append((zone, milli_c / 1000.0))
    except Exception:
        pass
    return results

def get_current_network_info():
    try:
        r_link = run_cmd("ip -o link show")
        matches = re.findall(r":\s+([^:@\s]+)", r_link.stdout)
        non_lo = [m for m in matches if m != "lo"]
    except Exception:
        non_lo = ["eth0"]

    try:
        r = run_cmd("ip -4 route show to default")
        iface_m = re.search(r"dev\s+(\S+)", r.stdout)
        
        if iface_m:
            iface = iface_m.group(1)
        else:
            iface = non_lo[0] if non_lo else "eth0"

        r_ip = run_cmd(f"ip -4 -o addr show {iface}")
        ip_m = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)/(\d+)", r_ip.stdout)
        
        ip = "127.0.0.1"
        mask = "255.255.255.0"
        
        if ip_m:
            ip = ip_m.group(1)
            prefix = int(ip_m.group(2))
            mask_int = (0xffffffff >> (32 - prefix)) << (32 - prefix)
            mask = f"{(mask_int >> 24) & 0xff}.{(mask_int >> 16) & 0xff}.{(mask_int >> 8) & 0xff}.{mask_int & 0xff}"

        gw_m = re.search(r"via\s+(\d+\.\d+\.\d+\.\d+)", r.stdout)
        gateway = gw_m.group(1) if gw_m else "192.168.1.1"

        return {
            "adapter": iface,
            "adapters": non_lo,
            "ip": ip,
            "subnet": mask,
            "gateway": gateway
        }
    except Exception:
        return {
            "adapter": "eth0",
            "adapters": non_lo,
            "ip": "127.0.0.1",
            "subnet": "255.255.255.0",
            "gateway": "192.168.1.1"
        }

@app.route("/api/system-info")
def api_system_info():
    uptime = get_system_uptime_seconds()
    boot_time = (datetime.datetime.now(IST) - datetime.timedelta(seconds=uptime)).isoformat() if uptime else None
    return jsonify({"boot_time": boot_time, "uptime_seconds": uptime}), 200

@app.route("/api/current-network")
def api_current_network():
    return jsonify(get_current_network_info()), 200

def subnet_mask_to_cidr(mask_str):
    try:
        return sum(bin(int(x)).count("1") for x in mask_str.split("."))
    except Exception:
        return 24

def apply_permanent_ip(adapter, new_ip, cidr, gateway, subnet="255.255.255.0"):
    """Persists static IP configuration across reboots using all available Linux mechanisms."""
    try:
        with open(NETWORK_CONFIG_PATH, "w") as f:
            json.dump({
                "adapter": adapter,
                "ip": new_ip,
                "cidr": cidr,
                "subnet": subnet,
                "gateway": gateway,
                "applied_at": now_ist()
            }, f, indent=2)
        os.chmod(NETWORK_CONFIG_PATH, 0o666)
    except Exception as e:
        print(f"[NetOps] Warning saving network_config.json: {e}", flush=True)

    persisted = False

    # 1. Method A: NetworkManager (nmcli)
    if _have("nmcli"):
        try:
            con_name = run_cmd(f"nmcli -t -f NAME,DEVICE con show --active | grep ':{adapter}' | cut -d: -f1").stdout.strip()
            if not con_name:
                con_name = run_cmd(f"nmcli -t -f NAME,DEVICE con show | grep ':{adapter}' | cut -d: -f1 | head -n 1").stdout.strip()
            if not con_name:
                con_name = f"netops-{adapter}"
                run_cmd(f"(sudo nmcli con add type ethernet ifname {adapter} con-name '{con_name}' 2>/dev/null || nmcli con add type ethernet ifname {adapter} con-name '{con_name}')")
            
            cmds = [
                f"(sudo nmcli con mod '{con_name}' ipv4.method manual ipv4.addresses {new_ip}/{cidr} ipv4.gateway {gateway} ipv4.dns '8.8.8.8,1.1.1.1' 2>/dev/null || nmcli con mod '{con_name}' ipv4.method manual ipv4.addresses {new_ip}/{cidr} ipv4.gateway {gateway} ipv4.dns '8.8.8.8,1.1.1.1')",
                f"(sudo nmcli con up '{con_name}' 2>/dev/null || nmcli con up '{con_name}')"
            ]
            res = run_cmd(" && ".join(cmds))
            if res.returncode == 0:
                persisted = True
        except Exception as e:
            print(f"[NetOps] nmcli persist error: {e}", flush=True)

    # 2. Method B: Netplan (/etc/netplan/*.yaml)
    netplan_dir = "/etc/netplan"
    if os.path.isdir(netplan_dir):
        try:
            target_file = os.path.join(netplan_dir, "01-netops-static.yaml")
            netplan_config = f"""# Generated permanently by NetOps Console
network:
  version: 2
  renderer: networkd
  ethernets:
    {adapter}:
      dhcp4: false
      addresses:
        - {new_ip}/{cidr}
      routes:
        - to: default
          via: {gateway}
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
"""
            try:
                with open(target_file, "w") as f:
                    f.write(netplan_config)
                os.chmod(target_file, 0o600)
            except Exception:
                run_cmd(f"echo '{netplan_config}' | sudo tee {target_file} >/dev/null && sudo chmod 600 {target_file}")

            run_cmd("(sudo netplan apply 2>/dev/null || netplan apply)")
            persisted = True
        except Exception as e:
            print(f"[NetOps] netplan persist error: {e}", flush=True)

    # 3. Method C: systemd-networkd (/etc/systemd/network/)
    networkd_dir = "/etc/systemd/network"
    if os.path.isdir(networkd_dir):
        try:
            conf_file = os.path.join(networkd_dir, f"10-{adapter}.network")
            content = f"""[Match]
Name={adapter}

[Network]
Address={new_ip}/{cidr}
Gateway={gateway}
DNS=8.8.8.8
"""
            try:
                with open(conf_file, "w") as f:
                    f.write(content)
            except Exception:
                run_cmd(f"echo '{content}' | sudo tee {conf_file} >/dev/null")
            run_cmd("(sudo networkctl reload 2>/dev/null || networkctl reload)")
            persisted = True
        except Exception as e:
            print(f"[NetOps] networkd persist error: {e}", flush=True)

    return persisted


@app.route("/api/change-ip", methods=["POST"])
def change_ip_route():
    data = request.get_json(silent=True) or {}
    adapter = (data.get("adapter") or "").strip()
    new_ip  = (data.get("ip") or "").strip()
    subnet  = (data.get("subnet") or "255.255.255.0").strip()
    gateway = (data.get("gateway") or "").strip()

    ip_pattern = r"^(\d{1,3}\.){3}\d{1,3}$"
    if not re.match(ip_pattern, new_ip):
        return jsonify({"status": "error", "message": "Invalid IP address format."}), 400

    if not adapter:
        adapter = get_current_network_info().get("adapter", "eth0")

    cidr = subnet_mask_to_cidr(subnet)

    def execute_network_change():
        time.sleep(0.5)
        apply_permanent_ip(adapter, new_ip, cidr, gateway, subnet)
        run_cmd(f"(sudo ip addr flush dev {adapter} || ip addr flush dev {adapter}) && (sudo ip addr add {new_ip}/{cidr} dev {adapter} || ip addr add {new_ip}/{cidr} dev {adapter}) && (sudo ip link set {adapter} up || ip link set {adapter} up)")
        if gateway and re.match(ip_pattern, gateway):
            run_cmd(f"(sudo ip route add default via {gateway} dev {adapter} 2>/dev/null || ip route add default via {gateway} dev {adapter} 2>/dev/null || true)")

    threading.Thread(target=execute_network_change, daemon=True).start()
    send_snmp_trap(f"NETWORK [IP CHANGE]: Interface {adapter} statically set to {new_ip}/{cidr} (Gateway: {gateway})")

    return jsonify({
        "status": "success",
        "message": f"IP permanently configured to {new_ip}. Reconnecting to console...",
        "target_ip": new_ip
    }), 200

@app.route("/api/reboot", methods=["POST"])
def reboot_route():
    session.clear()
    threading.Thread(target=lambda: (time.sleep(1.5), run_cmd("reboot || shutdown -r now")), daemon=True).start()
    return jsonify({"status": "success", "message": "System reboot initiated."}), 200

@app.route("/api/ntp-status")
def get_ntp_status():
    return jsonify(ntp_state), 200

@app.route("/api/set-manual-time", methods=["POST"])
def api_set_manual_time():
    global FREE_RUNNING
    data = request.get_json(silent=True) or {}
    raw = (data.get("datetime") or "").strip()
    try:
        target_dt = datetime.datetime.fromisoformat(raw).replace(tzinfo=IST)
    except Exception:
        return jsonify({"status": "error", "message": "Invalid date/time format."}), 400

    FREE_RUNNING = True
    ok = set_manual_time(target_dt)
    if not ok:
        FREE_RUNNING = False
        return jsonify({"status": "error", "message": "Failed to set system time."}), 500

    _local_time_rebaseline.set()
    ntp_state.update({"status": "free_running", "last_checked": now_ist()})
    send_snmp_trap(f"TIME SYNC [MANUAL]: System clock manually synchronized to {raw}")
    socketio.emit("ntp_update", ntp_state)
    return jsonify({"status": "success", "message": "Manual time applied."}), 200

@app.route("/api/ntp-servers", methods=["GET", "POST"])
def api_ntp_servers():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        servers = [s.strip() for s in data.get("servers", []) if isinstance(s, str) and s.strip()]
        cfg = set_ntp_servers_config(servers)
        return jsonify({"status": "success", "message": "NTP servers updated.", "config": cfg}), 200
    return jsonify(get_ntp_servers_config()), 200

@app.route("/api/ntp-restart", methods=["POST"])
def restart_ntp():
    global FREE_RUNNING
    FREE_RUNNING = False
    ok = restart_ntp_service()
    if ok:
        send_snmp_trap("TIME SYNC [NTP]: NTP service daemon restarted for network sync")
    return jsonify({"status": "success" if ok else "error", "message": "NTP Service restarted" if ok else "Restart failed"}), 200

@app.route("/api/ntp-sync", methods=["POST"])
def force_sync():
    if FREE_RUNNING:
        return jsonify({"status": "error", "message": "Clock is free-running. Restart service first."}), 409
    ok = sync_time()
    if ok:
        send_snmp_trap("TIME SYNC [NTP]: Manual NTP time synchronization successful")
    else:
        send_snmp_trap("TIME SYNC [NTP]: Manual NTP time synchronization failed")
    return jsonify({"status": "success" if ok else "error", "message": "Time synchronized" if ok else "Sync failed"}), 200

@app.route("/api/hardware-status")
def api_hardware_status():
    temps = get_cpu_temperatures()
    return jsonify({"temperatures": [{"zone": z, "celsius": round(t, 1)} for z, t in temps], "temp_alert_active": False}), 200

@socketio.on("connect")
def _handle_socket_connect(auth):
    socketio.emit("ntp_update", ntp_state)

def check_and_restore_saved_network():
    """Restores saved static network configuration on system boot if needed."""
    if os.path.exists(NETWORK_CONFIG_PATH):
        try:
            with open(NETWORK_CONFIG_PATH) as f:
                cfg = json.load(f)
            adapter = cfg.get("adapter")
            ip = cfg.get("ip")
            cidr = cfg.get("cidr", 24)
            gw = cfg.get("gateway")
            if adapter and ip:
                curr = get_current_network_info()
                if curr.get("ip") != ip:
                    print(f"[NetOps] Restoring saved static IP {ip}/{cidr} on {adapter}...", flush=True)
                    run_cmd(f"(sudo ip addr add {ip}/{cidr} dev {adapter} 2>/dev/null || ip addr add {ip}/{cidr} dev {adapter} 2>/dev/null)")
                    if gw:
                        run_cmd(f"(sudo ip route add default via {gw} dev {adapter} 2>/dev/null || ip route add default via {gw} dev {adapter} 2>/dev/null || true)")
        except Exception as e:
            print(f"[NetOps] Warning restoring network on boot: {e}", flush=True)

if __name__ == "__main__":
    check_and_restore_saved_network()
    print("[NetOps] Spawning telemetry workers...", flush=True)
    gevent.spawn(monitor_ntp)
    gevent.spawn(watch_local_time)
    print("[NetOps] WSGI Engine listening on http://0.0.0.0:5050", flush=True)
    socketio.run(app, host="0.0.0.0", port=5050, allow_unsafe_werkzeug=True, debug=False, use_reloader=False)
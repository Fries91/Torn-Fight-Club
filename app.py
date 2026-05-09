import os
import sqlite3
import secrets
import time
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

APP_NAME = "Torn Fight Club"
DB_PATH = os.environ.get("DB_PATH", "/tmp/torn_fight_club.sqlite3")
TORN_API_BASE = os.environ.get("TORN_API_BASE", "https://api.torn.com")
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "12"))

# Built-in admins
ADMIN_IDS = {
    3679030,  # Fries91
    2976364,  # SageUFT
}

app = Flask(__name__, static_folder="static")
CORS(app)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            torn_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            session_token TEXT,
            session_created INTEGER,
            prediction_points INTEGER NOT NULL DEFAULT 1000,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            theme TEXT NOT NULL DEFAULT 'Chaos Night',
            status TEXT NOT NULL DEFAULT 'planned',
            starts_at TEXT,
            created_by INTEGER,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fighters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER,
            torn_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            nickname TEXT,
            stats_range TEXT,
            loadout TEXT,
            rank_points INTEGER NOT NULL DEFAULT 0,
            record_w INTEGER NOT NULL DEFAULT 0,
            record_l INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER,
            fighter_a_id INTEGER NOT NULL,
            fighter_b_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled',
            round_name TEXT DEFAULT 'Fight Card',
            rule_set TEXT DEFAULT 'Nearly naked chaos loadouts only',
            odds_a REAL DEFAULT 1.90,
            odds_b REAL DEFAULT 1.90,
            winner_fighter_id INTEGER,
            result_method TEXT,
            starts_at TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fight_id INTEGER NOT NULL,
            user_torn_id INTEGER NOT NULL,
            pick_fighter_id INTEGER NOT NULL,
            points INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(fight_id, user_torn_id)
        );

        CREATE TABLE IF NOT EXISTS ideas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_torn_id INTEGER,
            name TEXT,
            idea TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """)
        # Seed demo event if none exists.
        count = con.execute("SELECT COUNT(*) c FROM events").fetchone()["c"]
        if count == 0:
            con.execute(
                "INSERT INTO events(title, theme, status, starts_at, created_by, created_at) VALUES(?,?,?,?,?,?)",
                ("Opening Chaos Night", "Pillow Fight Championship", "planned", "", 3679030, now_iso()),
            )

init_db()

def rowdict(row):
    return dict(row) if row else None

def get_token():
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.headers.get("X-TFC-Token") or request.args.get("token")

def current_user():
    token = get_token()
    if not token:
        return None
    with db() as con:
        return rowdict(con.execute("SELECT * FROM users WHERE session_token=?", (token,)).fetchone())

def require_login(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify({"ok": False, "error": "Login required"}), 401
        request.user = u
        return fn(*args, **kwargs)
    return wrapper

def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify({"ok": False, "error": "Login required"}), 401
        if int(u["torn_id"]) not in ADMIN_IDS and u.get("role") != "admin":
            return jsonify({"ok": False, "error": "Admin only"}), 403
        request.user = u
        return fn(*args, **kwargs)
    return wrapper

def torn_basic_from_key(api_key):
    # Uses basic/profile-style public identity only.
    url = f"{TORN_API_BASE}/user/"
    r = requests.get(url, params={"selections": "basic", "key": api_key}, timeout=REQUEST_TIMEOUT)
    data = r.json()
    if "error" in data:
        raise ValueError(data["error"].get("error", "Torn API error"))
    torn_id = int(data.get("player_id") or data.get("id") or 0)
    name = data.get("name") or f"Player {torn_id}"
    if not torn_id:
        raise ValueError("Could not read Torn player id from API response")
    return torn_id, name

@app.get("/")
def home():
    return jsonify({
        "ok": True,
        "app": APP_NAME,
        "note": "Prediction points are for entertainment only. No real cash/items betting is handled."
    })

@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    api_key = (data.get("api_key") or "").strip()
    if not api_key:
        return jsonify({"ok": False, "error": "API key required"}), 400
    try:
        torn_id, name = torn_basic_from_key(api_key)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not verify Torn key: {e}"}), 400

    token = secrets.token_urlsafe(32)
    role = "admin" if torn_id in ADMIN_IDS else "member"
    with db() as con:
        existing = con.execute("SELECT prediction_points FROM users WHERE torn_id=?", (torn_id,)).fetchone()
        points = existing["prediction_points"] if existing else 1000
        con.execute("""
            INSERT INTO users(torn_id, name, role, session_token, session_created, prediction_points, created_at)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(torn_id) DO UPDATE SET
              name=excluded.name,
              role=excluded.role,
              session_token=excluded.session_token,
              session_created=excluded.session_created
        """, (torn_id, name, role, token, int(time.time()), points, now_iso()))
    return jsonify({"ok": True, "token": token, "user": {"torn_id": torn_id, "name": name, "role": role, "prediction_points": points}})

@app.get("/api/me")
@require_login
def me():
    return jsonify({"ok": True, "user": {k: request.user[k] for k in request.user.keys() if k != "session_token"}})

@app.get("/api/state")
def state():
    token_user = current_user()
    with db() as con:
        events = [dict(x) for x in con.execute("SELECT * FROM events ORDER BY id DESC").fetchall()]
        fighters = [dict(x) for x in con.execute("SELECT * FROM fighters WHERE active=1 ORDER BY rank_points DESC, name ASC").fetchall()]
        fights = [dict(x) for x in con.execute("""
            SELECT f.*,
                   fa.name AS fighter_a_name, fa.nickname AS fighter_a_nick,
                   fb.name AS fighter_b_name, fb.nickname AS fighter_b_nick
            FROM fights f
            JOIN fighters fa ON fa.id=f.fighter_a_id
            JOIN fighters fb ON fb.id=f.fighter_b_id
            ORDER BY CASE f.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'done' THEN 2 ELSE 3 END, f.id DESC
        """).fetchall()]
        ideas = [dict(x) for x in con.execute("SELECT * FROM ideas ORDER BY id DESC LIMIT 50").fetchall()]
        leaderboard = [dict(x) for x in con.execute("""
            SELECT torn_id, name, prediction_points, role FROM users ORDER BY prediction_points DESC, name ASC LIMIT 25
        """).fetchall()]
    return jsonify({
        "ok": True,
        "user": {k: token_user[k] for k in token_user.keys() if k != "session_token"} if token_user else None,
        "admins": sorted(list(ADMIN_IDS)),
        "events": events,
        "fighters": fighters,
        "fights": fights,
        "ideas": ideas,
        "leaderboard": leaderboard,
        "safety_note": "Prediction points only. Do not use this app to handle real Torn money, items, or off-platform gambling."
    })

@app.post("/api/fighters/register")
@require_login
def register_fighter():
    data = request.get_json(force=True, silent=True) or {}
    event_id = int(data.get("event_id") or 1)
    nickname = (data.get("nickname") or "").strip()[:60]
    stats_range = (data.get("stats_range") or "").strip()[:80]
    loadout = (data.get("loadout") or "").strip()[:160]
    with db() as con:
        con.execute("""
            INSERT INTO fighters(event_id, torn_id, name, nickname, stats_range, loadout, created_at)
            VALUES(?,?,?,?,?,?,?)
        """, (event_id, request.user["torn_id"], request.user["name"], nickname, stats_range, loadout, now_iso()))
    return jsonify({"ok": True})

@app.post("/api/ideas")
@require_login
def add_idea():
    data = request.get_json(force=True, silent=True) or {}
    idea = (data.get("idea") or "").strip()
    if not idea:
        return jsonify({"ok": False, "error": "Idea required"}), 400
    with db() as con:
        con.execute("INSERT INTO ideas(user_torn_id, name, idea, created_at) VALUES(?,?,?,?)",
                    (request.user["torn_id"], request.user["name"], idea[:500], now_iso()))
    return jsonify({"ok": True})

@app.post("/api/predictions")
@require_login
def predict():
    data = request.get_json(force=True, silent=True) or {}
    fight_id = int(data.get("fight_id") or 0)
    pick_fighter_id = int(data.get("pick_fighter_id") or 0)
    points = int(data.get("points") or 0)
    if points < 1 or points > 100:
        return jsonify({"ok": False, "error": "Pick between 1 and 100 fun points"}), 400

    with db() as con:
        user = con.execute("SELECT prediction_points FROM users WHERE torn_id=?", (request.user["torn_id"],)).fetchone()
        if not user or user["prediction_points"] < points:
            return jsonify({"ok": False, "error": "Not enough fun prediction points"}), 400
        fight = con.execute("SELECT * FROM fights WHERE id=? AND status IN ('scheduled','live')", (fight_id,)).fetchone()
        if not fight:
            return jsonify({"ok": False, "error": "Fight is not open for predictions"}), 400
        if pick_fighter_id not in (fight["fighter_a_id"], fight["fighter_b_id"]):
            return jsonify({"ok": False, "error": "Pick must be one of the two fighters"}), 400
        try:
            con.execute("INSERT INTO predictions(fight_id, user_torn_id, pick_fighter_id, points, created_at) VALUES(?,?,?,?,?)",
                        (fight_id, request.user["torn_id"], pick_fighter_id, points, now_iso()))
            con.execute("UPDATE users SET prediction_points=prediction_points-? WHERE torn_id=?", (points, request.user["torn_id"]))
        except sqlite3.IntegrityError:
            return jsonify({"ok": False, "error": "You already picked this fight"}), 400
    return jsonify({"ok": True})

@app.post("/api/admin/events")
@require_admin
def admin_event():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "Fight Night").strip()[:100]
    theme = (data.get("theme") or "Chaos Night").strip()[:100]
    starts_at = (data.get("starts_at") or "").strip()[:80]
    with db() as con:
        cur = con.execute("INSERT INTO events(title, theme, status, starts_at, created_by, created_at) VALUES(?,?,?,?,?,?)",
                          (title, theme, "planned", starts_at, request.user["torn_id"], now_iso()))
    return jsonify({"ok": True, "event_id": cur.lastrowid})

@app.post("/api/admin/fights")
@require_admin
def admin_fight():
    data = request.get_json(force=True, silent=True) or {}
    event_id = int(data.get("event_id") or 1)
    fighter_a_id = int(data.get("fighter_a_id") or 0)
    fighter_b_id = int(data.get("fighter_b_id") or 0)
    if fighter_a_id == fighter_b_id:
        return jsonify({"ok": False, "error": "Choose two different fighters"}), 400
    rule_set = (data.get("rule_set") or "Nearly naked chaos loadouts only").strip()[:240]
    round_name = (data.get("round_name") or "Fight Card").strip()[:80]
    starts_at = (data.get("starts_at") or "").strip()[:80]
    odds_a = float(data.get("odds_a") or 1.9)
    odds_b = float(data.get("odds_b") or 1.9)
    with db() as con:
        for fid in (fighter_a_id, fighter_b_id):
            if not con.execute("SELECT id FROM fighters WHERE id=?", (fid,)).fetchone():
                return jsonify({"ok": False, "error": f"Fighter {fid} not found"}), 400
        cur = con.execute("""
            INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)
        """, (event_id, fighter_a_id, fighter_b_id, "scheduled", round_name, rule_set, odds_a, odds_b, starts_at, now_iso()))
    return jsonify({"ok": True, "fight_id": cur.lastrowid})

@app.post("/api/admin/fights/<int:fight_id>/status")
@require_admin
def admin_fight_status(fight_id):
    data = request.get_json(force=True, silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in ("scheduled", "live", "done", "cancelled"):
        return jsonify({"ok": False, "error": "Bad status"}), 400
    with db() as con:
        con.execute("UPDATE fights SET status=? WHERE id=?", (status, fight_id))
    return jsonify({"ok": True})

@app.post("/api/admin/fights/<int:fight_id>/result")
@require_admin
def admin_result(fight_id):
    data = request.get_json(force=True, silent=True) or {}
    winner_fighter_id = int(data.get("winner_fighter_id") or 0)
    result_method = (data.get("result_method") or "KO").strip()[:80]
    with db() as con:
        fight = con.execute("SELECT * FROM fights WHERE id=?", (fight_id,)).fetchone()
        if not fight:
            return jsonify({"ok": False, "error": "Fight not found"}), 404
        if winner_fighter_id not in (fight["fighter_a_id"], fight["fighter_b_id"]):
            return jsonify({"ok": False, "error": "Winner must be in the fight"}), 400

        con.execute("UPDATE fights SET status='done', winner_fighter_id=?, result_method=? WHERE id=?",
                    (winner_fighter_id, result_method, fight_id))
        loser = fight["fighter_b_id"] if winner_fighter_id == fight["fighter_a_id"] else fight["fighter_a_id"]
        con.execute("UPDATE fighters SET record_w=record_w+1, rank_points=rank_points+3 WHERE id=?", (winner_fighter_id,))
        con.execute("UPDATE fighters SET record_l=record_l+1 WHERE id=?", (loser,))

        preds = con.execute("SELECT * FROM predictions WHERE fight_id=?", (fight_id,)).fetchall()
        odds = float(fight["odds_a"] if winner_fighter_id == fight["fighter_a_id"] else fight["odds_b"])
        for p in preds:
            if p["pick_fighter_id"] == winner_fighter_id:
                payout = max(1, int(round(p["points"] * odds)))
                con.execute("UPDATE users SET prediction_points=prediction_points+? WHERE torn_id=?",
                            (payout, p["user_torn_id"]))
    return jsonify({"ok": True})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

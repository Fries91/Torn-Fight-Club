import os
import sqlite3
import secrets
import time
import json
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

APP_NAME = "Torn Fight Club"
DB_PATH = os.environ.get("DB_PATH", "/var/data/torn_fight_club.sqlite3")
TORN_API_BASE = os.environ.get("TORN_API_BASE", "https://api.torn.com")
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "12"))

ADMIN_IDS = {
    3679030,  # Fries91
    1905671,  # Slimyfleshlite
}

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)


@app.after_request
def add_no_cache_headers(response):
    if request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def rowdict(row):
    return dict(row) if row else None


def safe_json(value, default=None):
    if default is None:
        default = []
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def add_column_if_missing(con, table, column, ddl):
    cols = [r["name"] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


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

            CREATE TABLE IF NOT EXISTS tournaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                title TEXT NOT NULL,
                format TEXT NOT NULL DEFAULT 'single_elim',
                status TEXT NOT NULL DEFAULT 'planned',
                notes TEXT,
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tournament_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tournament_id INTEGER NOT NULL,
                fighter_id INTEGER NOT NULL,
                seed INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                UNIQUE(tournament_id, fighter_id)
            );

            CREATE TABLE IF NOT EXISTS belts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                division TEXT,
                holder_fighter_id INTEGER,
                status TEXT NOT NULL DEFAULT 'active',
                history_json TEXT DEFAULT '[]',
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                name TEXT NOT NULL,
                captain_torn_id INTEGER,
                members_json TEXT DEFAULT '[]',
                notes TEXT,
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS referees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                torn_id INTEGER,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                notes TEXT,
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_torn_id INTEGER,
                action TEXT NOT NULL,
                target TEXT,
                details_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL
            );
        """)

        # Migration columns for old databases.
        add_column_if_missing(con, "events", "starts_at", "TEXT")
        add_column_if_missing(con, "events", "created_by", "INTEGER")
        add_column_if_missing(con, "events", "created_at", "TEXT DEFAULT ''")
        add_column_if_missing(con, "fighters", "active", "INTEGER NOT NULL DEFAULT 1")
        add_column_if_missing(con, "fights", "starts_at", "TEXT")
        add_column_if_missing(con, "fights", "created_at", "TEXT DEFAULT ''")

        con.execute("UPDATE users SET role='member' WHERE torn_id NOT IN (?, ?)", tuple(ADMIN_IDS))
        for admin_id in ADMIN_IDS:
            con.execute("UPDATE users SET role='admin' WHERE torn_id=?", (admin_id,))

        count = con.execute("SELECT COUNT(*) AS c FROM events").fetchone()["c"]
        if count == 0:
            con.execute(
                """
                INSERT INTO events(title, theme, status, starts_at, created_by, created_at)
                VALUES(?,?,?,?,?,?)
                """,
                ("Opening Chaos Night", "Pillow Fight Championship", "planned", "", 3679030, now_iso()),
            )


init_db()


def audit(con, admin_id, action, target="", details=None):
    con.execute(
        "INSERT INTO audit_log(admin_torn_id, action, target, details_json, created_at) VALUES(?,?,?,?,?)",
        (admin_id, action, target, json.dumps(details or {}), now_iso()),
    )


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


def public_user(u):
    if not u:
        return None
    return {
        "torn_id": u["torn_id"],
        "name": u["name"],
        "role": u["role"],
        "prediction_points": u["prediction_points"],
        "created_at": u["created_at"],
    }


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
        if int(u["torn_id"]) not in ADMIN_IDS and u["role"] != "admin":
            return jsonify({"ok": False, "error": "Admin only"}), 403
        request.user = u
        return fn(*args, **kwargs)
    return wrapper


def torn_basic_from_key(api_key):
    url = f"{TORN_API_BASE.rstrip('/')}/user/"
    r = requests.get(
        url,
        params={"selections": "basic", "key": api_key},
        timeout=REQUEST_TIMEOUT,
    )
    data = r.json()
    if "error" in data:
        err = data["error"]
        raise ValueError(err.get("error", "Torn API error") if isinstance(err, dict) else str(err))

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
        "version": "2.0.0",
        "admins": sorted(list(ADMIN_IDS)),
        "userscript": "https://torn-fight-club.onrender.com/static/torn-fight-club.user.js",
        "note": "Prediction points are for entertainment only. This app does not handle real Torn money/items betting.",
    })


@app.get("/health")
def health():
    try:
        with db() as con:
            con.execute("SELECT 1").fetchone()
        return jsonify({"ok": True, "db": "ok", "app": APP_NAME})
    except Exception as e:
        return jsonify({"ok": False, "db": "error", "error": str(e)}), 500


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
        existing = con.execute("SELECT prediction_points, created_at FROM users WHERE torn_id=?", (torn_id,)).fetchone()
        points = existing["prediction_points"] if existing else 1000
        created_at = existing["created_at"] if existing else now_iso()
        con.execute(
            """
            INSERT INTO users(torn_id, name, role, session_token, session_created, prediction_points, created_at)
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(torn_id) DO UPDATE SET
              name=excluded.name,
              role=excluded.role,
              session_token=excluded.session_token,
              session_created=excluded.session_created
            """,
            (torn_id, name, role, token, int(time.time()), points, created_at),
        )

    return jsonify({"ok": True, "token": token, "user": {"torn_id": torn_id, "name": name, "role": role, "prediction_points": points}})


@app.get("/api/me")
@require_login
def me():
    return jsonify({"ok": True, "user": public_user(request.user)})


@app.get("/api/state")
def state():
    token_user = current_user()
    with db() as con:
        events = [dict(x) for x in con.execute("SELECT * FROM events ORDER BY id DESC").fetchall()]
        fighters = [dict(x) for x in con.execute("SELECT * FROM fighters WHERE active=1 ORDER BY rank_points DESC, record_w DESC, name ASC").fetchall()]
        fights = [dict(x) for x in con.execute("""
            SELECT f.*,
                   fa.name AS fighter_a_name,
                   fa.nickname AS fighter_a_nick,
                   fb.name AS fighter_b_name,
                   fb.nickname AS fighter_b_nick
            FROM fights f
            JOIN fighters fa ON fa.id=f.fighter_a_id
            JOIN fighters fb ON fb.id=f.fighter_b_id
            ORDER BY
              CASE f.status
                WHEN 'live' THEN 0
                WHEN 'scheduled' THEN 1
                WHEN 'done' THEN 2
                ELSE 3
              END,
              f.id DESC
        """).fetchall()]
        ideas = [dict(x) for x in con.execute("SELECT * FROM ideas ORDER BY id DESC LIMIT 75").fetchall()]
        leaderboard = [dict(x) for x in con.execute("""
            SELECT torn_id, name, prediction_points, role
            FROM users
            ORDER BY prediction_points DESC, name ASC
            LIMIT 30
        """).fetchall()]

        predictions = []
        if token_user:
            predictions = [dict(x) for x in con.execute("""
                SELECT p.*, f.status
                FROM predictions p
                JOIN fights f ON f.id=p.fight_id
                WHERE p.user_torn_id=?
                ORDER BY p.id DESC
            """, (token_user["torn_id"],)).fetchall()]

        tournaments = [dict(x) for x in con.execute("SELECT * FROM tournaments ORDER BY id DESC").fetchall()]
        entries = [dict(x) for x in con.execute("""
            SELECT te.*, fi.name, fi.nickname, fi.torn_id, fi.record_w, fi.record_l, fi.rank_points
            FROM tournament_entries te
            JOIN fighters fi ON fi.id=te.fighter_id
            ORDER BY te.tournament_id DESC, te.seed ASC, te.id ASC
        """).fetchall()]
        belts = [dict(x) for x in con.execute("""
            SELECT b.*, fi.name AS holder_name, fi.nickname AS holder_nick, fi.torn_id AS holder_torn_id
            FROM belts b
            LEFT JOIN fighters fi ON fi.id=b.holder_fighter_id
            ORDER BY b.id DESC
        """).fetchall()]
        teams = [dict(x) for x in con.execute("SELECT * FROM teams ORDER BY id DESC").fetchall()]
        referees = [dict(x) for x in con.execute("SELECT * FROM referees ORDER BY id DESC").fetchall()]
        audit_rows = [dict(x) for x in con.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 50").fetchall()]

    for b in belts:
        b["history"] = safe_json(b.pop("history_json", "[]"), [])
    for t in teams:
        t["members"] = safe_json(t.pop("members_json", "[]"), [])
    for a in audit_rows:
        a["details"] = safe_json(a.pop("details_json", "{}"), {})

    return jsonify({
        "ok": True,
        "user": public_user(token_user),
        "admins": sorted(list(ADMIN_IDS)),
        "events": events,
        "fighters": fighters,
        "fights": fights,
        "ideas": ideas,
        "leaderboard": leaderboard,
        "my_predictions": predictions,
        "tournaments": tournaments,
        "tournament_entries": entries,
        "belts": belts,
        "teams": teams,
        "referees": referees,
        "audit": audit_rows,
        "safety_note": "Prediction points only. Do not use this app to handle real Torn money, items, or off-platform gambling.",
    })


@app.post("/api/fighters/register")
@require_login
def register_fighter():
    data = request.get_json(force=True, silent=True) or {}
    event_id = int(data.get("event_id") or 1)
    nickname = (data.get("nickname") or "").strip()[:60]
    stats_range = (data.get("stats_range") or "").strip()[:80]
    loadout = (data.get("loadout") or "").strip()[:180]

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
        con.execute("INSERT INTO ideas(user_torn_id, name, idea, created_at) VALUES(?,?,?,?)", (request.user["torn_id"], request.user["name"], idea[:650], now_iso()))
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
            con.execute("INSERT INTO predictions(fight_id, user_torn_id, pick_fighter_id, points, created_at) VALUES(?,?,?,?,?)", (fight_id, request.user["torn_id"], pick_fighter_id, points, now_iso()))
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
        cur = con.execute("INSERT INTO events(title, theme, status, starts_at, created_by, created_at) VALUES(?,?,?,?,?,?)", (title, theme, "planned", starts_at, request.user["torn_id"], now_iso()))
        event_id = cur.lastrowid
        audit(con, request.user["torn_id"], "create_event", f"event:{event_id}", {"title": title})
    return jsonify({"ok": True, "event_id": event_id})


@app.post("/api/admin/events/<int:event_id>/update")
@require_admin
def admin_update_event(event_id):
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()[:100]
    theme = (data.get("theme") or "").strip()[:100]
    status = (data.get("status") or "").strip()
    starts_at = (data.get("starts_at") or "").strip()[:80]

    if status and status not in ("planned", "open", "live", "done", "cancelled"):
        return jsonify({"ok": False, "error": "Bad status"}), 400

    fields, vals = [], []
    if title:
        fields.append("title=?"); vals.append(title)
    if theme:
        fields.append("theme=?"); vals.append(theme)
    if status:
        fields.append("status=?"); vals.append(status)
    if starts_at or "starts_at" in data:
        fields.append("starts_at=?"); vals.append(starts_at)

    if not fields:
        return jsonify({"ok": False, "error": "No event changes"}), 400

    vals.append(event_id)
    with db() as con:
        con.execute(f"UPDATE events SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_event", f"event:{event_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/fights")
@require_admin
def admin_fight():
    data = request.get_json(force=True, silent=True) or {}
    event_id = int(data.get("event_id") or 1)
    fighter_a_id = int(data.get("fighter_a_id") or 0)
    fighter_b_id = int(data.get("fighter_b_id") or 0)

    if fighter_a_id <= 0 or fighter_b_id <= 0:
        return jsonify({"ok": False, "error": "Both fighter IDs are required"}), 400
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
        cur = con.execute("INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (event_id, fighter_a_id, fighter_b_id, "scheduled", round_name, rule_set, odds_a, odds_b, starts_at, now_iso()))
        fight_id = cur.lastrowid
        audit(con, request.user["torn_id"], "create_fight", f"fight:{fight_id}", data)
    return jsonify({"ok": True, "fight_id": fight_id})


@app.post("/api/admin/fights/<int:fight_id>/update")
@require_admin
def admin_update_fight(fight_id):
    data = request.get_json(force=True, silent=True) or {}
    allowed = {
        "event_id": "INTEGER",
        "fighter_a_id": "INTEGER",
        "fighter_b_id": "INTEGER",
        "status": "TEXT",
        "round_name": "TEXT",
        "rule_set": "TEXT",
        "odds_a": "REAL",
        "odds_b": "REAL",
        "winner_fighter_id": "INTEGER",
        "result_method": "TEXT",
        "starts_at": "TEXT",
    }
    fields, vals = [], []
    for key in allowed:
        if key in data:
            val = data.get(key)
            if key == "status" and val not in ("scheduled", "live", "done", "cancelled"):
                return jsonify({"ok": False, "error": "Bad status"}), 400
            fields.append(f"{key}=?")
            vals.append(val)

    if not fields:
        return jsonify({"ok": False, "error": "No fight changes"}), 400

    vals.append(fight_id)
    with db() as con:
        con.execute(f"UPDATE fights SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_fight", f"fight:{fight_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/fights/<int:fight_id>/status")
@require_admin
def admin_fight_status(fight_id):
    data = request.get_json(force=True, silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in ("scheduled", "live", "done", "cancelled"):
        return jsonify({"ok": False, "error": "Bad status"}), 400

    with db() as con:
        con.execute("UPDATE fights SET status=? WHERE id=?", (status, fight_id))
        audit(con, request.user["torn_id"], "set_fight_status", f"fight:{fight_id}", {"status": status})
    return jsonify({"ok": True})


@app.post("/api/admin/fights/<int:fight_id>/delete")
@require_admin
def admin_delete_fight(fight_id):
    with db() as con:
        con.execute("DELETE FROM predictions WHERE fight_id=?", (fight_id,))
        con.execute("DELETE FROM fights WHERE id=?", (fight_id,))
        audit(con, request.user["torn_id"], "delete_fight", f"fight:{fight_id}", {})
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

        loser_id = fight["fighter_b_id"] if winner_fighter_id == fight["fighter_a_id"] else fight["fighter_a_id"]
        con.execute("UPDATE fights SET status='done', winner_fighter_id=?, result_method=? WHERE id=?", (winner_fighter_id, result_method, fight_id))
        con.execute("UPDATE fighters SET record_w=record_w+1, rank_points=rank_points+3 WHERE id=?", (winner_fighter_id,))
        con.execute("UPDATE fighters SET record_l=record_l+1 WHERE id=?", (loser_id,))

        preds = con.execute("SELECT * FROM predictions WHERE fight_id=?", (fight_id,)).fetchall()
        odds = float(fight["odds_a"] if winner_fighter_id == fight["fighter_a_id"] else fight["odds_b"])
        for p in preds:
            if p["pick_fighter_id"] == winner_fighter_id:
                payout = max(1, int(round(p["points"] * odds)))
                con.execute("UPDATE users SET prediction_points=prediction_points+? WHERE torn_id=?", (payout, p["user_torn_id"]))
        audit(con, request.user["torn_id"], "save_result", f"fight:{fight_id}", {"winner": winner_fighter_id, "method": result_method})

    return jsonify({"ok": True})


@app.post("/api/admin/fighters/<int:fighter_id>/remove")
@require_admin
def remove_fighter(fighter_id):
    with db() as con:
        con.execute("UPDATE fighters SET active=0 WHERE id=?", (fighter_id,))
        audit(con, request.user["torn_id"], "remove_fighter", f"fighter:{fighter_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/points/adjust")
@require_admin
def adjust_points():
    data = request.get_json(force=True, silent=True) or {}
    torn_id = int(data.get("torn_id") or 0)
    amount = int(data.get("amount") or 0)
    reason = (data.get("reason") or "Admin adjustment").strip()[:160]
    if not torn_id or amount == 0:
        return jsonify({"ok": False, "error": "torn_id and amount are required"}), 400
    with db() as con:
        con.execute("UPDATE users SET prediction_points=prediction_points+? WHERE torn_id=?", (amount, torn_id))
        audit(con, request.user["torn_id"], "adjust_points", f"user:{torn_id}", {"amount": amount, "reason": reason})
    return jsonify({"ok": True})


@app.post("/api/admin/tournaments")
@require_admin
def create_tournament():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "Fight Club Tournament").strip()[:100]
    event_id = int(data.get("event_id") or 1)
    fmt = (data.get("format") or "single_elim").strip()[:40]
    notes = (data.get("notes") or "").strip()[:500]
    with db() as con:
        cur = con.execute("INSERT INTO tournaments(event_id, title, format, status, notes, created_by, created_at) VALUES(?,?,?,?,?,?,?)", (event_id, title, fmt, "planned", notes, request.user["torn_id"], now_iso()))
        tid = cur.lastrowid
        audit(con, request.user["torn_id"], "create_tournament", f"tournament:{tid}", data)
    return jsonify({"ok": True, "tournament_id": tid})


@app.post("/api/admin/tournaments/<int:tournament_id>/status")
@require_admin
def tournament_status(tournament_id):
    data = request.get_json(force=True, silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in ("planned", "open", "live", "done", "cancelled"):
        return jsonify({"ok": False, "error": "Bad status"}), 400
    with db() as con:
        con.execute("UPDATE tournaments SET status=? WHERE id=?", (status, tournament_id))
        audit(con, request.user["torn_id"], "set_tournament_status", f"tournament:{tournament_id}", {"status": status})
    return jsonify({"ok": True})


@app.post("/api/admin/tournaments/<int:tournament_id>/entries")
@require_admin
def add_tournament_entry(tournament_id):
    data = request.get_json(force=True, silent=True) or {}
    fighter_id = int(data.get("fighter_id") or 0)
    seed = int(data.get("seed") or 0)
    if not fighter_id:
        return jsonify({"ok": False, "error": "fighter_id required"}), 400
    with db() as con:
        try:
            con.execute("INSERT INTO tournament_entries(tournament_id, fighter_id, seed, created_at) VALUES(?,?,?,?)", (tournament_id, fighter_id, seed, now_iso()))
        except sqlite3.IntegrityError:
            return jsonify({"ok": False, "error": "Fighter already in tournament"}), 400
        audit(con, request.user["torn_id"], "add_tournament_entry", f"tournament:{tournament_id}", {"fighter_id": fighter_id, "seed": seed})
    return jsonify({"ok": True})


@app.post("/api/admin/belts")
@require_admin
def create_belt():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "Fight Club Belt").strip()[:100]
    division = (data.get("division") or "Open Chaos").strip()[:80]
    holder_fighter_id = data.get("holder_fighter_id")
    holder_fighter_id = int(holder_fighter_id) if holder_fighter_id else None
    history = [{"at": now_iso(), "action": "created", "holder_fighter_id": holder_fighter_id}]
    with db() as con:
        cur = con.execute("INSERT INTO belts(name, division, holder_fighter_id, status, history_json, created_by, created_at) VALUES(?,?,?,?,?,?,?)", (name, division, holder_fighter_id, "active", json.dumps(history), request.user["torn_id"], now_iso()))
        bid = cur.lastrowid
        audit(con, request.user["torn_id"], "create_belt", f"belt:{bid}", data)
    return jsonify({"ok": True, "belt_id": bid})


@app.post("/api/admin/belts/<int:belt_id>/assign")
@require_admin
def assign_belt(belt_id):
    data = request.get_json(force=True, silent=True) or {}
    holder_fighter_id = int(data.get("holder_fighter_id") or 0)
    note = (data.get("note") or "Belt assigned").strip()[:160]
    if not holder_fighter_id:
        return jsonify({"ok": False, "error": "holder_fighter_id required"}), 400
    with db() as con:
        b = con.execute("SELECT * FROM belts WHERE id=?", (belt_id,)).fetchone()
        if not b:
            return jsonify({"ok": False, "error": "Belt not found"}), 404
        hist = safe_json(b["history_json"], [])
        hist.append({"at": now_iso(), "action": "assigned", "holder_fighter_id": holder_fighter_id, "note": note})
        con.execute("UPDATE belts SET holder_fighter_id=?, history_json=? WHERE id=?", (holder_fighter_id, json.dumps(hist), belt_id))
        audit(con, request.user["torn_id"], "assign_belt", f"belt:{belt_id}", {"holder_fighter_id": holder_fighter_id, "note": note})
    return jsonify({"ok": True})


@app.post("/api/admin/teams")
@require_admin
def create_team():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "Chaos Team").strip()[:100]
    event_id = int(data.get("event_id") or 1)
    captain_torn_id = int(data.get("captain_torn_id") or 0) or None
    notes = (data.get("notes") or "").strip()[:400]
    members = data.get("members") or []
    if isinstance(members, str):
        members = [x.strip() for x in members.split(",") if x.strip()]
    with db() as con:
        cur = con.execute("INSERT INTO teams(event_id, name, captain_torn_id, members_json, notes, created_by, created_at) VALUES(?,?,?,?,?,?,?)", (event_id, name, captain_torn_id, json.dumps(members), notes, request.user["torn_id"], now_iso()))
        team_id = cur.lastrowid
        audit(con, request.user["torn_id"], "create_team", f"team:{team_id}", data)
    return jsonify({"ok": True, "team_id": team_id})


@app.post("/api/admin/referees")
@require_admin
def create_referee():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:100]
    event_id = int(data.get("event_id") or 1)
    torn_id = int(data.get("torn_id") or 0) or None
    notes = (data.get("notes") or "").strip()[:400]
    if not name:
        return jsonify({"ok": False, "error": "Referee name required"}), 400
    with db() as con:
        cur = con.execute("INSERT INTO referees(event_id, torn_id, name, status, notes, created_by, created_at) VALUES(?,?,?,?,?,?,?)", (event_id, torn_id, name, "active", notes, request.user["torn_id"], now_iso()))
        ref_id = cur.lastrowid
        audit(con, request.user["torn_id"], "create_referee", f"referee:{ref_id}", data)
    return jsonify({"ok": True, "referee_id": ref_id})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

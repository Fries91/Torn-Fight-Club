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
                spectate_url TEXT,
                tournament_id INTEGER,
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






            CREATE TABLE IF NOT EXISTS idea_votes (
                idea_id INTEGER NOT NULL,
                user_torn_id INTEGER NOT NULL,
                vote TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (idea_id, user_torn_id)
            );

            CREATE TABLE IF NOT EXISTS user_notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_torn_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                notification_type TEXT NOT NULL DEFAULT 'info',
                related_fight_id INTEGER,
                related_challenge_id INTEGER,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                challenger_fighter_id INTEGER NOT NULL,
                target_fighter_id INTEGER NOT NULL,
                challenger_torn_id INTEGER,
                note TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                resolved_by INTEGER,
                resolved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                body TEXT,
                alert_type TEXT NOT NULL DEFAULT 'info',
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS fight_proofs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fight_id INTEGER NOT NULL,
                proof_type TEXT NOT NULL DEFAULT 'note',
                title TEXT,
                url TEXT,
                notes TEXT,
                created_by INTEGER,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ref_checklists (
                fight_id INTEGER PRIMARY KEY,
                both_showed INTEGER NOT NULL DEFAULT 0,
                rules_confirmed INTEGER NOT NULL DEFAULT 0,
                fight_started INTEGER NOT NULL DEFAULT 0,
                winner_confirmed INTEGER NOT NULL DEFAULT 0,
                method_confirmed INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                updated_by INTEGER,
                updated_at TEXT
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
        add_column_if_missing(con, "fights", "spectate_url", "TEXT")
        add_column_if_missing(con, "fights", "tournament_id", "INTEGER")
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


def parse_battle_stats(data):
    def num(key):
        try:
            return int(float(data.get(key, 0) or 0))
        except Exception:
            return 0

    strength = num("strength")
    defense = num("defense")
    speed = num("speed")
    dexterity = num("dexterity")

    total = data.get("total")
    if total is None:
        total = strength + defense + speed + dexterity
    try:
        total = int(float(total or 0))
    except Exception:
        total = strength + defense + speed + dexterity

    if strength == 0 and defense == 0 and speed == 0 and dexterity == 0 and total == 0:
        return None

    return {
        "strength": strength,
        "defense": defense,
        "speed": speed,
        "dexterity": dexterity,
        "total": total,
    }


def torn_basic_from_key(api_key):
    # Try basic + battlestats first. If the key does not have access to battlestats,
    # login still falls back to basic identity only.
    url = f"{TORN_API_BASE.rstrip('/')}/user/"

    identity = None
    private_battle_stats = None
    stat_error = None

    try:
        r = requests.get(
            url,
            params={"selections": "basic,battlestats", "key": api_key},
            timeout=REQUEST_TIMEOUT,
        )
        data = r.json()

        if "error" in data:
            err = data["error"]
            stat_error = err.get("error", "Torn API error") if isinstance(err, dict) else str(err)
        else:
            torn_id = int(data.get("player_id") or data.get("id") or 0)
            name = data.get("name") or f"Player {torn_id}"
            if torn_id:
                identity = (torn_id, name)
                private_battle_stats = parse_battle_stats(data)
    except Exception as e:
        stat_error = str(e)

    if identity:
        return identity[0], identity[1], private_battle_stats, stat_error

    # Fallback: basic only.
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
    return torn_id, name, None, stat_error



def create_user_notification(con, user_torn_id, title, body="", notification_type="info", fight_id=None, challenge_id=None):
    if not user_torn_id:
        return
    con.execute("""
        INSERT INTO user_notifications(user_torn_id, title, body, notification_type, related_fight_id, related_challenge_id, is_read, created_at)
        VALUES(?,?,?,?,?,?,0,?)
    """, (int(user_torn_id), title[:120], body[:700], notification_type[:40], fight_id, challenge_id, now_iso()))


def notify_challenge_fighters(con, challenge_id, title, body, notification_type="challenge", fight_id=None):
    c = con.execute("""
        SELECT c.*, cf.torn_id AS challenger_torn_id, tf.torn_id AS target_torn_id,
               cf.nickname AS challenger_nick, cf.name AS challenger_name,
               tf.nickname AS target_nick, tf.name AS target_name
        FROM challenges c
        JOIN fighters cf ON cf.id=c.challenger_fighter_id
        JOIN fighters tf ON tf.id=c.target_fighter_id
        WHERE c.id=?
    """, (challenge_id,)).fetchone()
    if not c:
        return
    create_user_notification(con, c["challenger_torn_id"], title, body, notification_type, fight_id, challenge_id)
    create_user_notification(con, c["target_torn_id"], title, body, notification_type, fight_id, challenge_id)

@app.get("/")
def home():
    return jsonify({
        "ok": True,
        "app": APP_NAME,
        "version": "4.3.1",
        "admins": sorted(list(ADMIN_IDS)),
        "userscript": "https://torn-fight-club.onrender.com/static/torn-fight-club.user.js",
        "note": "Prediction points are for entertainment only. This app does not handle real Torn money/items betting.",
    })


@app.get("/app")
def app_page():
    return app.send_static_file("fight-club-app.html")
@app.get("/app/public")
def public_app_page():
    return app.send_static_file("fight-club-public.html")


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
        torn_id, name, private_battle_stats, battle_stats_error = torn_basic_from_key(api_key)
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

    return jsonify({
        "ok": True,
        "token": token,
        "user": {"torn_id": torn_id, "name": name, "role": role, "prediction_points": points},
        "private_battle_stats": private_battle_stats,
        "battle_stats_error": battle_stats_error,
        "battle_stats_note": "Battle stats are returned only to the logged-in user at login and are not included in public state.",
    })


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
        my_notifications = []
        if token_user:
            predictions = [dict(x) for x in con.execute("""
                SELECT p.*, f.status
                FROM predictions p
                JOIN fights f ON f.id=p.fight_id
                WHERE p.user_torn_id=?
                ORDER BY p.id DESC
            """, (token_user["torn_id"],)).fetchall()]
            my_notifications = [dict(x) for x in con.execute("""
                SELECT *
                FROM user_notifications
                WHERE user_torn_id=?
                ORDER BY id DESC
                LIMIT 50
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
        checklists = [dict(x) for x in con.execute("SELECT * FROM ref_checklists").fetchall()]
        proof_rows = [dict(x) for x in con.execute("SELECT * FROM fight_proofs ORDER BY id DESC").fetchall()]
        challenges = [dict(x) for x in con.execute("""
            SELECT c.*,
                   cf.name AS challenger_name,
                   cf.nickname AS challenger_nick,
                   tf.name AS target_name,
                   tf.nickname AS target_nick
            FROM challenges c
            JOIN fighters cf ON cf.id=c.challenger_fighter_id
            JOIN fighters tf ON tf.id=c.target_fighter_id
            ORDER BY c.id DESC
        """).fetchall()]
        alerts = [dict(x) for x in con.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 50").fetchall()]

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
        "my_notifications": my_notifications,
        "tournaments": tournaments,
        "tournament_entries": entries,
        "belts": belts,
        "teams": teams,
        "referees": referees,
        "audit": audit_rows,
        "ref_checklists": checklists,
        "fight_proofs": proof_rows,
        "challenges": challenges,
        "alerts": alerts,
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
    spectate_url = (data.get("spectate_url") or "").strip()[:500]
    tournament_id = data.get("tournament_id")
    tournament_id = int(tournament_id) if tournament_id else None
    odds_a = float(data.get("odds_a") or 1.9)
    odds_b = float(data.get("odds_b") or 1.9)

    with db() as con:
        for fid in (fighter_a_id, fighter_b_id):
            if not con.execute("SELECT id FROM fighters WHERE id=?", (fid,)).fetchone():
                return jsonify({"ok": False, "error": f"Fighter {fid} not found"}), 400
        cur = con.execute("INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, spectate_url, tournament_id, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (event_id, fighter_a_id, fighter_b_id, "scheduled", round_name, rule_set, odds_a, odds_b, starts_at, spectate_url, tournament_id, now_iso()))
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
        "spectate_url": "TEXT",
        "tournament_id": "INTEGER",
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


@app.post("/api/admin/tournaments/<int:tournament_id>/generate")
@require_admin
def generate_tournament_round(tournament_id):
    data = request.get_json(force=True, silent=True) or {}
    round_name = (data.get("round_name") or "Round 1").strip()[:80]
    rule_set = (data.get("rule_set") or "Tournament chaos rules").strip()[:240]
    starts_at = (data.get("starts_at") or "").strip()[:80]
    spectate_url = (data.get("spectate_url") or "").strip()[:500]
    odds_a = float(data.get("odds_a") or 1.9)
    odds_b = float(data.get("odds_b") or 1.9)

    with db() as con:
        tour = con.execute("SELECT * FROM tournaments WHERE id=?", (tournament_id,)).fetchone()
        if not tour:
            return jsonify({"ok": False, "error": "Tournament not found"}), 404

        existing = con.execute("SELECT COUNT(*) AS c FROM fights WHERE tournament_id=?", (tournament_id,)).fetchone()["c"]
        if existing:
            return jsonify({"ok": False, "error": "This tournament already has generated fights. Delete or manage those first."}), 400

        entries = con.execute("""
            SELECT te.*, fi.name, fi.nickname
            FROM tournament_entries te
            JOIN fighters fi ON fi.id=te.fighter_id
            WHERE te.tournament_id=?
            ORDER BY te.seed ASC, te.id ASC
        """, (tournament_id,)).fetchall()

        if len(entries) < 2:
            return jsonify({"ok": False, "error": "Need at least 2 fighters in the bracket"}), 400

        generated = []
        i = 0
        match_no = 1
        while i + 1 < len(entries):
            a = entries[i]
            b = entries[i + 1]
            cur = con.execute("""
                INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, spectate_url, tournament_id, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                tour["event_id"],
                a["fighter_id"],
                b["fighter_id"],
                "scheduled",
                f"{round_name} Match {match_no}",
                rule_set,
                odds_a,
                odds_b,
                starts_at,
                spectate_url,
                tournament_id,
                now_iso(),
            ))
            generated.append(cur.lastrowid)
            match_no += 1
            i += 2

        bye = None
        if i < len(entries):
            bye = entries[i]["fighter_id"]

        con.execute("UPDATE tournaments SET status='live' WHERE id=?", (tournament_id,))
        audit(con, request.user["torn_id"], "generate_tournament_round", f"tournament:{tournament_id}", {
            "generated_fight_ids": generated,
            "bye_fighter_id": bye,
            "round_name": round_name,
        })

    return jsonify({"ok": True, "generated_fight_ids": generated, "bye_fighter_id": bye})


@app.post("/api/admin/fights/<int:fight_id>/checklist")
@require_admin
def save_ref_checklist(fight_id):
    data = request.get_json(force=True, silent=True) or {}

    def flag(name):
        return 1 if data.get(name) in (True, 1, "1", "true", "on", "yes") else 0

    both_showed = flag("both_showed")
    rules_confirmed = flag("rules_confirmed")
    fight_started = flag("fight_started")
    winner_confirmed = flag("winner_confirmed")
    method_confirmed = flag("method_confirmed")
    notes = (data.get("notes") or "").strip()[:1000]

    with db() as con:
        fight = con.execute("SELECT id FROM fights WHERE id=?", (fight_id,)).fetchone()
        if not fight:
            return jsonify({"ok": False, "error": "Fight not found"}), 404

        con.execute("""
            INSERT INTO ref_checklists(
                fight_id, both_showed, rules_confirmed, fight_started,
                winner_confirmed, method_confirmed, notes, updated_by, updated_at
            )
            VALUES(?,?,?,?,?,?,?,?,?)
            ON CONFLICT(fight_id) DO UPDATE SET
                both_showed=excluded.both_showed,
                rules_confirmed=excluded.rules_confirmed,
                fight_started=excluded.fight_started,
                winner_confirmed=excluded.winner_confirmed,
                method_confirmed=excluded.method_confirmed,
                notes=excluded.notes,
                updated_by=excluded.updated_by,
                updated_at=excluded.updated_at
        """, (
            fight_id, both_showed, rules_confirmed, fight_started,
            winner_confirmed, method_confirmed, notes, request.user["torn_id"], now_iso()
        ))
        audit(con, request.user["torn_id"], "save_ref_checklist", f"fight:{fight_id}", {
            "both_showed": both_showed,
            "rules_confirmed": rules_confirmed,
            "fight_started": fight_started,
            "winner_confirmed": winner_confirmed,
            "method_confirmed": method_confirmed,
        })

    return jsonify({"ok": True})


@app.post("/api/admin/events/<int:event_id>/delete")
@require_admin
def admin_delete_event(event_id):
    with db() as con:
        con.execute("DELETE FROM events WHERE id=?", (event_id,))
        audit(con, request.user["torn_id"], "delete_event", f"event:{event_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/fighters/<int:fighter_id>/update")
@require_admin
def admin_update_fighter(fighter_id):
    data = request.get_json(force=True, silent=True) or {}
    nickname = (data.get("nickname") or "").strip()[:60]
    stats_range = (data.get("stats_range") or "").strip()[:80]
    loadout = (data.get("loadout") or "").strip()[:180]
    rank_points = data.get("rank_points")
    record_w = data.get("record_w")
    record_l = data.get("record_l")

    fields, vals = [], []
    if "nickname" in data:
        fields.append("nickname=?"); vals.append(nickname)
    if "stats_range" in data:
        fields.append("stats_range=?"); vals.append(stats_range)
    if "loadout" in data:
        fields.append("loadout=?"); vals.append(loadout)
    if rank_points not in (None, ""):
        fields.append("rank_points=?"); vals.append(int(rank_points))
    if record_w not in (None, ""):
        fields.append("record_w=?"); vals.append(int(record_w))
    if record_l not in (None, ""):
        fields.append("record_l=?"); vals.append(int(record_l))

    if not fields:
        return jsonify({"ok": False, "error": "No fighter changes"}), 400

    vals.append(fighter_id)
    with db() as con:
        con.execute(f"UPDATE fighters SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_fighter", f"fighter:{fighter_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/fighters/<int:fighter_id>/delete")
@require_admin
def admin_delete_fighter(fighter_id):
    with db() as con:
        con.execute("UPDATE fighters SET active=0 WHERE id=?", (fighter_id,))
        audit(con, request.user["torn_id"], "delete_fighter", f"fighter:{fighter_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/teams/<int:team_id>/update")
@require_admin
def admin_update_team(team_id):
    data = request.get_json(force=True, silent=True) or {}
    fields, vals = [], []

    if "name" in data:
        fields.append("name=?"); vals.append((data.get("name") or "").strip()[:100])
    if "captain_torn_id" in data:
        captain = data.get("captain_torn_id")
        fields.append("captain_torn_id=?"); vals.append(int(captain) if captain else None)
    if "members" in data:
        members = data.get("members") or []
        if isinstance(members, str):
            members = [x.strip() for x in members.split(",") if x.strip()]
        fields.append("members_json=?"); vals.append(json.dumps(members))
    if "notes" in data:
        fields.append("notes=?"); vals.append((data.get("notes") or "").strip()[:400])

    if not fields:
        return jsonify({"ok": False, "error": "No team changes"}), 400

    vals.append(team_id)
    with db() as con:
        con.execute(f"UPDATE teams SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_team", f"team:{team_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/teams/<int:team_id>/delete")
@require_admin
def admin_delete_team(team_id):
    with db() as con:
        con.execute("DELETE FROM teams WHERE id=?", (team_id,))
        audit(con, request.user["torn_id"], "delete_team", f"team:{team_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/referees/<int:referee_id>/update")
@require_admin
def admin_update_referee(referee_id):
    data = request.get_json(force=True, silent=True) or {}
    fields, vals = [], []

    if "name" in data:
        fields.append("name=?"); vals.append((data.get("name") or "").strip()[:100])
    if "torn_id" in data:
        torn_id = data.get("torn_id")
        fields.append("torn_id=?"); vals.append(int(torn_id) if torn_id else None)
    if "status" in data:
        status = (data.get("status") or "active").strip()[:40]
        fields.append("status=?"); vals.append(status)
    if "notes" in data:
        fields.append("notes=?"); vals.append((data.get("notes") or "").strip()[:400])

    if not fields:
        return jsonify({"ok": False, "error": "No referee changes"}), 400

    vals.append(referee_id)
    with db() as con:
        con.execute(f"UPDATE referees SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_referee", f"referee:{referee_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/referees/<int:referee_id>/delete")
@require_admin
def admin_delete_referee(referee_id):
    with db() as con:
        con.execute("DELETE FROM referees WHERE id=?", (referee_id,))
        audit(con, request.user["torn_id"], "delete_referee", f"referee:{referee_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/belts/<int:belt_id>/update")
@require_admin
def admin_update_belt(belt_id):
    data = request.get_json(force=True, silent=True) or {}
    fields, vals = [], []

    if "name" in data:
        fields.append("name=?"); vals.append((data.get("name") or "").strip()[:100])
    if "division" in data:
        fields.append("division=?"); vals.append((data.get("division") or "").strip()[:80])
    if "holder_fighter_id" in data:
        holder = data.get("holder_fighter_id")
        fields.append("holder_fighter_id=?"); vals.append(int(holder) if holder else None)
    if "status" in data:
        fields.append("status=?"); vals.append((data.get("status") or "active").strip()[:40])

    if not fields:
        return jsonify({"ok": False, "error": "No belt changes"}), 400

    vals.append(belt_id)
    with db() as con:
        con.execute(f"UPDATE belts SET {', '.join(fields)} WHERE id=?", vals)
        audit(con, request.user["torn_id"], "update_belt", f"belt:{belt_id}", data)
    return jsonify({"ok": True})


@app.post("/api/admin/belts/<int:belt_id>/delete")
@require_admin
def admin_delete_belt(belt_id):
    with db() as con:
        con.execute("DELETE FROM belts WHERE id=?", (belt_id,))
        audit(con, request.user["torn_id"], "delete_belt", f"belt:{belt_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/fights/<int:fight_id>/proofs")
@require_admin
def add_fight_proof(fight_id):
    data = request.get_json(force=True, silent=True) or {}
    proof_type = (data.get("proof_type") or "note").strip()[:40]
    title = (data.get("title") or "").strip()[:120]
    url = (data.get("url") or "").strip()[:700]
    notes = (data.get("notes") or "").strip()[:1200]

    if not title and not url and not notes:
        return jsonify({"ok": False, "error": "Proof title, URL, or notes required"}), 400

    with db() as con:
        fight = con.execute("SELECT id FROM fights WHERE id=?", (fight_id,)).fetchone()
        if not fight:
            return jsonify({"ok": False, "error": "Fight not found"}), 404

        cur = con.execute("""
            INSERT INTO fight_proofs(fight_id, proof_type, title, url, notes, created_by, created_at)
            VALUES(?,?,?,?,?,?,?)
        """, (fight_id, proof_type, title, url, notes, request.user["torn_id"], now_iso()))
        proof_id = cur.lastrowid
        audit(con, request.user["torn_id"], "add_fight_proof", f"fight:{fight_id}", {
            "proof_id": proof_id,
            "proof_type": proof_type,
            "title": title,
        })

    return jsonify({"ok": True, "proof_id": proof_id})


@app.post("/api/admin/proofs/<int:proof_id>/delete")
@require_admin
def delete_fight_proof(proof_id):
    with db() as con:
        con.execute("DELETE FROM fight_proofs WHERE id=?", (proof_id,))
        audit(con, request.user["torn_id"], "delete_fight_proof", f"proof:{proof_id}", {})
    return jsonify({"ok": True})


@app.post("/api/admin/tournaments/<int:tournament_id>/generate-next")
@require_admin
def generate_tournament_next_round(tournament_id):
    data = request.get_json(force=True, silent=True) or {}
    round_name = (data.get("round_name") or "Next Round").strip()[:80]
    rule_set = (data.get("rule_set") or "Tournament next round chaos rules").strip()[:240]
    starts_at = (data.get("starts_at") or "").strip()[:80]
    spectate_url = (data.get("spectate_url") or "").strip()[:500]
    odds_a = float(data.get("odds_a") or 1.9)
    odds_b = float(data.get("odds_b") or 1.9)

    with db() as con:
        tour = con.execute("SELECT * FROM tournaments WHERE id=?", (tournament_id,)).fetchone()
        if not tour:
            return jsonify({"ok": False, "error": "Tournament not found"}), 404

        unfinished = con.execute("""
            SELECT COUNT(*) AS c
            FROM fights
            WHERE tournament_id=? AND status NOT IN ('done','cancelled')
        """, (tournament_id,)).fetchone()["c"]
        if unfinished:
            return jsonify({"ok": False, "error": "All current tournament fights must be done/cancelled before generating next round"}), 400

        winners = con.execute("""
            SELECT DISTINCT winner_fighter_id
            FROM fights
            WHERE tournament_id=? AND status='done' AND winner_fighter_id IS NOT NULL
            ORDER BY id ASC
        """, (tournament_id,)).fetchall()

        fighter_ids = [int(r["winner_fighter_id"]) for r in winners if r["winner_fighter_id"]]
        if len(fighter_ids) < 2:
            return jsonify({"ok": False, "error": "Need at least 2 winners to generate the next round"}), 400

        # Avoid generating the exact same next round twice when latest round is already scheduled/live.
        existing_names = con.execute("""
            SELECT COUNT(*) AS c
            FROM fights
            WHERE tournament_id=? AND round_name LIKE ?
        """, (tournament_id, f"{round_name}%")).fetchone()["c"]
        if existing_names:
            return jsonify({"ok": False, "error": "A round with that name already exists for this tournament"}), 400

        generated = []
        i = 0
        match_no = 1
        while i + 1 < len(fighter_ids):
            a = fighter_ids[i]
            b = fighter_ids[i + 1]
            cur = con.execute("""
                INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, spectate_url, tournament_id, created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                tour["event_id"],
                a,
                b,
                "scheduled",
                f"{round_name} Match {match_no}",
                rule_set,
                odds_a,
                odds_b,
                starts_at,
                spectate_url,
                tournament_id,
                now_iso(),
            ))
            generated.append(cur.lastrowid)
            i += 2
            match_no += 1

        bye = None
        if i < len(fighter_ids):
            bye = fighter_ids[i]

        audit(con, request.user["torn_id"], "generate_tournament_next_round", f"tournament:{tournament_id}", {
            "generated_fight_ids": generated,
            "bye_fighter_id": bye,
            "round_name": round_name,
        })

    return jsonify({"ok": True, "generated_fight_ids": generated, "bye_fighter_id": bye})


@app.post("/api/challenges")
@require_login
def create_challenge():
    data = request.get_json(force=True, silent=True) or {}
    challenger_fighter_id = int(data.get("challenger_fighter_id") or 0)
    target_fighter_id = int(data.get("target_fighter_id") or 0)
    note = (data.get("note") or "").strip()[:500]

    if not challenger_fighter_id or not target_fighter_id:
        return jsonify({"ok": False, "error": "Choose both fighters"}), 400
    if challenger_fighter_id == target_fighter_id:
        return jsonify({"ok": False, "error": "You cannot challenge yourself"}), 400

    with db() as con:
        mine = con.execute("SELECT * FROM fighters WHERE id=? AND torn_id=? AND active=1", (challenger_fighter_id, request.user["torn_id"])).fetchone()
        if not mine:
            return jsonify({"ok": False, "error": "Challenger must be one of your fighter profiles"}), 403
        target = con.execute("SELECT * FROM fighters WHERE id=? AND active=1", (target_fighter_id,)).fetchone()
        if not target:
            return jsonify({"ok": False, "error": "Target fighter not found"}), 404

        cur = con.execute("""
            INSERT INTO challenges(challenger_fighter_id, target_fighter_id, challenger_torn_id, note, status, created_at)
            VALUES(?,?,?,?,?,?)
        """, (challenger_fighter_id, target_fighter_id, request.user["torn_id"], note, "pending", now_iso()))
        challenge_id = cur.lastrowid

    return jsonify({"ok": True, "challenge_id": challenge_id})


@app.post("/api/admin/challenges/<int:challenge_id>/status")
@require_admin
def set_challenge_status(challenge_id):
    data = request.get_json(force=True, silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in ("pending", "approved", "rejected", "converted"):
        return jsonify({"ok": False, "error": "Bad challenge status"}), 400

    with db() as con:
        con.execute("UPDATE challenges SET status=?, resolved_by=?, resolved_at=? WHERE id=?", (status, request.user["torn_id"], now_iso(), challenge_id))
        if status == "approved":
            notify_challenge_fighters(
                con,
                challenge_id,
                "🥊 Challenge approved!",
                "Your Fight Club challenge was approved by admin. Watch the Fight Card for scheduling.",
                "challenge_approved"
            )
        elif status == "rejected":
            notify_challenge_fighters(
                con,
                challenge_id,
                "Challenge rejected",
                "Your Fight Club challenge was rejected by admin.",
                "challenge_rejected"
            )
        audit(con, request.user["torn_id"], "set_challenge_status", f"challenge:{challenge_id}", {"status": status})

    return jsonify({"ok": True})


@app.post("/api/admin/challenges/<int:challenge_id>/convert")
@require_admin
def convert_challenge_to_fight(challenge_id):
    data = request.get_json(force=True, silent=True) or {}
    event_id = int(data.get("event_id") or 1)
    round_name = (data.get("round_name") or "Challenge Fight").strip()[:80]
    rule_set = (data.get("rule_set") or "Challenge match chaos rules").strip()[:240]
    starts_at = (data.get("starts_at") or "").strip()[:80]
    spectate_url = (data.get("spectate_url") or "").strip()[:500]

    with db() as con:
        c = con.execute("SELECT * FROM challenges WHERE id=?", (challenge_id,)).fetchone()
        if not c:
            return jsonify({"ok": False, "error": "Challenge not found"}), 404

        cur = con.execute("""
            INSERT INTO fights(event_id, fighter_a_id, fighter_b_id, status, round_name, rule_set, odds_a, odds_b, starts_at, spectate_url, tournament_id, created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (event_id, c["challenger_fighter_id"], c["target_fighter_id"], "scheduled", round_name, rule_set, 1.9, 1.9, starts_at, spectate_url, None, now_iso()))
        fight_id = cur.lastrowid
        con.execute("UPDATE challenges SET status='converted', resolved_by=?, resolved_at=? WHERE id=?", (request.user["torn_id"], now_iso(), challenge_id))
        notify_challenge_fighters(
            con,
            challenge_id,
            "🥊 Fight scheduled!",
            f"Your challenge has been converted into Fight #{fight_id}: {round_name}. Start: {starts_at or 'TBA'}.",
            "fight_scheduled",
            fight_id=fight_id
        )
        audit(con, request.user["torn_id"], "convert_challenge_to_fight", f"challenge:{challenge_id}", {"fight_id": fight_id})

    return jsonify({"ok": True, "fight_id": fight_id})


@app.post("/api/admin/alerts")
@require_admin
def create_alert():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()[:120]
    body = (data.get("body") or "").strip()[:700]
    alert_type = (data.get("alert_type") or "info").strip()[:40]
    if not title:
        return jsonify({"ok": False, "error": "Alert title required"}), 400

    with db() as con:
        cur = con.execute("INSERT INTO alerts(title, body, alert_type, created_by, created_at) VALUES(?,?,?,?,?)", (title, body, alert_type, request.user["torn_id"], now_iso()))
        alert_id = cur.lastrowid
        audit(con, request.user["torn_id"], "create_alert", f"alert:{alert_id}", {"title": title})

    return jsonify({"ok": True, "alert_id": alert_id})


@app.post("/api/admin/alerts/<int:alert_id>/delete")
@require_admin
def delete_alert(alert_id):
    with db() as con:
        con.execute("DELETE FROM alerts WHERE id=?", (alert_id,))
        audit(con, request.user["torn_id"], "delete_alert", f"alert:{alert_id}", {})
    return jsonify({"ok": True})


@app.post("/api/notifications/read")
@require_login
def mark_notifications_read():
    data = request.get_json(force=True, silent=True) or {}
    notification_id = data.get("notification_id")

    with db() as con:
        if notification_id:
            con.execute("UPDATE user_notifications SET is_read=1 WHERE id=? AND user_torn_id=?", (int(notification_id), request.user["torn_id"]))
        else:
            con.execute("UPDATE user_notifications SET is_read=1 WHERE user_torn_id=?", (request.user["torn_id"],))

    return jsonify({"ok": True})


@app.post("/api/ideas/<int:idea_id>/vote")
@require_login
def vote_idea(idea_id):
    data = request.get_json(force=True, silent=True) or {}
    vote = (data.get("vote") or "").strip().lower()
    if vote not in ("yes", "no"):
        return jsonify({"ok": False, "error": "Vote must be yes or no"}), 400

    with db() as con:
        idea = con.execute("SELECT id FROM ideas WHERE id=?", (idea_id,)).fetchone()
        if not idea:
            return jsonify({"ok": False, "error": "Idea not found"}), 404
        con.execute("""
            INSERT INTO idea_votes(idea_id, user_torn_id, vote, created_at, updated_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(idea_id, user_torn_id) DO UPDATE SET
                vote=excluded.vote,
                updated_at=excluded.updated_at
        """, (idea_id, request.user["torn_id"], vote, now_iso(), now_iso()))

    return jsonify({"ok": True})


@app.post("/api/admin/ideas/<int:idea_id>/delete")
@require_admin
def delete_idea(idea_id):
    with db() as con:
        con.execute("DELETE FROM idea_votes WHERE idea_id=?", (idea_id,))
        con.execute("DELETE FROM ideas WHERE id=?", (idea_id,))
        audit(con, request.user["torn_id"], "delete_idea", f"idea:{idea_id}", {})

    return jsonify({"ok": True})


@app.post("/api/referees/register")
@require_login
def register_referee():
    data = request.get_json(force=True, silent=True) or {}
    event_id = data.get("event_id")
    event_id = int(event_id) if event_id else None
    name = (data.get("name") or request.user.get("name") or "").strip()[:100]
    notes = (data.get("notes") or "").strip()[:400]
    torn_id = int(request.user["torn_id"])

    if not name:
        return jsonify({"ok": False, "error": "Name required"}), 400

    with db() as con:
        existing = con.execute("SELECT id FROM referees WHERE torn_id=?", (torn_id,)).fetchone()
        if existing:
            con.execute("""
                UPDATE referees
                SET event_id=?, name=?, notes=?, status='pending'
                WHERE torn_id=?
            """, (event_id, name, notes, torn_id))
            ref_id = existing["id"]
        else:
            cur = con.execute("""
                INSERT INTO referees(event_id, name, torn_id, notes, status, created_at)
                VALUES(?,?,?,?,?,?)
            """, (event_id, name, torn_id, notes, "pending", now_iso()))
            ref_id = cur.lastrowid

        audit(con, torn_id, "register_referee", f"referee:{ref_id}", {"event_id": event_id, "name": name})

    return jsonify({"ok": True, "referee_id": ref_id})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

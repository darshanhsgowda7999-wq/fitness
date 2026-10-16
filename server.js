/* GymFit dynamic website: Node.js, no npm packages needed.
   Run:  node server.js   then open http://localhost:3000
   Optional env: PORT=3000  ADMIN_KEY=yoursecret  (enables /admin.html) */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const PUB = path.join(__dirname, "public");
const DATA = path.join(__dirname, "data");
const DB_FILE = path.join(DATA, "db.json");
const CONTENT_FILE = path.join(DATA, "content.json");

/* ---------- tiny JSON database ---------- */
let db = { users: [], sessions: {}, messages: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, "utf8"))); } catch (e) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}
const readContent = () => JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));

/* ---------- helpers ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function send(res, code, body, headers = {}) {
  const isObj = typeof body === "object" && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({
    "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin"
  }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on("data", c => { size += c.length; if (size > 200000) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(new Error("bad json")); } });
  });
}
const parseCookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(c => c.trim().split("=")).filter(a => a[0]).map(a => [a[0], a[1]]));
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const num = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, profile: u.profile });

function currentUser(req) {
  const tok = parseCookies(req).sid;
  const sess = tok && db.sessions[tok];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users.find(u => u.id === sess.uid) || null;
}
function startSession(res, user) {
  const tok = crypto.randomBytes(32).toString("hex");
  db.sessions[tok] = { uid: user.id, exp: Date.now() + 14 * 864e5 };
  save();
  return `sid=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 86400}`;
}

/* very small rate limiter for login/register/contact */
const hits = new Map();
function limited(req, key, max, windowMs) {
  const k = key + (req.socket.remoteAddress || "");
  const now = Date.now(), arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  const needUser = () => { const u = currentUser(req); if (!u) { send(res, 401, { error: "Please log in first." }); } return u; };

  if (m === "GET" && p === "/api/content") return send(res, 200, readContent());

  if (m === "POST" && p === "/api/register") {
    if (limited(req, "reg", 10, 36e5)) return send(res, 429, { error: "Too many attempts. Try later." });
    const b = await readBody(req);
    const name = clean(b.name, 60), email = clean(b.email, 120).toLowerCase(), pw = String(b.password || "");
    if (!name) return send(res, 400, { error: "Please enter your name." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "Enter a valid email." });
    if (pw.length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: "That email is already registered." });
    const salt = crypto.randomBytes(16).toString("hex");
    const user = { id: crypto.randomUUID(), name, email, salt, hash: hashPw(pw, salt), created: new Date().toISOString(),
      profile: { sex: "m", age: 25, weight: 70, height: 170, activity: "1.55", goal: "fat" }, logs: [], water: { d: "", n: 0 } };
    db.users.push(user);
    return send(res, 201, { user: publicUser(user) }, { "Set-Cookie": startSession(res, user) });
  }

  if (m === "POST" && p === "/api/login") {
    if (limited(req, "login", 15, 15 * 6e4)) return send(res, 429, { error: "Too many attempts. Try later." });
    const b = await readBody(req);
    const user = db.users.find(u => u.email === clean(b.email, 120).toLowerCase());
    const ok = user && crypto.timingSafeEqual(Buffer.from(hashPw(String(b.password || ""), user.salt), "hex"), Buffer.from(user.hash, "hex"));
    if (!ok) return send(res, 401, { error: "Wrong email or password." });
    return send(res, 200, { user: publicUser(user) }, { "Set-Cookie": startSession(res, user) });
  }

  if (m === "POST" && p === "/api/logout") {
    const tok = parseCookies(req).sid;
    if (tok) { delete db.sessions[tok]; save(); }
    return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; Path=/; Max-Age=0" });
  }

  if (m === "GET" && p === "/api/me") {
    const u = currentUser(req);
    return send(res, 200, { user: u ? publicUser(u) : null });
  }

  if (p === "/api/profile") {
    const u = needUser(); if (!u) return;
    if (m === "GET") return send(res, 200, u.profile);
    if (m === "PUT") {
      const b = await readBody(req);
      const pr = {
        sex: b.sex === "f" ? "f" : "m", age: num(b.age, 14, 90), weight: num(b.weight, 30, 250), height: num(b.height, 120, 230),
        activity: ["1.2", "1.375", "1.55", "1.725"].includes(String(b.activity)) ? String(b.activity) : "1.55",
        goal: b.goal === "muscle" ? "muscle" : "fat"
      };
      if (pr.age == null || pr.weight == null || pr.height == null) return send(res, 400, { error: "Check age, weight and height." });
      u.profile = pr; save();
      return send(res, 200, pr);
    }
  }

  if (p === "/api/logs") {
    const u = needUser(); if (!u) return;
    if (m === "GET") return send(res, 200, u.logs);
    if (m === "POST") {
      const b = await readBody(req);
      const ex = clean(b.ex, 80), det = clean(b.det, 80) || "done";
      if (!ex) return send(res, 400, { error: "Enter an exercise name." });
      const entry = { id: crypto.randomUUID(), d: new Date().toLocaleDateString("en-GB"), ex, det, t: Date.now() };
      u.logs.unshift(entry); u.logs = u.logs.slice(0, 200); save();
      return send(res, 201, entry);
    }
  }
  if (m === "DELETE" && p.startsWith("/api/logs/")) {
    const u = needUser(); if (!u) return;
    const id = p.split("/")[3];
    u.logs = u.logs.filter(l => l.id !== id); save();
    return send(res, 200, { ok: true });
  }

  if (p === "/api/water") {
    const u = needUser(); if (!u) return;
    const today = new Date().toISOString().slice(0, 10);
    if (u.water.d !== today) u.water = { d: today, n: 0 };
    if (m === "GET") return send(res, 200, { n: u.water.n });
    if (m === "PUT") {
      const b = await readBody(req), n = num(b.n, 0, 12);
      if (n == null) return send(res, 400, { error: "Invalid amount." });
      u.water.n = n; save();
      return send(res, 200, { n });
    }
  }

  if (m === "POST" && p === "/api/contact") {
    if (limited(req, "contact", 5, 36e5)) return send(res, 429, { error: "Too many messages. Try later." });
    const b = await readBody(req);
    const msg = { id: crypto.randomUUID(), name: clean(b.name, 60), email: clean(b.email, 120), goal: clean(b.goal, 30), message: clean(b.message, 800), at: new Date().toISOString() };
    if (!msg.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.email)) return send(res, 400, { error: "Enter your name and a valid email." });
    db.messages.unshift(msg); db.messages = db.messages.slice(0, 1000); save();
    return send(res, 201, { ok: true });
  }

  /* ---- admin (needs ADMIN_KEY env var) ---- */
  if (p.startsWith("/api/admin/")) {
    const key = String(req.headers["x-admin-key"] || "");
    const okKey = ADMIN_KEY && key.length === ADMIN_KEY.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY));
    if (!okKey) return send(res, 403, { error: "Admin key missing or wrong (set ADMIN_KEY when starting the server)." });
    if (m === "GET" && p === "/api/admin/overview") return send(res, 200, { users: db.users.length, messages: db.messages });
    if (m === "PUT" && p === "/api/admin/content") {
      const b = await readBody(req);
      if (!b.goals || !b.exercises || typeof b.goals !== "object" || typeof b.exercises !== "object") return send(res, 400, { error: "Need goals and exercises objects." });
      fs.writeFileSync(CONTENT_FILE, JSON.stringify({ goals: b.goals, exercises: b.exercises }, null, 2));
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: "Not found" });
}

/* ---------- static files ---------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep)) return send(res, 403, "Forbidden");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found");
    send(res, 200, buf, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": (file.endsWith(".html") || file.endsWith("sw.js") || file.endsWith(".webmanifest")) ? "no-cache" : "public, max-age=3600" });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await api(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else send(res, 405, "Method not allowed");
  } catch (e) {
    if (!res.headersSent) send(res, e.message === "too large" ? 413 : 400, { error: e.message === "too large" ? "Request too large." : "Bad request." });
  }
}).listen(PORT, () => console.log(`GymFit running at http://localhost:${PORT}` + (ADMIN_KEY ? "  (admin: /admin.html)" : "")));

process.on("SIGINT", () => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) {} process.exit(0); });

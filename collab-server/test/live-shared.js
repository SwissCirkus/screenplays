// A live check of shared scripts against a REAL co-writing server on this PC (not part of `npm test`: it starts the server).
//   node test/live-shared.js
// Starts the server on a temporary SQLite database, makes an owner, a guest and a stranger, shares a script with the guest, and
// checks: both see each other's typing live; the guest carries on alone; the text survives a server RESTART; the owner then
// sees the guest's words; a viewer can't change it; a stranger and someone without a sign-in are refused.
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const FRONT = path.join(__dirname, "..", "..", "frontend", "node_modules");
const Y = require(path.join(FRONT, "yjs"));
const { HocuspocusProvider, HocuspocusProviderWebsocket } = require(path.join(FRONT, "@hocuspocus", "provider"));
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kshared-live-"));
const PORT = 18000 + Math.floor(Math.random() * 1000);
const SECRET = "live-test-" + "s".repeat(40);
const env = { ...process.env, DATA_DIR: DIR, DB_TYPE: "sqlite", JWT_SECRET: SECRET, PORT: String(PORT), HOST: "127.0.0.1", NODE_ENV: "development", DOC_IDLE_TIMEOUT_MINUTES: "0" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, what) => { if (!cond) { console.error("✖ " + what); process.exitCode = 1; throw new Error(what); } console.log("✔ " + what); };

let server = null;
async function startServer() {
  server = spawn(process.execPath, ["-r", "./test/register.js", "src/server.ts"], { cwd: path.join(__dirname, ".."), env, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; global.serverOut = () => out; server.stdout.on("data", (d) => { out += d; }); server.stderr.on("data", (d) => { out += d; });
  for (let i = 0; i < 100; i++) { await sleep(200); try { const r = await fetch(`http://127.0.0.1:${PORT}/health`); if (r.ok) return; } catch { /* starting */ } }
  throw new Error("server didn't start:\n" + out.slice(-2000));
}
async function stopServer() { if (!server) return; const s = server; server = null; s.kill(); await new Promise((r) => s.once("exit", r)); }

const token = (u) => jwt.sign({ sub: u.id, email: u.email, type: "access" }, SECRET, { expiresIn: "15m" });
function open(docName, u) {
  const doc = new Y.Doc();
  const ws = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${PORT}`, WebSocketPolyfill: WebSocket });
  let failed = null, synced = false;
  const p = new HocuspocusProvider({ websocketProvider: ws, name: docName, document: doc, token: u ? "jwt:" + token(u) : "", onAuthenticationFailed: (e) => { failed = (e && e.reason) || "refused"; }, onSynced: () => { synced = true; } });
  p.attach(); // a provider given its own websocket attaches by hand (Hocuspocus 3)
  return { doc, text: doc.getText("t"), close: () => { p.destroy(); ws.destroy(); }, state: () => ({ failed, synced }) };
}
async function until(fn, what, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return ok(true, what); await sleep(100); } if (process.env.LIVE_DEBUG) console.error((global.serverOut ? global.serverOut() : "").slice(-3000)); return ok(false, what); }

(async () => {
  try {
    await startServer();
    const db = new Database(path.join(DIR, "collab.sqlite3"));
    const mk = (id, email, name) => { db.prepare("INSERT INTO users (id, email, email_verified, display_name, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)").run(id, email, name, new Date().toISOString(), new Date().toISOString()); return { id, email }; };
    const owner = mk("o1", "owner@example.com", "Owner"), guest = mk("g1", "guest@example.com", "Guest"), viewer = mk("v1", "viewer@example.com", "Viewer"), stranger = mk("s1", "stranger@example.com", "Stranger");
    db.close();
    const api = async (u, method, url, body) => (await fetch(`http://127.0.0.1:${PORT}/api/shared${url}`, { method, headers: { authorization: "Bearer " + token(u), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })).json();
    const made = await api(owner, "POST", "", { title: "Live test", format: "screenplay" });
    await api(owner, "POST", `/${made.id}/shares`, { email: "guest@example.com", role: "editor" });
    await api(owner, "POST", `/${made.id}/shares`, { email: "viewer@example.com", role: "viewer" });
    const name = made.documentName;

    const a = open(name, owner), b = open(name, guest);
    await until(() => a.state().synced && b.state().synced, "owner and guest both open the shared script with their own sign-in");
    a.text.insert(0, "FADE IN. ");
    await until(() => b.text.toString() === "FADE IN. ", "the guest sees the owner's typing live");
    b.text.insert(b.text.length, "A kitchen. ");
    await until(() => a.text.toString() === "FADE IN. A kitchen. ", "the owner sees the guest's typing live");
    a.close();
    b.text.insert(b.text.length, "Written while the owner was away.");
    await sleep(3500); // the server saves a couple of seconds after the last change
    b.close();
    await sleep(1500);

    await stopServer(); await startServer(); // memory gone; only the database remains
    const a2 = open(name, owner);
    await until(() => a2.state().synced, "after a server restart the owner opens it again");
    await until(() => a2.text.toString() === "FADE IN. A kitchen. Written while the owner was away.", "the owner sees what the guest wrote while they were away");

    const v = open(name, viewer);
    await until(() => v.state().synced && v.text.toString().startsWith("FADE IN."), "a viewer opens it and reads it");
    v.text.insert(0, "VANDAL ");
    await sleep(1500);
    ok(!a2.text.toString().includes("VANDAL"), "a viewer's change never reaches anyone");
    v.close();

    const s = open(name, stranger), n = open(name, null);
    await until(() => s.state().failed, "a stranger is refused");
    await until(() => n.state().failed, "someone who isn't signed in is refused");
    ok(!s.state().synced && !n.state().synced, "neither ever gets the text");
    s.close(); n.close(); a2.close();
    console.log("\nAll live checks passed.");
  } catch (err) { console.error(err && err.message ? err.message : err); process.exitCode = 1; }
  finally { await stopServer(); setTimeout(() => process.exit(process.exitCode || 0), 200); }
})();

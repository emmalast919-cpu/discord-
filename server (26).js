const express    = require("express");
const session    = require("express-session");
const pgSession  = require("connect-pg-simple")(session);
const fetch      = require("node-fetch");
const path       = require("path");
const db         = require("./db");
const initDb     = require("./db-init");
const { CATEGORIES, LEAF_TYPES } = require("./bot/logTypes");

const PORT           = process.env.PORT || 5000;
const CLIENT_ID      = process.env.DISCORD_CLIENT_ID     || "1483829660461568173";
const CLIENT_SECRET  = process.env.DISCORD_CLIENT_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET        || "";

if (!CLIENT_SECRET) console.error("[website] DISCORD_CLIENT_SECRET is not set — login will fail. Add it in Secrets.");
if (!SESSION_SECRET) console.error("[website] SESSION_SECRET is not set — add it in Secrets for secure sessions.");

// ─── Redirect URI ────────────────────────────────────────────────────────────
// Set REDIRECT_URI env var on Vercel to your deployed URL.
// Known dev URIs are matched by hostname so login works on Replit without config.
const REDIRECT_URIS_BY_HOST = {
  "https://df8e50ee-d7aa-4fcd-b94d-54a7617dd6ea-00-13vwx7vctkfk3.janeway.replit.dev/":
    "https://df8e50ee-d7aa-4fcd-b94d-54a7617dd6ea-00-13vwx7vctkfk3.janeway.replit.dev/callback",
};

function getRedirectUri(req) {
  if (process.env.REDIRECT_URI)  return process.env.REDIRECT_URI;
  if (process.env.VERCEL_URL)    return `https://${process.env.VERCEL_URL}/callback`;
  const host = req.get("host") || "";
  if (REDIRECT_URIS_BY_HOST[host]) return REDIRECT_URIS_BY_HOST[host];
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  return `${proto}://${host}/callback`;
}

// Bot invite permissions: Send Messages, Embed Links, Attach Files,
// Read Message History, View Audit Log, Manage Webhooks, View Channels
const BOT_PERMISSIONS = "537396224";

const ALL_LOG_KEYS  = LEAF_TYPES.map((t) => t.key);
const CATEGORY_KEYS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.types.map((t) => t.key)]));

// ─── Express setup ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.set("trust proxy", 1);

// ─── Static files (only these exact paths are served) ────────────────────────
const STATIC = {
  "style.css":   "text/css",
  "app.js":      "application/javascript",
  "icons.svg":   "image/svg+xml",
  "favicon.svg": "image/svg+xml",
  "index.html":  "text/html",
  "dash.html":   "text/html",
};
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/:file", (req, res, next) => {
  const mime = STATIC[req.params.file];
  if (!mime) return next();
  res.type(mime).sendFile(path.join(__dirname, req.params.file));
});

// ─── Session ─────────────────────────────────────────────────────────────────
const isProd = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
app.use(
  session({
    store: new pgSession({
      pool: db.pool,
      tableName: "sessions",
      createTableIfMissing: true,
      errorLog: (err) => console.error("[sessions]", err.message),
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
      secure: isProd,
      httpOnly: true,
    },
  })
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function guildAccess(req, guildId) {
  return (req.session.guilds || []).some((g) => g.id === guildId);
}

// ─── Public: config ───────────────────────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  res.json({ categories: CATEGORIES });
});

// ─── OAuth ────────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id",     CLIENT_ID);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         "identify guilds");
  console.log("[oauth] login → redirect_uri:", redirectUri);
  res.redirect(url.toString());
});

app.get("/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.redirect(`/?error=${encodeURIComponent(error)}`);
  if (!code)  return res.redirect("/?error=missing_code");

  try {
    const redirectUri = getRedirectUri(req);

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
      }),
    });
    const tokenBody = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("[oauth] token exchange failed:", tokenBody);
      return res.redirect("/?error=auth_failed");
    }
    const tokens = JSON.parse(tokenBody);

    const [userRes, guildsRes] = await Promise.all([
      fetch("https://discord.com/api/users/@me",        { headers: { Authorization: `Bearer ${tokens.access_token}` } }),
      fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${tokens.access_token}` } }),
    ]);

    const user       = await userRes.json();
    const guildsRaw  = await guildsRes.json();

    const manageable = (Array.isArray(guildsRaw) ? guildsRaw : []).filter((g) => {
      const p = BigInt(g.permissions || 0);
      return g.owner || (p & 0x8n) === 0x8n || (p & 0x20n) === 0x20n;
    });

    req.session.user   = { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar };
    req.session.guilds = manageable.map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
    req.session.save((err) => {
      if (err) console.error("[oauth] session save error:", err.message);
      res.redirect("/dash.html");
    });
  } catch (err) {
    console.error("[oauth] callback error:", err.message);
    res.redirect("/?error=auth_failed");
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.clearCookie("connect.sid").json({ ok: true }));
});

// ─── API: me ──────────────────────────────────────────────────────────────────
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// ─── API: guilds ──────────────────────────────────────────────────────────────
app.get("/api/guilds", requireAuth, async (req, res) => {
  try {
    const ids      = (req.session.guilds || []).map((g) => g.id);
    const dbGuilds = ids.length ? await db.getGuildsByIds(ids) : [];
    const botMap   = new Map(dbGuilds.map((g) => [g.guild_id, g.bot_added]));

    const guilds = (req.session.guilds || []).map((g) => ({
      id:       g.id,
      name:     g.name,
      icon:     g.icon,
      botAdded: Boolean(botMap.get(g.id)),
    }));

    res.json({
      guilds,
      inviteBase: `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot&permissions=${BOT_PERMISSIONS}`,
    });
  } catch (err) {
    console.error("[guilds]", err.message);
    res.status(500).json({ error: "Failed to load servers: " + err.message });
  }
});

// ─── API: channels ────────────────────────────────────────────────────────────
app.get("/api/guilds/:id/channels", requireAuth, async (req, res) => {
  if (!guildAccess(req, req.params.id)) return res.status(403).json({ error: "Forbidden" });
  try {
    res.json({ channels: await db.getChannels(req.params.id) });
  } catch (err) {
    console.error("[channels]", err.message);
    res.status(500).json({ error: "Failed to load channels" });
  }
});

// ─── API: log configs GET ─────────────────────────────────────────────────────
app.get("/api/guilds/:id/logs", requireAuth, async (req, res) => {
  if (!guildAccess(req, req.params.id)) return res.status(403).json({ error: "Forbidden" });
  try {
    res.json({ logs: await db.getLogConfigs(req.params.id) });
  } catch (err) {
    console.error("[logs get]", err.message);
    res.status(500).json({ error: "Failed to load log configs" });
  }
});

// ─── API: log config save (single) ───────────────────────────────────────────
app.post("/api/guilds/:id/logs", requireAuth, async (req, res) => {
  if (!guildAccess(req, req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const { logType, channelId, channelName, enabled } = req.body;
  if (!ALL_LOG_KEYS.includes(logType)) return res.status(400).json({ error: "Invalid log type" });
  try {
    await db.upsertLogConfig(req.params.id, logType, channelId || null, channelName || null, Boolean(enabled));
    res.json({ ok: true });
  } catch (err) {
    console.error("[logs save]", err.message);
    res.status(500).json({ error: "Failed to save: " + err.message });
  }
});

// ─── API: bulk save ───────────────────────────────────────────────────────────
app.post("/api/guilds/:id/logs/bulk", requireAuth, async (req, res) => {
  if (!guildAccess(req, req.params.id)) return res.status(403).json({ error: "Forbidden" });
  const { scope, category, channelId, channelName, enabled } = req.body;

  let types;
  if (scope === "all")      types = ALL_LOG_KEYS;
  else if (scope === "category") {
    types = CATEGORY_KEYS[category];
    if (!types) return res.status(400).json({ error: "Invalid category" });
  } else return res.status(400).json({ error: "Invalid scope" });

  try {
    await db.bulkUpsertLogConfigs(req.params.id, types, channelId || null, channelName || null, Boolean(enabled));
    res.json({ ok: true, updated: types.length });
  } catch (err) {
    console.error("[logs bulk]", err.message);
    res.status(500).json({ error: "Failed to bulk save: " + err.message });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function start() {
  await initDb(db.pool);
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => console.log(`[website] Listening on :${PORT}`));
  }
}

start().catch((err) => console.error("[website] startup error:", err.message));

module.exports = app;

const { Pool } = require("pg");

// ─── IMPORTANT ────────────────────────────────────────────────────────────────
// Replit injects DATABASE_URL pointing to its own internal Postgres (heliumdb),
// which does NOT have our tables. We must ignore that and always use Neon.
// Only NEON_DATABASE_URL (set in Secrets) is allowed to override.
// A hardcoded fallback is kept here temporarily so the site keeps working while
// you finish moving to Secrets — remove it once NEON_DATABASE_URL is set.
// ─────────────────────────────────────────────────────────────────────────────
const NEON_URL =
  process.env.NEON_DATABASE_URL ||
  "postgresql://neondb_owner:npg_mFbEvz3ZCU0t@ep-lucky-paper-at3dzy4p-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on("error", (err) => console.error("[db] Pool error:", err.message));

async function query(text, params) {
  return pool.query(text, params);
}

async function getGuildsByIds(guildIds) {
  if (!guildIds.length) return [];
  const res = await query(
    `SELECT guild_id, guild_name, guild_icon, bot_added FROM guilds WHERE guild_id = ANY($1::text[])`,
    [guildIds]
  );
  return res.rows;
}

async function getChannels(guildId) {
  const res = await query(
    `SELECT channel_id, channel_name, channel_type FROM channels WHERE guild_id = $1 ORDER BY position ASC, channel_name ASC`,
    [guildId]
  );
  return res.rows;
}

async function getLogConfigs(guildId) {
  const res = await query(
    `SELECT log_type, channel_id, channel_name, enabled FROM log_channels WHERE guild_id = $1`,
    [guildId]
  );
  return res.rows;
}

// Moves old webhook into pending_delete_webhook_url when channel changes.
async function upsertLogConfig(guildId, logType, channelId, channelName, enabled) {
  await query(
    `INSERT INTO log_channels (guild_id, log_type, channel_id, channel_name, enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (guild_id, log_type) DO UPDATE SET
       channel_id   = EXCLUDED.channel_id,
       channel_name = EXCLUDED.channel_name,
       enabled      = EXCLUDED.enabled,
       pending_delete_webhook_url = CASE
         WHEN log_channels.channel_id IS DISTINCT FROM EXCLUDED.channel_id
              AND log_channels.webhook_url IS NOT NULL
           THEN log_channels.webhook_url
         ELSE log_channels.pending_delete_webhook_url
       END,
       webhook_id  = CASE WHEN log_channels.channel_id IS DISTINCT FROM EXCLUDED.channel_id
                           THEN NULL ELSE log_channels.webhook_id END,
       webhook_url = CASE WHEN log_channels.channel_id IS DISTINCT FROM EXCLUDED.channel_id
                           THEN NULL ELSE log_channels.webhook_url END,
       updated_at  = NOW()`,
    [guildId, logType, channelId, channelName, enabled]
  );
}

async function bulkUpsertLogConfigs(guildId, logTypes, channelId, channelName, enabled) {
  for (const logType of logTypes) {
    await upsertLogConfig(guildId, logType, channelId, channelName, enabled);
  }
}

module.exports = { pool, query, getGuildsByIds, getChannels, getLogConfigs, upsertLogConfig, bulkUpsertLogConfigs };

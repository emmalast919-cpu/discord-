// Shared DB initialiser — creates all required tables if they don't exist.
// Called at startup from both the website (server.js) and the bot (bot/index.js).
// Safe to call every run; all statements use IF NOT EXISTS.

async function initDb(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guilds (
        guild_id   TEXT PRIMARY KEY,
        guild_name TEXT NOT NULL DEFAULT '',
        guild_icon TEXT,
        owner_id   TEXT,
        bot_added  BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS channels (
        guild_id     TEXT NOT NULL,
        channel_id   TEXT NOT NULL,
        channel_name TEXT NOT NULL DEFAULT '',
        channel_type TEXT NOT NULL DEFAULT 'text',
        position     INTEGER NOT NULL DEFAULT 0,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, channel_id)
      );
      ALTER TABLE channels ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'text';

      CREATE TABLE IF NOT EXISTS log_channels (
        guild_id                   TEXT NOT NULL,
        log_type                   TEXT NOT NULL,
        channel_id                 TEXT,
        channel_name               TEXT,
        enabled                    BOOLEAN NOT NULL DEFAULT false,
        webhook_id                 TEXT,
        webhook_url                TEXT,
        pending_delete_webhook_url TEXT,
        updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, log_type)
      );
    `);
    console.log("[db] Schema OK.");
  } catch (err) {
    console.error("[db] Schema init failed:", err.message);
  }
}

module.exports = initDb;

const { migrate } = require('./schema-migrations');
let ready;
function ensureVolunteerSchema(sql) {
  if (!ready) ready = migrate(sql, 'volunteer-desk', 1, async q => {
    q`CREATE TABLE IF NOT EXISTS volunteer_accounts (
      bonus_id TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE, revision INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    q`CREATE TABLE IF NOT EXISTS volunteer_sessions (
      token_hash TEXT PRIMARY KEY, bonus_id TEXT NOT NULL REFERENCES volunteer_accounts(bonus_id),
      account_revision INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`;
    q`CREATE INDEX IF NOT EXISTS volunteer_sessions_expiry ON volunteer_sessions(expires_at)`;
    q`CREATE TABLE IF NOT EXISTS volunteer_login_attempts (
      bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`;
    q`CREATE TABLE IF NOT EXISTS volunteer_tickets (
      id SERIAL PRIMARY KEY, bonus_id TEXT NOT NULL REFERENCES volunteer_accounts(bonus_id),
      author_name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('issue','question')),
      target_type TEXT NOT NULL CHECK(target_type IN ('general','question','bonus')),
      target_id TEXT, target_label TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','progress','resolved')),
      request_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(bonus_id, request_id))`;
    q`CREATE INDEX IF NOT EXISTS volunteer_tickets_owner ON volunteer_tickets(bonus_id,id DESC)`;
    q`CREATE INDEX IF NOT EXISTS volunteer_tickets_status ON volunteer_tickets(status,id DESC)`;
    q`CREATE TABLE IF NOT EXISTS volunteer_messages (
      id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES volunteer_tickets(id),
      author_role TEXT NOT NULL CHECK(author_role IN ('admin','volunteer')), author_name TEXT NOT NULL,
      body TEXT NOT NULL, request_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(ticket_id,author_role,request_id))`;
    q`CREATE INDEX IF NOT EXISTS volunteer_messages_thread ON volunteer_messages(ticket_id,id DESC)`;
  }).catch(error => { ready = null; throw error; });
  return ready;
}
module.exports = { ensureVolunteerSchema };

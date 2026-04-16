const PARTICIPANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    city TEXT,
    device_token TEXT,
    last_ip TEXT,
    last_user_agent TEXT,
    current_question_id INTEGER,
    current_question_opened_at TIMESTAMPTZ,
    score INTEGER DEFAULT 0,
    answered_count INTEGER DEFAULT 0,
    last_activity TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

const ANSWERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER REFERENCES participants(id),
    question_id INTEGER NOT NULL,
    answer TEXT NOT NULL,
    correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

const GAME_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    summary_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    announcement_text TEXT,
    announcement_updated_at TIMESTAMPTZ
  )
`;

let coreSchemaPromise = null;
let gameStateSchemaPromise = null;

async function ensureCoreSchema(sql) {
  if (!coreSchemaPromise) {
    coreSchemaPromise = (async () => {
      await sql(PARTICIPANTS_TABLE_SQL);
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS city TEXT`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS device_token TEXT`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_ip TEXT`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_user_agent TEXT`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS current_question_id INTEGER`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS current_question_opened_at TIMESTAMPTZ`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS answered_count INTEGER DEFAULT 0`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`;
      await sql(ANSWERS_TABLE_SQL);
    })().catch((error) => {
      coreSchemaPromise = null;
      throw error;
    });
  }

  await coreSchemaPromise;
}

async function ensureGameStateSchema(sql) {
  if (!gameStateSchemaPromise) {
    gameStateSchemaPromise = (async () => {
      await ensureCoreSchema(sql);
      await sql(GAME_STATE_TABLE_SQL);
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS summary_at TIMESTAMPTZ`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS announcement_text TEXT`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ`;
    })().catch((error) => {
      gameStateSchemaPromise = null;
      throw error;
    });
  }

  await gameStateSchemaPromise;
}

module.exports = { ensureCoreSchema, ensureGameStateSchema };

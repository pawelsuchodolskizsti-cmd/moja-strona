const PARTICIPANTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'live',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    city TEXT,
    email TEXT,
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
    scope TEXT NOT NULL DEFAULT 'live',
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
    scope TEXT NOT NULL DEFAULT 'live',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    summary_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 10,
    announcement_text TEXT,
    announcement_updated_at TIMESTAMPTZ
  )
`;

const BONUS_REDEMPTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bonus_redemptions (
    id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'live',
    participant_id INTEGER REFERENCES participants(id),
    bonus_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(participant_id, bonus_id)
  )
`;

const QUESTION_OPENS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS question_opens (
    id SERIAL PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'live',
    participant_id INTEGER REFERENCES participants(id),
    question_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

const APP_RUNTIME_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_runtime (
    id INTEGER PRIMARY KEY DEFAULT 1,
    admin_view_scope TEXT NOT NULL DEFAULT 'live',
    test_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    test_seeded_at TIMESTAMPTZ,
    test_participant_count INTEGER NOT NULL DEFAULT 0
  )
`;

let coreSchemaPromise = null;
let gameStateSchemaPromise = null;
let bonusSchemaPromise = null;
let questionTrackingSchemaPromise = null;
let appRuntimeSchemaPromise = null;

async function ensureCoreSchema(sql) {
  if (!coreSchemaPromise) {
    coreSchemaPromise = (async () => {
      await sql(PARTICIPANTS_TABLE_SQL);
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS city TEXT`;
      await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS email TEXT`;
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
      await sql`ALTER TABLE answers ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`UPDATE participants SET scope = 'live' WHERE scope IS NULL`;
      await sql`UPDATE answers SET scope = 'live' WHERE scope IS NULL`;
      await sql`
        WITH duplicate_answers AS (
          SELECT id
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY participant_id, question_id
                ORDER BY created_at ASC, id ASC
              ) AS row_num
            FROM answers
            WHERE participant_id IS NOT NULL
          ) ranked
          WHERE row_num > 1
        )
        DELETE FROM answers
        WHERE id IN (SELECT id FROM duplicate_answers)
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_participants_device_token ON participants(device_token)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_participants_name_city ON participants(first_name, last_name, city)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_participants_last_activity ON participants(last_activity DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_participants_scope_last_activity ON participants(scope, last_activity DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_answers_participant_created_at ON answers(participant_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_answers_question_created_at ON answers(question_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_answers_scope_question_created_at ON answers(scope, question_id, created_at DESC)`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_answers_participant_question_unique
        ON answers(participant_id, question_id)
      `;
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
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS summary_at TIMESTAMPTZ`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 10`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS announcement_text TEXT`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ`;
      await sql`UPDATE game_state SET scope = 'live' WHERE scope IS NULL`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_state_scope_unique ON game_state(scope)`;
    })().catch((error) => {
      gameStateSchemaPromise = null;
      throw error;
    });
  }

  await gameStateSchemaPromise;
}

async function ensureBonusSchema(sql) {
  if (!bonusSchemaPromise) {
    bonusSchemaPromise = (async () => {
      await ensureGameStateSchema(sql);
      await sql(BONUS_REDEMPTIONS_TABLE_SQL);
      await sql`ALTER TABLE bonus_redemptions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`UPDATE bonus_redemptions SET scope = 'live' WHERE scope IS NULL`;
      await sql`
        WITH duplicate_bonus_redemptions AS (
          SELECT id
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY participant_id, bonus_id
                ORDER BY created_at ASC, id ASC
              ) AS row_num
            FROM bonus_redemptions
            WHERE participant_id IS NOT NULL
          ) ranked
          WHERE row_num > 1
        )
        DELETE FROM bonus_redemptions
        WHERE id IN (SELECT id FROM duplicate_bonus_redemptions)
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_bonus_redemptions_participant_created_at ON bonus_redemptions(participant_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_bonus_redemptions_bonus_created_at ON bonus_redemptions(bonus_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_bonus_redemptions_scope_bonus_created_at ON bonus_redemptions(scope, bonus_id, created_at DESC)`;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_redemptions_participant_bonus_unique
        ON bonus_redemptions(participant_id, bonus_id)
      `;
    })().catch((error) => {
      bonusSchemaPromise = null;
      throw error;
    });
  }

  await bonusSchemaPromise;
}

async function ensureQuestionTrackingSchema(sql) {
  if (!questionTrackingSchemaPromise) {
    questionTrackingSchemaPromise = (async () => {
      await ensureGameStateSchema(sql);
      await sql(QUESTION_OPENS_TABLE_SQL);
      await sql`ALTER TABLE question_opens ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`UPDATE question_opens SET scope = 'live' WHERE scope IS NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_question_opens_created_at ON question_opens(created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_question_opens_question_created_at ON question_opens(question_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_question_opens_participant_created_at ON question_opens(participant_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_question_opens_scope_created_at ON question_opens(scope, created_at DESC)`;
    })().catch((error) => {
      questionTrackingSchemaPromise = null;
      throw error;
    });
  }

  await questionTrackingSchemaPromise;
}

async function ensureAppRuntimeSchema(sql) {
  if (!appRuntimeSchemaPromise) {
    appRuntimeSchemaPromise = (async () => {
      await ensureGameStateSchema(sql);
      await sql(APP_RUNTIME_TABLE_SQL);
      await sql`ALTER TABLE app_runtime ADD COLUMN IF NOT EXISTS admin_view_scope TEXT NOT NULL DEFAULT 'live'`;
      await sql`ALTER TABLE app_runtime ADD COLUMN IF NOT EXISTS test_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE app_runtime ADD COLUMN IF NOT EXISTS test_seeded_at TIMESTAMPTZ`;
      await sql`ALTER TABLE app_runtime ADD COLUMN IF NOT EXISTS test_participant_count INTEGER NOT NULL DEFAULT 0`;
      await sql`
        INSERT INTO app_runtime (id, admin_view_scope, test_mode_enabled, test_seeded_at, test_participant_count)
        VALUES (1, 'live', FALSE, NULL, 0)
        ON CONFLICT (id) DO NOTHING
      `;
    })().catch((error) => {
      appRuntimeSchemaPromise = null;
      throw error;
    });
  }

  await appRuntimeSchemaPromise;
}

module.exports = {
  ensureCoreSchema,
  ensureGameStateSchema,
  ensureBonusSchema,
  ensureQuestionTrackingSchema,
  ensureAppRuntimeSchema
};

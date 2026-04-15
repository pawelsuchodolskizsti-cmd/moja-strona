const { neon } = require('@neondatabase/serverless');
const { ensureGameStateSchema } = require('./db-schema');

async function ensureGameSchema(sql) {
  await ensureGameStateSchema(sql);

  await sql`
    CREATE TABLE IF NOT EXISTS bonus_redemptions (
      id SERIAL PRIMARY KEY,
      participant_id INTEGER REFERENCES participants(id),
      bonus_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(participant_id, bonus_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS question_opens (
      id SERIAL PRIMARY KEY,
      participant_id INTEGER REFERENCES participants(id),
      question_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  await ensureGameSchema(sql);

  if (event.httpMethod === 'GET') {
    const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows[0] || {
        started_at: null,
        ended_at: null,
        summary_at: null,
        duration_minutes: 60
      })
    };
  }

  if (event.httpMethod === 'POST') {
    const { action } = JSON.parse(event.body || '{}');

    if (action === 'start') {
      await sql`
        UPDATE participants
        SET current_question_id = NULL, current_question_opened_at = NULL
      `;

      await sql`
        INSERT INTO game_state (id, started_at, ended_at, summary_at, duration_minutes)
        VALUES (1, NOW(), NULL, NULL, 60)
        ON CONFLICT (id) DO UPDATE
        SET started_at = NOW(), ended_at = NULL, summary_at = NULL, duration_minutes = 60
      `;

      const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows[0])
      };
    }

    if (action === 'stop') {
      await sql`
        UPDATE participants
        SET current_question_id = NULL, current_question_opened_at = NULL
      `;

      await sql`
        INSERT INTO game_state (id, started_at, ended_at, summary_at, duration_minutes)
        VALUES (1, NULL, NOW(), NOW() + INTERVAL '30 minutes', 60)
        ON CONFLICT (id) DO UPDATE
        SET started_at = NULL, ended_at = NOW(), summary_at = NOW() + INTERVAL '30 minutes'
      `;

      const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, stopped: true, ...rows[0] })
      };
    }

    if (action === 'reset') {
      await sql`DELETE FROM answers`;
      await sql`DELETE FROM bonus_redemptions`;
      await sql`DELETE FROM question_opens`;
      await sql`DELETE FROM participants`;
      await sql`
        INSERT INTO game_state (id, started_at, ended_at, summary_at, duration_minutes)
        VALUES (1, NULL, NULL, NULL, 60)
        ON CONFLICT (id) DO UPDATE
        SET started_at = NULL, ended_at = NULL, summary_at = NULL, duration_minutes = 60
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, reset: true })
      };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

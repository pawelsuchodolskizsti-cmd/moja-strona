const { neon } = require('@neondatabase/serverless');
const { ensureGameStateSchema } = require('../db-schema');

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
        duration_minutes: 60,
        announcement_text: null,
        announcement_updated_at: null
      })
    };
  }

  if (event.httpMethod === 'POST') {
    const { action, minutes, message } = JSON.parse(event.body || '{}');

    if (action === 'start') {
      await sql`
        UPDATE participants
        SET current_question_id = NULL, current_question_opened_at = NULL
      `;

      await sql`
        INSERT INTO game_state (
          id,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (1, NOW(), NULL, NULL, 60, NULL, NULL)
        ON CONFLICT (id) DO UPDATE
        SET
          started_at = NOW(),
          ended_at = NULL,
          summary_at = NULL,
          duration_minutes = 60,
          announcement_text = NULL,
          announcement_updated_at = NULL
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
        INSERT INTO game_state (
          id,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (1, NULL, NOW(), NOW() + INTERVAL '30 minutes', 60, NULL, NULL)
        ON CONFLICT (id) DO UPDATE
        SET
          started_at = NULL,
          ended_at = NOW(),
          summary_at = NOW() + INTERVAL '30 minutes'
      `;

      const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, stopped: true, ...rows[0] })
      };
    }

    if (action === 'extend-time') {
      const deltaMinutes = Number.parseInt(minutes, 10);
      const extraMinutes = Number.isFinite(deltaMinutes) ? deltaMinutes : 0;

      if (!extraMinutes) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Nie podano liczby minut do dodania.' })
        };
      }

      const currentRows = await sql`SELECT * FROM game_state WHERE id = 1`;
      const currentState = currentRows[0];

      if (!currentState?.started_at) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Gr\u0119 mo\u017cna wyd\u0142u\u017cy\u0107 tylko w trakcie aktywnej tury.' })
        };
      }

      await sql`
        UPDATE game_state
        SET duration_minutes = GREATEST(5, COALESCE(duration_minutes, 60) + ${extraMinutes})
        WHERE id = 1
      `;

      const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, extended: true, ...rows[0] })
      };
    }

    if (action === 'set-announcement') {
      const normalizedMessage = String(message || '').trim();

      await sql`
        INSERT INTO game_state (
          id,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (1, NULL, NULL, NULL, 60, NULL, NULL)
        ON CONFLICT (id) DO NOTHING
      `;

      if (!normalizedMessage) {
        await sql`
          UPDATE game_state
          SET announcement_text = NULL, announcement_updated_at = NULL
          WHERE id = 1
        `;
      } else {
        await sql`
          UPDATE game_state
          SET announcement_text = ${normalizedMessage}, announcement_updated_at = NOW()
          WHERE id = 1
        `;
      }

      const rows = await sql`SELECT * FROM game_state WHERE id = 1`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          announcementSet: Boolean(normalizedMessage),
          announcementCleared: !normalizedMessage,
          ...rows[0]
        })
      };
    }

    if (action === 'reset') {
      await sql`DELETE FROM answers`;
      await sql`DELETE FROM bonus_redemptions`;
      await sql`DELETE FROM question_opens`;
      await sql`DELETE FROM participants`;
      await sql`
        INSERT INTO game_state (
          id,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (1, NULL, NULL, NULL, 60, NULL, NULL)
        ON CONFLICT (id) DO UPDATE
        SET
          started_at = NULL,
          ended_at = NULL,
          summary_at = NULL,
          duration_minutes = 60,
          announcement_text = NULL,
          announcement_updated_at = NULL
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, reset: true })
      };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nieznana akcja panelu administratora.' })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

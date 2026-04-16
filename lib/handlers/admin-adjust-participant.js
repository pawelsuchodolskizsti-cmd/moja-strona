const { neon } = require('@neondatabase/serverless');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureCoreSchema, ensureGameStateSchema } = require('../db-schema');

async function ensureBonusSchema(sql) {
  await ensureCoreSchema(sql);
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
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { participantId, action, bonusId } = JSON.parse(event.body || '{}');
  if (!participantId || !action) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Brakuje danych do korekty.' })
    };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    const participantRows = await sql`
      SELECT id, score
      FROM participants
      WHERE id = ${participantId}
      LIMIT 1
    `;

    if (participantRows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Nie znaleziono uczestnika.' })
      };
    }

    if (action === 'add-point') {
      await sql`
        UPDATE participants
        SET score = score + 1, last_activity = NOW()
        WHERE id = ${participantId}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: 'Dodano 1 punkt.' })
      };
    }

    if (action === 'remove-point') {
      await sql`
        UPDATE participants
        SET score = GREATEST(score - 1, 0), last_activity = NOW()
        WHERE id = ${participantId}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: 'Odjeto 1 punkt.' })
      };
    }

    const bonus = BONUS_CODES.find(item => item.id === bonusId);
    if (!bonus) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Wybierz poprawny bonus.' })
      };
    }

    if (action === 'add-bonus') {
      const existing = await sql`
        SELECT id
        FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'Ten bonus jest juz przypisany do uczestnika.' })
        };
      }

      await sql`
        INSERT INTO bonus_redemptions (participant_id, bonus_id)
        VALUES (${participantId}, ${bonusId})
      `;

      await sql`
        UPDATE participants
        SET score = score + 1, last_activity = NOW()
        WHERE id = ${participantId}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: `Dodano bonus ${bonus.label}.` })
      };
    }

    if (action === 'remove-bonus') {
      const existing = await sql`
        SELECT id
        FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId}
        LIMIT 1
      `;

      if (existing.length === 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'Ten bonus nie jest przypisany do uczestnika.' })
        };
      }

      await sql`
        DELETE FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId}
      `;

      await sql`
        UPDATE participants
        SET score = GREATEST(score - 1, 0), last_activity = NOW()
        WHERE id = ${participantId}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: `Usunieto bonus ${bonus.label}.` })
      };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nieznana akcja korekty.' })
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blad bazy danych: ' + err.message })
    };
  }
};

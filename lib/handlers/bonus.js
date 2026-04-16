const { neon } = require('@neondatabase/serverless');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureCoreSchema, ensureGameStateSchema } = require('../db-schema');

function normalize(value) {
  return value.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

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
  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    if (event.httpMethod === 'GET') {
      const bonusId = event.queryStringParameters?.b;
      const participantId = Number.parseInt(event.queryStringParameters?.pid, 10);
      const bonus = BONUS_CODES.find(item => item.id === bonusId);
      if (!bonus) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono kodu bonusowego.' }) };
      }

      let alreadyRedeemed = false;
      let redeemedAt = null;

      if (participantId) {
        const existing = await sql`
          SELECT created_at
          FROM bonus_redemptions
          WHERE participant_id = ${participantId} AND bonus_id = ${bonusId}
          LIMIT 1
        `;

        alreadyRedeemed = existing.length > 0;
        redeemedAt = existing[0]?.created_at || null;
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: bonus.id,
          label: bonus.label,
          alreadyRedeemed,
          redeemedAt
        })
      };
    }

    if (event.httpMethod === 'POST') {
      const { participantId, bonusId, secret } = JSON.parse(event.body || '{}');

      if (!participantId || !bonusId || !secret) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Brakujace dane.' }) };
      }

      const gameRows = await sql`
        SELECT started_at, duration_minutes
        FROM game_state
        WHERE id = 1
        LIMIT 1
      `;

      const gameState = gameRows[0];
      const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
      const durationMs = Number(gameState?.duration_minutes || 60) * 60 * 1000;
      const isActive = startedAt && (Date.now() - startedAt) < durationMs;

      if (!isActive) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Gra jest juz zakonczona lub jeszcze nie wystartowala.' }) };
      }

      const participantRows = await sql`
        SELECT id
        FROM participants
        WHERE id = ${participantId}
        LIMIT 1
      `;

      if (participantRows.length === 0) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono uczestnika.' }) };
      }

      const bonus = BONUS_CODES.find(item => item.id === bonusId);
      if (!bonus) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono kodu bonusowego.' }) };
      }

      if (normalize(secret) !== normalize(bonus.secret)) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correct: false, error: 'Nieprawidlowe haslo.' })
        };
      }

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
          body: JSON.stringify({
            correct: false,
            alreadyRedeemed: true,
            message: 'Ten bonus masz juz zaliczony. Szukaj dalej kolejnych kodow QR.',
            error: 'Ten kod bonusowy zostal juz przez Ciebie wykorzystany.'
          })
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
        body: JSON.stringify({ correct: true, message: '+1 punkt! Kod bonusowy zrealizowany.' })
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blad bazy danych: ' + err.message })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

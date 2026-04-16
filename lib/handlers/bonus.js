const { neon } = require('@neondatabase/serverless');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');

function normalize(value) {
  return value.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    if (event.httpMethod === 'GET') {
      const bonusId = event.queryStringParameters?.b;
      const participantId = Number.parseInt(event.queryStringParameters?.pid, 10);
      const deviceToken = event.queryStringParameters?.token;
      const bonus = BONUS_CODES.find(item => item.id === bonusId);
      if (!bonus) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono kodu bonusowego.' }) };
      }

      let alreadyRedeemed = false;
      let redeemedAt = null;

      if (participantId) {
        const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
        if (!participantAuth.ok) {
          return participantAuth.response;
        }

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
      const { participantId, bonusId, secret, deviceToken } = JSON.parse(event.body || '{}');

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

      const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
      if (!participantAuth.ok) {
        return participantAuth.response;
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

      const inserted = await sql`
        INSERT INTO bonus_redemptions (participant_id, bonus_id)
        VALUES (${participantId}, ${bonusId})
        ON CONFLICT (participant_id, bonus_id) DO NOTHING
        RETURNING id
      `;

      if (inserted.length === 0) {
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
        UPDATE participants
        SET
          score =
            COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${participantId} AND correct = TRUE), 0)
            + COALESCE((SELECT COUNT(*)::int FROM bonus_redemptions WHERE participant_id = ${participantId}), 0),
          answered_count = COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${participantId}), 0),
          last_activity = NOW()
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

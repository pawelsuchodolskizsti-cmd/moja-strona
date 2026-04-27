const { neon } = require('@neondatabase/serverless');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');

function normalize(value) {
  return value.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isGameActive(gameState) {
  const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
  const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;
  return Boolean(startedAt && (Date.now() - startedAt) < durationMs);
}

async function getParticipantStats(sql, participantId) {
  const [participantRows, bonusRows] = await Promise.all([
    sql`
      SELECT answered_count AS "answers"
      FROM participants
      WHERE id = ${participantId}
        AND scope = 'live'
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS "bonuses"
      FROM bonus_redemptions
      WHERE participant_id = ${participantId}
        AND scope = 'live'
    `
  ]);

  return {
    answers: Number(participantRows[0]?.answers || 0),
    bonuses: Number(bonusRows[0]?.bonuses || 0)
  };
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

      const gameRows = await sql`
        SELECT started_at, duration_minutes
        FROM game_state
        WHERE scope = 'live'
        LIMIT 1
      `;

      if (!isGameActive(gameRows[0])) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Bonusy będą aktywne dopiero po starcie gry.',
            inactive: true
          })
        };
      }

      let activeParticipantId = null;
      let participantAuth = null;
      let alreadyRedeemed = false;
      let redeemedAt = null;

      if (participantId) {
        participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
        if (!participantAuth.ok) {
          return participantAuth.response;
        }
        activeParticipantId = Number(participantAuth.participant.id);

        const existing = await sql`
          SELECT created_at
          FROM bonus_redemptions
          WHERE participant_id = ${activeParticipantId} AND bonus_id = ${bonusId} AND scope = 'live'
          LIMIT 1
        `;

        alreadyRedeemed = existing.length > 0;
        redeemedAt = existing[0]?.created_at || null;
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: activeParticipantId,
          recoveredParticipant: Boolean(participantAuth?.recovered),
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
        return { statusCode: 400, body: JSON.stringify({ error: 'Brakujące dane.' }) };
      }

      const gameRows = await sql`
        SELECT started_at, duration_minutes
        FROM game_state
        WHERE scope = 'live'
        LIMIT 1
      `;

      if (!isGameActive(gameRows[0])) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Gra jest już zakończona lub jeszcze nie wystartowała.' }) };
      }

      const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
      if (!participantAuth.ok) {
        return participantAuth.response;
      }
      const activeParticipantId = Number(participantAuth.participant.id);

      const bonus = BONUS_CODES.find(item => item.id === bonusId);
      if (!bonus) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono kodu bonusowego.' }) };
      }

      if (normalize(secret) !== normalize(bonus.secret)) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correct: false, error: 'Nieprawidłowe hasło.' })
        };
      }

      const inserted = await sql`
        INSERT INTO bonus_redemptions (scope, participant_id, bonus_id)
        VALUES ('live', ${activeParticipantId}, ${bonusId})
        ON CONFLICT (participant_id, bonus_id) DO NOTHING
        RETURNING id
      `;

      if (inserted.length === 0) {
        const stats = await getParticipantStats(sql, activeParticipantId);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correct: false,
            participantId: activeParticipantId,
            recoveredParticipant: Boolean(participantAuth.recovered),
            alreadyRedeemed: true,
            message: 'Ten bonus masz już zaliczony. Szukaj dalej kolejnych kodów QR.',
            error: 'Ten kod bonusowy został już przez Ciebie wykorzystany.',
            stats
          })
        };
      }

      await sql`
        UPDATE participants
        SET
          score =
            COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${activeParticipantId} AND correct = TRUE AND scope = 'live'), 0)
            + COALESCE((SELECT COUNT(*)::int FROM bonus_redemptions WHERE participant_id = ${activeParticipantId} AND scope = 'live'), 0),
          answered_count = COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${activeParticipantId} AND scope = 'live'), 0),
          last_activity = NOW()
        WHERE id = ${activeParticipantId}
          AND scope = 'live'
      `;
      const stats = await getParticipantStats(sql, activeParticipantId);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correct: true,
          participantId: activeParticipantId,
          recoveredParticipant: Boolean(participantAuth.recovered),
          message: '+1 punkt! Kod bonusowy zrealizowany.',
          stats
        })
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Błąd bazy danych: ' + err.message })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
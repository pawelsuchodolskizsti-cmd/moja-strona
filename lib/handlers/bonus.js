const { transaction } = require('../transactions');
const { scoreQuery } = require('../scoring');
const { ensureScoringSchema } = require('../db-schema');
const { withApi } = require('../api-guard');
const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');
const { getBonusById } = require('../bonus-catalog');

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
  await ensureScoringSchema(sql);

  try {
    await ensureBonusSchema(sql);

    if (event.httpMethod === 'GET') {
      const bonusId = event.queryStringParameters?.b;
      const participantId = Number.parseInt(event.queryStringParameters?.pid, 10);
      const deviceToken = event.queryStringParameters?.token;
      const bonus = await getBonusById(sql, bonusId);
      if (!bonus) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Nie znaleziono kodu bonusowego.' }) };
      }

      const gameRows = await sql`
        SELECT started_at, duration_minutes, technical_pause_active, technical_pause_text
        FROM game_state
        WHERE scope = 'live'
        LIMIT 1
      `;

      if (gameRows[0]?.technical_pause_active) {
        return {
          statusCode: 423,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: gameRows[0].technical_pause_text || 'Za chwilę wracamy. Trwa krótka przerwa techniczna.',
            technicalPause: true
          })
        };
      }

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
          WHERE participant_id = ${participantId} AND bonus_id = ${bonusId} AND scope = 'live'
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
        SELECT started_at, duration_minutes, technical_pause_active, technical_pause_text
        FROM game_state
        WHERE scope = 'live'
        LIMIT 1
      `;

      const gameState = gameRows[0];
      if (gameState?.technical_pause_active) {
        return {
          statusCode: 423,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: gameState.technical_pause_text || 'Za chwilę wracamy. Trwa krótka przerwa techniczna.',
            technicalPause: true
          })
        };
      }

      const isActive = isGameActive(gameState);

      if (!isActive) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Gra jest już zakończona lub jeszcze nie wystartowała.' }) };
      }

      const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
      if (!participantAuth.ok) {
        return participantAuth.response;
      }

      const bonus = await getBonusById(sql, bonusId);
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

      const [inserted] = await transaction(sql,[sql`
        INSERT INTO bonus_redemptions(scope,participant_id,bonus_id)
        SELECT 'live',p.id,b.id FROM participants p JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at
        JOIN bonus_catalog b ON b.id=${bonusId} AND b.active=TRUE
        WHERE p.id=${participantId} AND p.scope='live' AND p.device_token=${deviceToken.trim()} AND NOT g.technical_pause_active AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute'
          AND regexp_replace(normalize(lower(btrim(b.secret)),NFD),'[̀-ͯ]','','g')=regexp_replace(normalize(lower(btrim(${secret.trim()}::text)),NFD),'[̀-ͯ]','','g')
        ON CONFLICT(participant_id,bonus_id) DO NOTHING RETURNING id
      `,scoreQuery(sql,participantId)],{participantId});

      if (inserted.length === 0) {
        const existing=await sql`SELECT id FROM bonus_redemptions WHERE participant_id=${participantId} AND bonus_id=${bonusId}`;
        if(!existing.length) return {statusCode:409,body:JSON.stringify({error:'Stan gry lub hasło bonusu zmieniły się. Odśwież stronę.'})};
        const stats = await getParticipantStats(sql, participantId);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            correct: false,
            alreadyRedeemed: true,
            message: 'Ten bonus masz juz zaliczony. Szukaj dalej kolejnych kodow QR.',
            error: 'Ten kod bonusowy zostal juz przez Ciebie wykorzystany.',
            stats
          })
        };
      }

      const stats = await getParticipantStats(sql, participantId);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correct: true,
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

exports.handler = withApi('bonus', exports.handler);

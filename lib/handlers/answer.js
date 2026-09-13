const { checkContentBlocked } = require('../content-availability');
const { transaction } = require('../transactions');
const { scoreQuery } = require('../scoring');
const { ensureScoringSchema } = require('../db-schema');
const { withApi } = require('../api-guard');
const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');
const { getQuestionById } = require('../question-catalog');

function normalize(value) {
  return value.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { participantId, questionId, answer, deviceToken } = JSON.parse(event.body || '{}');
  if (!participantId || !questionId || !answer) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Brakujace dane.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);
  await ensureScoringSchema(sql);

  async function getParticipantStats() {
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

  try {
    await ensureBonusSchema(sql);
    const blocked = await checkContentBlocked(sql, 'question', questionId);
    if (blocked) return blocked;
    const question = await getQuestionById(sql, questionId);
    if (!question) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pytanie nie istnieje.' }) };
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

    const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
    const durationMs = Number(gameState?.duration_minutes || 180) * 60 * 1000;
    const isActive = startedAt && (Date.now() - startedAt) < durationMs;

    if (!isActive) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Gra jest już zakończona lub jeszcze nie wystartowała.' }) };
    }

    const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
    if (!participantAuth.ok) {
      return participantAuth.response;
    }

    const userAnswer = normalize(answer);
    const correct = question.answers.some(item => normalize(item) === userAnswer);

    const [inserted] = await transaction(sql,[sql`
      INSERT INTO answers(scope,participant_id,question_id,answer,correct)
      SELECT 'live',p.id,q.id,${answer.trim()},EXISTS(SELECT 1 FROM jsonb_array_elements_text(q.answers) accepted(value)
        WHERE regexp_replace(normalize(lower(btrim(accepted.value)),NFD),'[̀-ͯ]','','g')=regexp_replace(normalize(lower(btrim(${answer.trim()}::text)),NFD),'[̀-ͯ]','','g'))
      FROM participants p JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at JOIN questions_catalog q ON q.id=${questionId} AND q.active=TRUE AND NOT q.technical_blocked
      WHERE p.id=${participantId} AND p.scope='live' AND p.device_token=${deviceToken.trim()} AND NOT g.technical_pause_active AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute'
      ON CONFLICT(participant_id,question_id) DO NOTHING RETURNING id
    `,scoreQuery(sql,participantId),sql`UPDATE participants SET last_activity=NOW(),current_question_id=NULL,current_question_opened_at=NULL WHERE id=${participantId}`],{participantId});

    if (inserted.length === 0) {
      const blockedNow = await checkContentBlocked(sql, 'question', questionId);
      if (blockedNow) return blockedNow;
      const duplicates = await sql`
        SELECT id, answer
        FROM answers
        WHERE participant_id = ${participantId} AND question_id = ${questionId} AND scope = 'live'
        LIMIT 1
      `;
      if (!duplicates.length) return {statusCode:403,body:JSON.stringify({error:'Stan gry lub sesja zmieniły się. Odśwież grę i spróbuj ponownie.'})};
      const stats = await getParticipantStats();

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitted: true,
          alreadyAnswered: true,
          answer: duplicates[0].answer,
          message: 'Odpowiedz zostala juz wczesniej wyslana.',
          stats
        })
      };
    }

    const stats = await getParticipantStats();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submitted: true,
        alreadyAnswered: false,
        message: 'Odpowiedz zostala wyslana.',
        stats
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Błąd bazy danych: ' + err.message }) };
  }
};

exports.handler = withApi('answer', exports.handler);

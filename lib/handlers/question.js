const {transaction} = require('../transactions');
const { ensureScoringSchema } = require('../db-schema');
const { withApi } = require('../api-guard');
const { neon } = require('@neondatabase/serverless');
const { ensureQuestionTrackingSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');
const { getQuestionById } = require('../question-catalog');

exports.handler = async (event) => {
  const qNum = parseInt(event.queryStringParameters?.q, 10);
  const pid = parseInt(event.queryStringParameters?.pid, 10);
  const deviceToken = event.queryStringParameters?.token;
  const shouldTrackOpen = event.queryStringParameters?.track !== '0';

  if (!qNum || qNum < 1) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nieprawidłowy numer pytania.' }) };
  }

  if (!pid) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Brak identyfikatora uczestnika.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);
  await ensureScoringSchema(sql);

  try {
    await ensureQuestionTrackingSchema(sql);
    const question = await getQuestionById(sql, qNum);
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

    const participantAuth = await validateParticipantDevice(sql, pid, deviceToken);
    if (!participantAuth.ok) {
      return participantAuth.response;
    }

    const [existing, participantRows, bonusRows] = await Promise.all([
      sql`
        SELECT answer
        FROM answers
        WHERE participant_id = ${pid} AND question_id = ${qNum} AND scope = 'live'
        LIMIT 1
      `,
      sql`
        SELECT answered_count AS "answers"
        FROM participants
        WHERE id = ${pid} AND scope = 'live'
        LIMIT 1
      `,
      sql`
        SELECT COUNT(*)::int AS "bonuses"
        FROM bonus_redemptions
        WHERE participant_id = ${pid} AND scope = 'live'
      `
    ]);

    if (shouldTrackOpen) {
      const [opened] = await transaction(sql, [sql`
        INSERT INTO question_opens(scope,participant_id,question_id)
        SELECT 'live',p.id,q.id FROM participants p
        JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at
        JOIN questions_catalog q ON q.id=${qNum} AND q.active=TRUE
        WHERE p.id=${pid} AND p.scope='live' AND p.device_token=${deviceToken.trim()}
          AND NOT g.technical_pause_active AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute'
        RETURNING id
      `,sql`
        UPDATE participants p SET
          current_question_id=CASE WHEN EXISTS(SELECT 1 FROM answers a WHERE a.participant_id=p.id AND a.question_id=${qNum}) THEN NULL ELSE ${qNum}::int END,
          current_question_opened_at=CASE WHEN EXISTS(SELECT 1 FROM answers a WHERE a.participant_id=p.id AND a.question_id=${qNum}) THEN NULL ELSE NOW() END,
          last_activity=NOW()
        FROM game_state g WHERE p.id=${pid} AND p.scope='live' AND p.device_token=${deviceToken.trim()}
          AND g.scope=p.scope AND g.started_at=p.game_started_at AND NOT g.technical_pause_active
          AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute'
          AND EXISTS(SELECT 1 FROM questions_catalog q WHERE q.id=${qNum} AND q.active=TRUE)
      `],{participantId:pid});
      if(!opened.length) return {statusCode:409,body:JSON.stringify({error:'Stan gry lub sesja zmieniły się. Odśwież grę.'})};
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: question.id,
        number: question.id,
        text: question.text,
        alreadyAnswered: existing.length > 0,
        previousAnswer: existing[0]?.answer || null,
        stats: {
          answers: Number(participantRows[0]?.answers || 0),
          bonuses: Number(bonusRows[0]?.bonuses || 0)
        }
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Błąd bazy danych: ' + err.message }) };
  }
};

exports.handler = withApi('question', exports.handler);

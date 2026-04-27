const { neon } = require('@neondatabase/serverless');
const { QUESTIONS } = require('../questions-data');
const { ensureQuestionTrackingSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');

exports.handler = async (event) => {
  const qNum = parseInt(event.queryStringParameters?.q, 10);
  const pid = parseInt(event.queryStringParameters?.pid, 10);
  const deviceToken = event.queryStringParameters?.token;
  const shouldTrackOpen = event.queryStringParameters?.track !== '0';

  if (!qNum || qNum < 1 || qNum > 30) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Nieprawidlowy numer pytania.' }) };
  }

  if (!pid) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Brak identyfikatora uczestnika.' }) };
  }

  const question = QUESTIONS.find(item => item.id === qNum);
  if (!question) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Pytanie nie istnieje.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureQuestionTrackingSchema(sql);

    const gameRows = await sql`
      SELECT started_at, duration_minutes
      FROM game_state
      WHERE scope = 'live'
      LIMIT 1
    `;

    const gameState = gameRows[0];
    const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
    const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;
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
      await sql`
        INSERT INTO question_opens (scope, participant_id, question_id)
        VALUES ('live', ${pid}, ${qNum})
      `;

      if (existing.length > 0) {
        await sql`
          UPDATE participants
          SET
            current_question_id = NULL,
            current_question_opened_at = NULL,
            last_activity = NOW()
          WHERE id = ${pid} AND scope = 'live'
        `;
      } else {
        await sql`
          UPDATE participants
          SET
            current_question_id = ${qNum},
            current_question_opened_at = NOW(),
            last_activity = NOW()
          WHERE id = ${pid} AND scope = 'live'
        `;
      }
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

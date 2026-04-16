const { neon } = require('@neondatabase/serverless');
const { QUESTIONS } = require('../questions-data');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');

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

  const question = QUESTIONS.find(item => item.id === parseInt(questionId, 10));
  if (!question) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Pytanie nie istnieje.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

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

    const userAnswer = normalize(answer);
    const correct = question.answers.some(item => normalize(item) === userAnswer);

    const inserted = await sql`
      INSERT INTO answers (participant_id, question_id, answer, correct)
      VALUES (${participantId}, ${questionId}, ${answer.trim()}, ${correct})
      ON CONFLICT (participant_id, question_id) DO NOTHING
      RETURNING id
    `;

    if (inserted.length === 0) {
      const duplicates = await sql`
        SELECT id, answer
        FROM answers
        WHERE participant_id = ${participantId} AND question_id = ${questionId}
        LIMIT 1
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitted: true,
          alreadyAnswered: true,
          answer: duplicates[0].answer,
          message: 'Odpowiedz zostala juz wczesniej wyslana.'
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
        last_activity = NOW(),
        current_question_id = NULL,
        current_question_opened_at = NULL
      WHERE id = ${participantId}
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submitted: true,
        alreadyAnswered: false,
        message: 'Odpowiedz zostala wyslana.'
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Blad bazy danych: ' + err.message }) };
  }
};

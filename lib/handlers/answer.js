const { neon } = require('@neondatabase/serverless');
const { QUESTIONS } = require('../questions-data');
const { ensureCoreSchema, ensureGameStateSchema } = require('../db-schema');

function normalize(value) {
  return value.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { participantId, questionId, answer } = JSON.parse(event.body || '{}');
  if (!participantId || !questionId || !answer) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Brakujace dane.' }) };
  }

  const question = QUESTIONS.find(item => item.id === parseInt(questionId, 10));
  if (!question) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Pytanie nie istnieje.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureCoreSchema(sql);
    await ensureGameStateSchema(sql);

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

    const duplicates = await sql`
      SELECT id, answer
      FROM answers
      WHERE participant_id = ${participantId} AND question_id = ${questionId}
      LIMIT 1
    `;

    if (duplicates.length > 0) {
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

    const userAnswer = normalize(answer);
    const correct = question.answers.some(item => normalize(item) === userAnswer);

    await sql`
      INSERT INTO answers (participant_id, question_id, answer, correct)
      VALUES (${participantId}, ${questionId}, ${answer.trim()}, ${correct})
    `;

    await sql`
      UPDATE participants
      SET
        score = score + ${correct ? 1 : 0},
        answered_count = answered_count + 1,
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

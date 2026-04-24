const { neon } = require('@neondatabase/serverless');
const { ensureBonusSchema } = require('../db-schema');
const { validateParticipantDevice } = require('../participant-device-auth');

exports.handler = async (event) => {
  const participantId = parseInt(event.queryStringParameters?.pid, 10);
  const deviceToken = event.queryStringParameters?.token;

  if (!participantId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Brak identyfikatora uczestnika.' })
    };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    const participantAuth = await validateParticipantDevice(sql, participantId, deviceToken);
    if (!participantAuth.ok) {
      return participantAuth.response;
    }

    const participantRows = await sql`
      SELECT
        score,
        answered_count AS "answers"
      FROM participants
      WHERE id = ${participantId}
        AND scope = 'live'
      LIMIT 1
    `;

    const bonusRows = await sql`
      SELECT COUNT(*)::int AS "bonuses"
      FROM bonus_redemptions
      WHERE participant_id = ${participantId}
        AND scope = 'live'
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: participantRows[0]?.score || 0,
        answers: participantRows[0]?.answers || 0,
        bonuses: bonusRows[0]?.bonuses || 0
      })
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

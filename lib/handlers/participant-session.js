const { neon } = require('@neondatabase/serverless');
const { ensureCoreSchema, ensureGameStateSchema } = require('../db-schema');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const deviceToken = event.queryStringParameters?.token?.trim();
  if (!deviceToken) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Brak identyfikatora urządzenia.' })
    };
  }

  const sql = neon(process.env.DATABASE_URL);
  const ipHeader =
    event.headers?.['x-nf-client-connection-ip'] ||
    event.headers?.['client-ip'] ||
    event.headers?.['x-real-ip'] ||
    event.headers?.['x-forwarded-for'] ||
    null;
  const clientIp = ipHeader ? String(ipHeader).split(',')[0].trim() : null;
  const userAgent =
    event.headers?.['user-agent'] ||
    event.headers?.['User-Agent'] ||
    null;

  try {
    await ensureCoreSchema(sql);
    await ensureGameStateSchema(sql);

    const gameRows = await sql`
      SELECT started_at, duration_minutes
      FROM game_state
      WHERE scope = 'live'
      LIMIT 1
    `;

    const gameState = gameRows[0];
    const gameStartedAt = gameState?.started_at || null;
    const startedAt = gameStartedAt ? new Date(gameStartedAt).getTime() : null;
    const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;
    const isActive = startedAt && (Date.now() - startedAt) < durationMs;

    if (!isActive) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Brak aktywnej sesji gry.' })
      };
    }

    const rows = await sql`
      SELECT id, first_name, last_name, city
      FROM participants
      WHERE device_token = ${deviceToken}
        AND scope = 'live'
        AND game_started_at = ${gameStartedAt}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Brak zapisanej sesji.' })
      };
    }

    await sql`
      UPDATE participants
      SET
        last_activity = NOW(),
        last_ip = ${clientIp},
        last_user_agent = ${userAgent},
        current_question_id = NULL,
        current_question_opened_at = NULL
      WHERE id = ${rows[0].id}
        AND scope = 'live'
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: rows[0].id,
        firstName: rows[0].first_name,
        lastName: rows[0].last_name,
        city: rows[0].city || '',
        gameStartedAt
      })
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Błąd bazy danych: ' + err.message })
    };
  }
};

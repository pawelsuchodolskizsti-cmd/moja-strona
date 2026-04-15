const { neon } = require('@neondatabase/serverless');
const { ensureCoreSchema, ensureGameStateSchema } = require('./db-schema');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { firstName, lastName, city, deviceToken } = JSON.parse(event.body || '{}');
  if (!firstName || !lastName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Podaj imie i nazwisko.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);
  const normalizedDeviceToken = typeof deviceToken === 'string' ? deviceToken.trim() : '';
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
      WHERE id = 1
      LIMIT 1
    `;

    const gameState = gameRows[0];
    const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
    const durationMs = Number(gameState?.duration_minutes || 60) * 60 * 1000;
    const isActive = startedAt && (Date.now() - startedAt) < durationMs;

    if (!isActive) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Gra jest juz zakonczona lub jeszcze nie wystartowala.' })
      };
    }

    if (normalizedDeviceToken) {
      const existingParticipant = await sql`
        SELECT id, first_name, last_name
        FROM participants
        WHERE device_token = ${normalizedDeviceToken}
        LIMIT 1
      `;

      if (existingParticipant.length > 0) {
        await sql`
          UPDATE participants
          SET
            last_activity = NOW(),
            last_ip = ${clientIp},
            last_user_agent = ${userAgent},
            current_question_id = NULL,
            current_question_opened_at = NULL
          WHERE id = ${existingParticipant[0].id}
        `;

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existingParticipant[0].id,
            firstName: existingParticipant[0].first_name,
            lastName: existingParticipant[0].last_name,
            reused: true
          })
        };
      }
    }

    const rows = await sql`
      INSERT INTO participants (first_name, last_name, city, device_token, last_ip, last_user_agent, last_activity)
      VALUES (
        ${firstName.trim()},
        ${lastName.trim()},
        ${city || null},
        ${normalizedDeviceToken || null},
        ${clientIp},
        ${userAgent},
        NOW()
      )
      RETURNING id
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rows[0].id, firstName, lastName })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Blad bazy danych: ' + err.message }) };
  }
};

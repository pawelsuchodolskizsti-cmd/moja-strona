const { ensureGameStateSchema } = require('./db-schema');

async function validateParticipantDevice(sql, participantId, deviceToken) {
  const normalizedDeviceToken = typeof deviceToken === 'string' ? deviceToken.trim() : '';

  if (!participantId) {
    return {
      ok: false,
      response: {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Brak identyfikatora uczestnika.' })
      }
    };
  }

  if (!normalizedDeviceToken) {
    return {
      ok: false,
      response: {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Brak identyfikatora urządzenia.' })
      }
    };
  }

  await ensureGameStateSchema(sql);

  const activeParticipantQuery = sql`
    SELECT p.id, p.device_token AS "deviceToken"
    FROM participants p
    JOIN game_state gs ON gs.scope = p.scope
    WHERE p.id = ${participantId}
      AND p.scope = 'live'
      AND p.game_started_at = gs.started_at
      AND gs.started_at IS NOT NULL
      AND NOW() < gs.started_at + (COALESCE(gs.duration_minutes, 10) * INTERVAL '1 minute')
    LIMIT 1
  `;

  const currentDeviceSessionQuery = sql`
    SELECT p.id, p.device_token AS "deviceToken"
    FROM participants p
    JOIN game_state gs ON gs.scope = p.scope
    WHERE p.scope = 'live'
      AND p.device_token = ${normalizedDeviceToken}
      AND p.game_started_at = gs.started_at
      AND gs.started_at IS NOT NULL
      AND NOW() < gs.started_at + (COALESCE(gs.duration_minutes, 10) * INTERVAL '1 minute')
    ORDER BY p.last_activity DESC NULLS LAST, p.id DESC
    LIMIT 1
  `;

  const [participantRows, deviceRows] = await Promise.all([
    activeParticipantQuery,
    currentDeviceSessionQuery
  ]);

  if (participantRows.length > 0) {
    const participant = participantRows[0];

    if (!participant.deviceToken || participant.deviceToken !== normalizedDeviceToken) {
      return {
        ok: false,
        response: {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'To konto jest przypisane do innego urządzenia. Zaloguj się ponownie.' })
        }
      };
    }

    return { ok: true, participant, recovered: false };
  }

  if (deviceRows.length > 0) {
    return { ok: true, participant: deviceRows[0], recovered: true };
  }

  return {
    ok: false,
    response: {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.' })
    }
  };
}

module.exports = { validateParticipantDevice };
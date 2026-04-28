const { ensureGameStateSchema } = require('./db-schema');

function jsonResponse(statusCode, error) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error })
  };
}

async function getActiveGame(sql) {
  const rows = await sql`
    SELECT started_at, duration_minutes
    FROM game_state
    WHERE scope = 'live'
      AND started_at IS NOT NULL
      AND NOW() < started_at + (COALESCE(duration_minutes, 10) * INTERVAL '1 minute')
    LIMIT 1
  `;

  return rows[0] || null;
}

async function validateParticipantDevice(sql, participantId, deviceToken) {
  const normalizedDeviceToken = typeof deviceToken === 'string' ? deviceToken.trim() : '';

  if (!participantId) {
    return { ok: false, response: jsonResponse(400, 'Brak identyfikatora uczestnika.') };
  }

  if (!normalizedDeviceToken) {
    return { ok: false, response: jsonResponse(401, 'Brak identyfikatora urządzenia.') };
  }

  await ensureGameStateSchema(sql);

  const activeGame = await getActiveGame(sql);
  if (!activeGame?.started_at) {
    return {
      ok: false,
      response: jsonResponse(403, 'Gra jest już zakończona lub jeszcze nie wystartowała.')
    };
  }

  const participantRows = await sql`
    SELECT id, device_token AS "deviceToken"
    FROM participants
    WHERE id = ${participantId}
      AND scope = 'live'
      AND (
        game_started_at = ${activeGame.started_at}
        OR created_at >= ${activeGame.started_at}
      )
    LIMIT 1
  `;

  if (participantRows.length > 0) {
    const participant = participantRows[0];

    if (!participant.deviceToken || participant.deviceToken !== normalizedDeviceToken) {
      return {
        ok: false,
        response: jsonResponse(403, 'To konto jest przypisane do innego urządzenia. Zaloguj się ponownie.')
      };
    }

    await sql`
      UPDATE participants
      SET
        game_started_at = ${activeGame.started_at},
        last_activity = NOW()
      WHERE id = ${participant.id}
        AND scope = 'live'
        AND (
          game_started_at IS DISTINCT FROM ${activeGame.started_at}
          OR last_activity IS NULL
          OR last_activity < NOW() - INTERVAL '30 seconds'
        )
    `;

    return { ok: true, participant };
  }

  const deviceRows = await sql`
    SELECT id
    FROM participants
    WHERE scope = 'live'
      AND device_token = ${normalizedDeviceToken}
      AND (
        game_started_at = ${activeGame.started_at}
        OR created_at >= ${activeGame.started_at}
      )
    ORDER BY
      CASE WHEN game_started_at = ${activeGame.started_at} THEN 0 ELSE 1 END,
      last_activity DESC NULLS LAST,
      id DESC
    LIMIT 1
  `;

  if (deviceRows.length > 0) {
    return {
      ok: false,
      response: jsonResponse(403, 'Sesja uczestnika wymaga odświeżenia. Przywracam dostęp do gry.')
    };
  }

  return {
    ok: false,
    response: jsonResponse(403, 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.')
  };
}

module.exports = { validateParticipantDevice };

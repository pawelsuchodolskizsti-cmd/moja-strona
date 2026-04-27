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

  // Fetch participant and game state separately to avoid timestamp equality issues.
  // The JOIN with p.game_started_at = gs.started_at can fail due to microsecond
  // precision differences between when the participant was registered and the live
  // game_state row — causing spurious 403s immediately after login.
  const participantRows = await sql`
    SELECT p.id, p.device_token AS "deviceToken", p.game_started_at AS "gameStartedAt"
    FROM participants p
    WHERE p.id = ${participantId}
      AND p.scope = 'live'
    LIMIT 1
  `;

  if (participantRows.length === 0) {
    return {
      ok: false,
      response: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.' })
      }
    };
  }

  const participant = participantRows[0];

  // Check game is still active
  const gameRows = await sql`
    SELECT started_at, duration_minutes
    FROM game_state
    WHERE scope = 'live'
    LIMIT 1
  `;

  const gameState = gameRows[0];
  const gsStartedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
  const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;
  const isGameActive = gsStartedAt && (Date.now() - gsStartedAt) < durationMs;

  if (!isGameActive) {
    return {
      ok: false,
      response: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.' })
      }
    };
  }

  // Verify participant belongs to current game session.
  // Use epoch ms comparison (truncated to seconds) to be resilient to microsecond
  // precision differences between stored game_started_at and gs.started_at.
  if (participant.gameStartedAt && gsStartedAt) {
    const participantGameTs = Math.floor(new Date(participant.gameStartedAt).getTime() / 1000);
    const currentGameTs = Math.floor(gsStartedAt / 1000);
    if (participantGameTs !== currentGameTs) {
      return {
        ok: false,
        response: {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.' })
        }
      };
    }
  }

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

  return { ok: true, participant };
}

module.exports = { validateParticipantDevice };

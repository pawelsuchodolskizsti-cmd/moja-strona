const { ensureGameStateSchema } = require('./db-schema');
function denied(statusCode, error) {
  return {ok:false,response:{statusCode,headers:{'Content-Type':'application/json'},body:JSON.stringify({error})}};
}

async function validateParticipantDevice(sql, participantId, deviceToken) {
  const token = typeof deviceToken === 'string' ? deviceToken.trim() : '';
  if (!participantId) return denied(400, 'Brak identyfikatora uczestnika.');
  if (!token) return denied(401, 'Brak identyfikatora urządzenia.');
  await ensureGameStateSchema(sql);
  // One HTTP round trip including the throttled heartbeat. Submission transactions
  // still validate device ownership and the current round again before writing.
  const [state] = await sql`
    WITH game AS (
      SELECT started_at FROM game_state WHERE scope='live' AND started_at IS NOT NULL
        AND NOW()<started_at+COALESCE(duration_minutes,180)*INTERVAL '1 minute'
    ), participant AS (
      SELECT p.id,p.device_token FROM participants p CROSS JOIN game g
      WHERE p.id=${participantId} AND p.scope='live'
        AND (p.game_started_at=g.started_at OR p.created_at>=g.started_at)
    ), heartbeat AS (
      UPDATE participants p SET game_started_at=g.started_at,last_activity=NOW()
      FROM game g WHERE p.id=${participantId} AND p.scope='live' AND p.device_token=${token}
        AND (p.game_started_at=g.started_at OR p.created_at>=g.started_at)
        AND (p.game_started_at IS DISTINCT FROM g.started_at OR p.last_activity IS NULL OR p.last_activity<NOW()-INTERVAL '30 seconds')
      RETURNING p.id
    )
    SELECT EXISTS(SELECT 1 FROM game) AS "gameActive",
      (SELECT id FROM participant) AS id, (SELECT device_token FROM participant) AS "deviceToken",
      EXISTS(SELECT 1 FROM participants p CROSS JOIN game g WHERE p.scope='live' AND p.device_token=${token}
        AND (p.game_started_at=g.started_at OR p.created_at>=g.started_at)) AS recoverable
  `;
  if (!state?.gameActive) return denied(403, 'Gra jest już zakończona lub jeszcze nie wystartowała.');
  if (state.id) {
    if (!state.deviceToken || state.deviceToken !== token) return denied(403, 'To konto jest przypisane do innego urządzenia. Zaloguj się ponownie.');
    return {ok:true,participant:{id:state.id,deviceToken:state.deviceToken}};
  }
  return denied(403, state.recoverable
    ? 'Sesja uczestnika wymaga odświeżenia. Przywracam dostęp do gry.'
    : 'Sesja uczestnika wygasła po starcie nowej gry. Zaloguj się ponownie.');
}
module.exports = { validateParticipantDevice };

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
        body: JSON.stringify({ error: 'Brak identyfikatora urzadzenia.' })
      }
    };
  }

  const participantRows = await sql`
    SELECT id, device_token AS "deviceToken"
    FROM participants
    WHERE id = ${participantId}
      AND scope = 'live'
    LIMIT 1
  `;

  if (participantRows.length === 0) {
    return {
      ok: false,
      response: {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Nie znaleziono uczestnika.' })
      }
    };
  }

  const participant = participantRows[0];

  if (!participant.deviceToken || participant.deviceToken !== normalizedDeviceToken) {
    return {
      ok: false,
      response: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'To konto jest przypisane do innego urzadzenia. Zaloguj sie ponownie.' })
      }
    };
  }

  return { ok: true, participant };
}

module.exports = { validateParticipantDevice };

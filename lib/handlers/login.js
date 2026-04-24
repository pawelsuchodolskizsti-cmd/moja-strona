const { neon } = require('@neondatabase/serverless');
const { ensureCoreSchema, ensureGameStateSchema } = require('../db-schema');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { firstName, lastName, city, email, deviceToken, acceptedRules } = JSON.parse(event.body || '{}');
  const normalizeUpper = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized || null;
  };
  const normalizeEmail = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || null;
  };
  const normalizedFirstName = normalizeUpper(firstName);
  const normalizedLastName = normalizeUpper(lastName);
  const normalizedCity = normalizeUpper(city);
  const normalizedEmail = normalizeEmail(email);
  const hasValidEmail = normalizedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  if (!normalizedFirstName || !normalizedLastName || !normalizedCity || !normalizedEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Podaj imię, nazwisko, miasto i adres e-mail.' }) };
  }

  if (!hasValidEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Podaj poprawny adres e-mail.' }) };
  }

  if (acceptedRules !== true) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Aby dolaczyc do gry, zaakceptuj regulamin.' }) };
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
      WHERE scope = 'live'
      LIMIT 1
    `;

    const gameState = gameRows[0];
    const startedAt = gameState?.started_at ? new Date(gameState.started_at).getTime() : null;
    const durationMs = Number(gameState?.duration_minutes || 10) * 60 * 1000;
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
        SELECT id, first_name, last_name, city, email
        FROM participants
        WHERE device_token = ${normalizedDeviceToken}
          AND scope = 'live'
        LIMIT 1
      `;

      if (existingParticipant.length > 0) {
        const sameIdentity =
          existingParticipant[0].first_name === normalizedFirstName &&
          existingParticipant[0].last_name === normalizedLastName &&
          (!existingParticipant[0].city || existingParticipant[0].city === normalizedCity) &&
          (!existingParticipant[0].email || existingParticipant[0].email === normalizedEmail);

        if (!sameIdentity) {
          return {
            statusCode: 409,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              error: 'To urządzenie jest już przypisane do innego uczestnika. W panelu admina użyj opcji odblokowania logowania na nowym urządzeniu albo wyczyść dane tej przeglądarki.'
            })
          };
        }

        await sql`
        UPDATE participants
        SET
          city = COALESCE(${normalizedCity}, city),
          email = COALESCE(${normalizedEmail}, email),
          last_activity = NOW(),
          last_ip = ${clientIp},
          last_user_agent = ${userAgent},
            current_question_id = NULL,
            current_question_opened_at = NULL
          WHERE id = ${existingParticipant[0].id}
            AND scope = 'live'
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

    const releasedParticipants = await sql`
      SELECT id, first_name, last_name, city, email
      FROM participants
      WHERE
        scope = 'live'
        AND
        first_name = ${normalizedFirstName}
        AND last_name = ${normalizedLastName}
        AND device_token IS NULL
        AND (
          ${normalizedCity}::TEXT IS NULL
          OR city = ${normalizedCity}
          OR city IS NULL
        )
      ORDER BY
        CASE WHEN city = ${normalizedCity} THEN 0 ELSE 1 END,
        last_activity DESC NULLS LAST,
        id DESC
      LIMIT 2
    `;

    if (releasedParticipants.length > 1 && !normalizedCity) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'To konto czeka na ponowne przypisanie. Zaloguj sie najpierw na ekranie glownym z imieniem, nazwiskiem i miastem.'
        })
      };
    }

    if (releasedParticipants.length > 0) {
      const participant = releasedParticipants[0];

      await sql`
        UPDATE participants
        SET
          city = COALESCE(${normalizedCity}, city),
          email = COALESCE(${normalizedEmail}, email),
          device_token = ${normalizedDeviceToken || null},
          last_ip = ${clientIp},
          last_user_agent = ${userAgent},
          last_activity = NOW(),
          current_question_id = NULL,
          current_question_opened_at = NULL
        WHERE id = ${participant.id}
          AND scope = 'live'
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: participant.id,
          firstName: participant.first_name,
          lastName: participant.last_name,
          reused: true,
          reassigned: true
        })
      };
    }

    const rows = await sql`
      INSERT INTO participants (scope, first_name, last_name, city, email, device_token, last_ip, last_user_agent, last_activity)
      VALUES (
        'live',
        ${normalizedFirstName},
        ${normalizedLastName},
        ${normalizedCity},
        ${normalizedEmail},
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
      body: JSON.stringify({ id: rows[0].id, firstName: normalizedFirstName, lastName: normalizedLastName })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Blad bazy danych: ' + err.message }) };
  }
};

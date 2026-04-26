const { neon } = require('@neondatabase/serverless');
const { BONUS_CODES } = require('../bonus-codes-data');
const { ensureBonusSchema } = require('../db-schema');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { participantId, action, bonusId } = JSON.parse(event.body || '{}');
  if (!participantId || !action) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Brakuje danych do korekty.' })
    };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureBonusSchema(sql);

    const participantRows = await sql`
      SELECT id, score, scope
      FROM participants
      WHERE id = ${participantId}
      LIMIT 1
    `;

    if (participantRows.length === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Nie znaleziono uczestnika.' })
      };
    }

    const participantScope = participantRows[0].scope || 'live';

    if (action === 'add-point') {
      await sql`
        UPDATE participants
        SET score = score + 1, last_activity = NOW()
        WHERE id = ${participantId}
          AND scope = ${participantScope}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: 'Dodano 1 punkt.' })
      };
    }

    if (action === 'remove-point') {
      await sql`
        UPDATE participants
        SET score = GREATEST(score - 1, 0), last_activity = NOW()
        WHERE id = ${participantId}
          AND scope = ${participantScope}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: 'Odjeto 1 punkt.' })
      };
    }

    if (action === 'release-device') {
      await sql`
        UPDATE participants
        SET
          device_token = NULL,
          last_ip = NULL,
          last_user_agent = NULL,
          current_question_id = NULL,
          current_question_opened_at = NULL,
          last_activity = NOW()
        WHERE id = ${participantId}
          AND scope = ${participantScope}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          message: 'Uczestnik może teraz zalogować się ponownie na nowym urządzeniu.'
        })
      };
    }

    const bonus = BONUS_CODES.find(item => item.id === bonusId);
    if (!bonus) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Wybierz poprawny bonus.' })
      };
    }

    if (action === 'add-bonus') {
      const existing = await sql`
        SELECT id
        FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId} AND scope = ${participantScope}
        LIMIT 1
      `;

      if (existing.length > 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'Ten bonus jest juz przypisany do uczestnika.' })
        };
      }

      await sql`
        INSERT INTO bonus_redemptions (scope, participant_id, bonus_id)
        VALUES (${participantScope}, ${participantId}, ${bonusId})
      `;

      await sql`
        UPDATE participants
        SET score = score + 1, last_activity = NOW()
        WHERE id = ${participantId}
          AND scope = ${participantScope}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: `Dodano bonus ${bonus.label}.` })
      };
    }

    if (action === 'remove-bonus') {
      const existing = await sql`
        SELECT id
        FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId} AND scope = ${participantScope}
        LIMIT 1
      `;

      if (existing.length === 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ok: false, error: 'Ten bonus nie jest przypisany do uczestnika.' })
        };
      }

      await sql`
        DELETE FROM bonus_redemptions
        WHERE participant_id = ${participantId} AND bonus_id = ${bonusId} AND scope = ${participantScope}
      `;

      await sql`
        UPDATE participants
        SET score = GREATEST(score - 1, 0), last_activity = NOW()
        WHERE id = ${participantId}
          AND scope = ${participantScope}
      `;

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, message: `Usunieto bonus ${bonus.label}.` })
      };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nieznana akcja korekty.' })
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

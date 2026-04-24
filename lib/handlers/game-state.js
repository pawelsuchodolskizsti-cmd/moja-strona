const { neon } = require('@neondatabase/serverless');
const {
  ensureBonusSchema,
  ensureQuestionTrackingSchema,
  ensureAppRuntimeSchema
} = require('../db-schema');
const {
  LIVE_SCOPE,
  ACTIVE_SCOPE,
  getScopeGameStateId,
  resolveScope
} = require('../data-scope');

function getDefaultState(scope = LIVE_SCOPE) {
  return {
    scope,
    started_at: null,
    ended_at: null,
    summary_at: null,
    duration_minutes: 10,
    announcement_text: null,
    announcement_updated_at: null
  };
}

async function loadStateRow(sql, scope) {
  const rows = await sql`
    SELECT
      scope,
      started_at,
      ended_at,
      summary_at,
      duration_minutes,
      announcement_text,
      announcement_updated_at
    FROM game_state
    WHERE scope = ${scope}
    LIMIT 1
  `;

  return rows[0] || getDefaultState(scope);
}

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  await ensureBonusSchema(sql);
  await ensureQuestionTrackingSchema(sql);
  await ensureAppRuntimeSchema(sql);

  if (event.httpMethod === 'GET') {
    const requestedScope = event.queryStringParameters?.scope || LIVE_SCOPE;
    const { scope, runtime, activeScope } = await resolveScope(sql, requestedScope);
    const state = await loadStateRow(sql, scope);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=2, stale-while-revalidate=8'
      },
      body: JSON.stringify({
        ...state,
        requestedScope,
        activeScope,
        testModeEnabled: Boolean(runtime.testModeEnabled)
      })
    };
  }

  if (event.httpMethod === 'POST') {
    const payload = JSON.parse(event.body || '{}');
    const { action, minutes, message } = payload;
    const requestedScope = payload.scope || event.queryStringParameters?.scope || LIVE_SCOPE;
    const { scope } = await resolveScope(sql, requestedScope);
    const stateId = getScopeGameStateId(scope);

    if (action === 'start') {
      await sql`
        UPDATE participants
        SET current_question_id = NULL, current_question_opened_at = NULL
        WHERE scope = ${scope}
      `;

      await sql`
        INSERT INTO game_state (
          id,
          scope,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (${stateId}, ${scope}, NOW(), NULL, NULL, 10, NULL, NULL)
        ON CONFLICT (scope) DO UPDATE
        SET
          id = EXCLUDED.id,
          started_at = NOW(),
          ended_at = NULL,
          summary_at = NULL,
          duration_minutes = 10,
          announcement_text = NULL,
          announcement_updated_at = NULL
      `;

      const state = await loadStateRow(sql, scope);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      };
    }

    if (action === 'stop') {
      await sql`
        UPDATE participants
        SET current_question_id = NULL, current_question_opened_at = NULL
        WHERE scope = ${scope}
      `;

      await sql`
        INSERT INTO game_state (
          id,
          scope,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (${stateId}, ${scope}, NULL, NOW(), NOW() + INTERVAL '5 minutes', 10, NULL, NULL)
        ON CONFLICT (scope) DO UPDATE
        SET
          id = EXCLUDED.id,
          started_at = NULL,
          ended_at = NOW(),
          summary_at = NOW() + INTERVAL '5 minutes'
      `;

      const state = await loadStateRow(sql, scope);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, stopped: true, ...state })
      };
    }

    if (action === 'extend-time') {
      const deltaMinutes = Number.parseInt(minutes, 10);
      const extraMinutes = Number.isFinite(deltaMinutes) ? deltaMinutes : 0;

      if (!extraMinutes) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Nie podano liczby minut do dodania.' })
        };
      }

      const currentState = await loadStateRow(sql, scope);
      const startedAt = currentState?.started_at ? new Date(currentState.started_at).getTime() : null;
      const durationMs = Number(currentState?.duration_minutes || 10) * 60 * 1000;
      const isActive = Boolean(startedAt && (Date.now() - startedAt) < durationMs);

      if (!isActive) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Gre mozna wydluzyc tylko w trakcie aktywnej tury.' })
        };
      }

      await sql`
        UPDATE game_state
        SET duration_minutes = GREATEST(5, COALESCE(duration_minutes, 10) + ${extraMinutes})
        WHERE scope = ${scope}
      `;

      const state = await loadStateRow(sql, scope);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, extended: true, ...state })
      };
    }

    if (action === 'set-announcement') {
      const normalizedMessage = String(message || '').trim();

      await sql`
        INSERT INTO game_state (
          id,
          scope,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (${stateId}, ${scope}, NULL, NULL, NULL, 10, NULL, NULL)
        ON CONFLICT (scope) DO NOTHING
      `;

      if (!normalizedMessage) {
        await sql`
          UPDATE game_state
          SET announcement_text = NULL, announcement_updated_at = NULL
          WHERE scope = ${scope}
        `;
      } else {
        await sql`
          UPDATE game_state
          SET announcement_text = ${normalizedMessage}, announcement_updated_at = NOW()
          WHERE scope = ${scope}
        `;
      }

      const state = await loadStateRow(sql, scope);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          announcementSet: Boolean(normalizedMessage),
          announcementCleared: !normalizedMessage,
          ...state
        })
      };
    }

    if (action === 'reset') {
      await sql`DELETE FROM answers WHERE scope = ${scope}`;
      await sql`DELETE FROM bonus_redemptions WHERE scope = ${scope}`;
      await sql`DELETE FROM question_opens WHERE scope = ${scope}`;
      await sql`DELETE FROM participants WHERE scope = ${scope}`;
      await sql`
        INSERT INTO game_state (
          id,
          scope,
          started_at,
          ended_at,
          summary_at,
          duration_minutes,
          announcement_text,
          announcement_updated_at
        )
        VALUES (${stateId}, ${scope}, NULL, NULL, NULL, 10, NULL, NULL)
        ON CONFLICT (scope) DO UPDATE
        SET
          id = EXCLUDED.id,
          started_at = NULL,
          ended_at = NULL,
          summary_at = NULL,
          duration_minutes = 10,
          announcement_text = NULL,
          announcement_updated_at = NULL
      `;

      if (scope !== LIVE_SCOPE) {
        await sql`
          UPDATE app_runtime
          SET
            admin_view_scope = 'live',
            test_mode_enabled = FALSE,
            test_seeded_at = NULL,
            test_participant_count = 0
          WHERE id = 1
        `;
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, reset: true, scope })
      };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Nieznana akcja panelu administratora.' })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

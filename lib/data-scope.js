const { ensureAppRuntimeSchema } = require('./db-schema');

const LIVE_SCOPE = 'live';
const TEST_SCOPE = 'test';
const ACTIVE_SCOPE = 'active';

function normalizeScope(value) {
  return value === TEST_SCOPE ? TEST_SCOPE : LIVE_SCOPE;
}

function normalizeRequestedScope(value) {
  if (value === ACTIVE_SCOPE) {
    return ACTIVE_SCOPE;
  }

  return normalizeScope(value);
}

function getScopeGameStateId(scope) {
  return scope === TEST_SCOPE ? 2 : 1;
}

async function getRuntimeState(sql) {
  await ensureAppRuntimeSchema(sql);

  const rows = await sql`
    SELECT
      admin_view_scope AS "adminViewScope",
      test_mode_enabled AS "testModeEnabled",
      test_seeded_at AS "testSeededAt",
      test_participant_count AS "testParticipantCount"
    FROM app_runtime
    WHERE id = 1
    LIMIT 1
  `;

  return rows[0] || {
    adminViewScope: LIVE_SCOPE,
    testModeEnabled: false,
    testSeededAt: null,
    testParticipantCount: 0
  };
}

async function resolveScope(sql, requestedScope) {
  const runtime = await getRuntimeState(sql);
  const normalizedRequested = normalizeRequestedScope(requestedScope);
  const activeScope = runtime.testModeEnabled && runtime.adminViewScope === TEST_SCOPE
    ? TEST_SCOPE
    : LIVE_SCOPE;

  return {
    runtime,
    scope: normalizedRequested === ACTIVE_SCOPE ? activeScope : normalizedRequested,
    activeScope
  };
}

module.exports = {
  LIVE_SCOPE,
  TEST_SCOPE,
  ACTIVE_SCOPE,
  normalizeScope,
  normalizeRequestedScope,
  getScopeGameStateId,
  getRuntimeState,
  resolveScope
};

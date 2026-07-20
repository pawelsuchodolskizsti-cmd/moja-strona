const { neon } = require('@neondatabase/serverless');
const {
  SIMULATION_PARTICIPANT_COUNT,
  clearTestMode,
  disableTestMode,
  materializeTestProgress,
  readTestCounts,
  seedLargeTestSimulation
} = require('../test-simulation');
const { LIVE_SCOPE, TEST_SCOPE, getRuntimeState } = require('../data-scope');

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  if (event.httpMethod === 'GET') {
    const runtime = await getRuntimeState(sql);
    if (runtime.testModeEnabled && runtime.adminViewScope === TEST_SCOPE) {
      await materializeTestProgress(sql);
    }

    const counts = await readTestCounts(sql);
    const activeScope = runtime.testModeEnabled && runtime.adminViewScope === TEST_SCOPE
      ? TEST_SCOPE
      : LIVE_SCOPE;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeScope,
        testModeEnabled: Boolean(runtime.testModeEnabled),
        testSeededAt: runtime.testSeededAt || null,
        testParticipantCount: Number(runtime.testParticipantCount || 0),
        counts
      })
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const payload = JSON.parse(event.body || '{}');
  const action = String(payload.action || '').trim();

  if (action === 'disable') {
    await disableTestMode(sql);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Powrót do danych żywych został włączony.',
        activeScope: LIVE_SCOPE,
        testModeEnabled: false
      })
    };
  }

  if (action === 'clear') {
    await clearTestMode(sql);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Dane testowe zostały usunięte.',
        activeScope: LIVE_SCOPE,
        testModeEnabled: false,
        counts: { participants: 0, answers: 0, bonuses: 0, cities: 0 }
      })
    };
  }

  if (action === 'enable') {
    const counts = await readTestCounts(sql);
    if (!counts.participants) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Najpierw uruchom wielki test 300 uczestników.' })
      };
    }

    await sql`
      UPDATE app_runtime
      SET admin_view_scope = ${TEST_SCOPE}, test_mode_enabled = TRUE
      WHERE id = 1
    `;
    await materializeTestProgress(sql);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Widoki admina i tablicy wyników pracują teraz na danych testowych.',
        activeScope: TEST_SCOPE,
        testModeEnabled: true,
        counts
      })
    };
  }

  if (action === 'seed' || action === 'start-large') {
    const counts = await seedLargeTestSimulation(sql);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: `Wielki test ${SIMULATION_PARTICIPANT_COUNT} uczestników został uruchomiony. Odpowiedzi i bonusy będą wpadać stopniowo przy odświeżaniu panelu oraz tablicy wyników.`,
        activeScope: TEST_SCOPE,
        testModeEnabled: true,
        testParticipantCount: SIMULATION_PARTICIPANT_COUNT,
        counts
      })
    };
  }

  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Nieznana akcja trybu testowego.' })
  };
};

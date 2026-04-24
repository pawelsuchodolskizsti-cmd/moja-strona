const { neon } = require('@neondatabase/serverless');
const { QUESTIONS } = require('../questions-data');
const { BONUS_CODES } = require('../bonus-codes-data');
const {
  ensureBonusSchema,
  ensureQuestionTrackingSchema,
  ensureAppRuntimeSchema
} = require('../db-schema');
const {
  LIVE_SCOPE,
  TEST_SCOPE,
  getScopeGameStateId,
  getRuntimeState
} = require('../data-scope');

const FIRST_NAMES = ['PAWEL', 'JULIA', 'MAJA', 'KACPER', 'ZUZANNA', 'JAN', 'LENA', 'ANTONI', 'OLIWIA', 'MICHAL', 'NATALIA', 'SZYMON'];
const LAST_NAMES = ['NOWAK', 'KOWALSKI', 'WISNIEWSKI', 'WOJCIK', 'KACZMAREK', 'MAZUR', 'ZIELINSKI', 'SIKORA', 'KAMINSKA', 'KROL', 'LEWANDOWSKI', 'SOKOLOWSKA'];
const CITIES = ['ELBLAG', 'MALBORK', 'GDANSK', 'GDYNIA', 'OLSZTYN', 'WARSZAWA', 'TORUN', 'SOPOT'];

function clampParticipantCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 35;
  }

  return Math.min(Math.max(parsed, 20), 300);
}

function buildSimulationPlan(participantCount) {
  const now = Date.now();
  const questionCount = QUESTIONS.length || 30;
  const bonusCount = BONUS_CODES.length || 10;

  return Array.from({ length: participantCount }, (_, index) => {
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
    const lastName = `${LAST_NAMES[index % LAST_NAMES.length]} ${index + 1}`.trim();
    const city = CITIES[index % CITIES.length];
    const answersTarget = Math.min(questionCount, 4 + ((index * 3) % Math.max(questionCount - 2, 4)));
    const bonusTarget = Math.min(bonusCount, index % Math.min(bonusCount + 1, 5));
    const correctTarget = Math.max(1, Math.min(answersTarget, Math.round(answersTarget * (0.52 + ((index % 5) * 0.08)))));
    const createdAt = new Date(now - ((participantCount - index) * 90 * 1000));

    const answers = Array.from({ length: answersTarget }, (_, answerIndex) => {
      const question = QUESTIONS[(index + answerIndex) % questionCount];
      const correct = answerIndex < correctTarget;
      const answerCreatedAt = new Date(now - ((index * 35) + (answerIndex * 42) + 60) * 1000);

      return {
        questionId: question.id,
        correct,
        answer: correct ? question.answers[0] : `TEST ${question.id}`,
        createdAt: answerCreatedAt
      };
    });

    const bonuses = BONUS_CODES.slice(0, bonusTarget).map((bonus, bonusIndex) => ({
      bonusId: bonus.id,
      createdAt: new Date(now - ((index * 45) + (bonusIndex * 95) + 40) * 1000)
    }));

    const activeQuestion = index < Math.min(6, participantCount)
      ? QUESTIONS[(index + answersTarget) % questionCount]
      : null;
    const activeOpenedAt = activeQuestion ? new Date(now - ((index + 1) * 18) * 1000) : null;
    const lastAnswerAt = answers[answers.length - 1]?.createdAt || createdAt;
    const lastBonusAt = bonuses[bonuses.length - 1]?.createdAt || createdAt;
    const lastActivity = [createdAt, lastAnswerAt, lastBonusAt, activeOpenedAt]
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      firstName,
      lastName,
      city,
      email: `test${index + 1}@sladgry.pl`,
      createdAt,
      lastActivity,
      activeQuestionId: activeQuestion?.id || null,
      activeOpenedAt,
      answers,
      bonuses,
      score: answers.filter((item) => item.correct).length + bonuses.length,
      answeredCount: answers.length
    };
  });
}

async function clearTestScope(sql) {
  await sql`DELETE FROM answers WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM bonus_redemptions WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM question_opens WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM participants WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM game_state WHERE scope = ${TEST_SCOPE}`;
}

async function readTestCounts(sql) {
  const [participantsRows, answersRows, bonusesRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS "count" FROM participants WHERE scope = ${TEST_SCOPE}`,
    sql`SELECT COUNT(*)::int AS "count" FROM answers WHERE scope = ${TEST_SCOPE}`,
    sql`SELECT COUNT(*)::int AS "count" FROM bonus_redemptions WHERE scope = ${TEST_SCOPE}`
  ]);

  return {
    participants: Number(participantsRows[0]?.count || 0),
    answers: Number(answersRows[0]?.count || 0),
    bonuses: Number(bonusesRows[0]?.count || 0)
  };
}

exports.handler = async (event) => {
  const sql = neon(process.env.DATABASE_URL);

  await ensureBonusSchema(sql);
  await ensureQuestionTrackingSchema(sql);
  await ensureAppRuntimeSchema(sql);

  if (event.httpMethod === 'GET') {
    const [runtime, counts] = await Promise.all([
      getRuntimeState(sql),
      readTestCounts(sql)
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeScope: runtime.testModeEnabled && runtime.adminViewScope === TEST_SCOPE ? TEST_SCOPE : LIVE_SCOPE,
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
    await sql`
      UPDATE app_runtime
      SET admin_view_scope = 'live', test_mode_enabled = FALSE
      WHERE id = 1
    `;

    const runtime = await getRuntimeState(sql);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Powrot do danych zywych zostal wlaczony.',
        activeScope: LIVE_SCOPE,
        testModeEnabled: Boolean(runtime.testModeEnabled)
      })
    };
  }

  if (action === 'clear') {
    await clearTestScope(sql);
    await sql`
      UPDATE app_runtime
      SET
        admin_view_scope = 'live',
        test_mode_enabled = FALSE,
        test_seeded_at = NULL,
        test_participant_count = 0
      WHERE id = 1
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Dane testowe zostaly usuniete.',
        activeScope: LIVE_SCOPE,
        counts: { participants: 0, answers: 0, bonuses: 0 }
      })
    };
  }

  if (action === 'enable') {
    const counts = await readTestCounts(sql);
    if (!counts.participants) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Najpierw wygeneruj dane testowe do podgladu.' })
      };
    }

    await sql`
      UPDATE app_runtime
      SET admin_view_scope = ${TEST_SCOPE}, test_mode_enabled = TRUE
      WHERE id = 1
    `;

    const runtime = await getRuntimeState(sql);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Widoki admina i tablicy wynikow pracuja teraz na danych testowych.',
        activeScope: runtime.adminViewScope,
        testModeEnabled: Boolean(runtime.testModeEnabled),
        counts
      })
    };
  }

  if (action === 'seed') {
    const participantCount = clampParticipantCount(payload.participantCount);
    const plan = buildSimulationPlan(participantCount);
    const now = new Date();
    const startedAt = new Date(now.getTime() - 2 * 60 * 1000);

    await clearTestScope(sql);

    for (const participant of plan) {
      const insertedParticipant = await sql`
        INSERT INTO participants (
          scope,
          first_name,
          last_name,
          city,
          email,
          current_question_id,
          current_question_opened_at,
          score,
          answered_count,
          last_activity,
          created_at
        )
        VALUES (
          ${TEST_SCOPE},
          ${participant.firstName},
          ${participant.lastName},
          ${participant.city},
          ${participant.email},
          ${participant.activeQuestionId},
          ${participant.activeOpenedAt},
          ${participant.score},
          ${participant.answeredCount},
          ${participant.lastActivity},
          ${participant.createdAt}
        )
        RETURNING id
      `;

      const participantId = insertedParticipant[0].id;

      for (const answer of participant.answers) {
        await sql`
          INSERT INTO answers (scope, participant_id, question_id, answer, correct, created_at)
          VALUES (
            ${TEST_SCOPE},
            ${participantId},
            ${answer.questionId},
            ${answer.answer},
            ${answer.correct},
            ${answer.createdAt}
          )
        `;

        await sql`
          INSERT INTO question_opens (scope, participant_id, question_id, created_at)
          VALUES (
            ${TEST_SCOPE},
            ${participantId},
            ${answer.questionId},
            ${new Date(answer.createdAt.getTime() - 18 * 1000)}
          )
        `;
      }

      if (participant.activeQuestionId && participant.activeOpenedAt) {
        await sql`
          INSERT INTO question_opens (scope, participant_id, question_id, created_at)
          VALUES (${TEST_SCOPE}, ${participantId}, ${participant.activeQuestionId}, ${participant.activeOpenedAt})
        `;
      }

      for (const bonus of participant.bonuses) {
        await sql`
          INSERT INTO bonus_redemptions (scope, participant_id, bonus_id, created_at)
          VALUES (${TEST_SCOPE}, ${participantId}, ${bonus.bonusId}, ${bonus.createdAt})
        `;
      }
    }

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
      VALUES (
        ${getScopeGameStateId(TEST_SCOPE)},
        ${TEST_SCOPE},
        ${startedAt},
        NULL,
        NULL,
        10,
        'Tryb testowy jest aktywny. Ranking i tablica wynikow pokazuja dane symulacyjne zapisane w bazie.',
        ${now}
      )
      ON CONFLICT (scope) DO UPDATE
      SET
        id = EXCLUDED.id,
        started_at = EXCLUDED.started_at,
        ended_at = NULL,
        summary_at = NULL,
        duration_minutes = EXCLUDED.duration_minutes,
        announcement_text = EXCLUDED.announcement_text,
        announcement_updated_at = EXCLUDED.announcement_updated_at
    `;

    await sql`
      UPDATE app_runtime
      SET
        admin_view_scope = ${TEST_SCOPE},
        test_mode_enabled = TRUE,
        test_seeded_at = NOW(),
        test_participant_count = ${participantCount}
      WHERE id = 1
    `;

    const counts = await readTestCounts(sql);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: `Wygenerowano ${participantCount} uczestnikow testowych i wlaczono podglad danych testowych.`,
        activeScope: TEST_SCOPE,
        testModeEnabled: true,
        testParticipantCount: participantCount,
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

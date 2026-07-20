const {
  ensureBonusSchema,
  ensureBonusCatalogSchema,
  ensureGameStateSchema,
  ensureQuestionTrackingSchema,
  ensureQuestionCatalogSchema,
  ensureAppRuntimeSchema
} = require('./db-schema');
const { TEST_SCOPE, LIVE_SCOPE, getScopeGameStateId } = require('./data-scope');
const { getQuestionCatalog } = require('./question-catalog');
const { getBonusCatalog } = require('./bonus-catalog');

const SIMULATION_PARTICIPANT_COUNT = 300;
const SIMULATION_DURATION_MINUTES = 10;
const SIMULATION_INITIAL_OFFSET_MS = 45 * 1000;
const ANSWER_BATCH_LIMIT = 90;
const BONUS_BATCH_LIMIT = 25;

const FIRST_NAMES = ['PAWEL', 'JULIA', 'MAJA', 'KACPER', 'ZUZANNA', 'JAN', 'LENA', 'ANTONI', 'OLIWIA', 'MICHAL', 'NATALIA', 'SZYMON', 'MARTA', 'FILIP', 'EMILIA', 'ADAM'];
const LAST_NAMES = ['NOWAK', 'KOWALSKI', 'WISNIEWSKI', 'WOJCIK', 'KACZMAREK', 'MAZUR', 'ZIELINSKI', 'SIKORA', 'KAMINSKA', 'KROL', 'LEWANDOWSKI', 'SOKOLOWSKA', 'ZAJAC', 'WROBEL', 'PAWLAK', 'DUDEK'];
const CITIES = ['ELBLAG', 'MALBORK', 'GDANSK', 'GDYNIA', 'OLSZTYN', 'WARSZAWA', 'TORUN', 'SOPOT', 'KRAKOW', 'LODZ', 'POZNAN', 'WROCLAW'];

async function ensureSimulationSchema(sql) {
  await ensureBonusSchema(sql);
  await ensureBonusCatalogSchema(sql);
  await ensureGameStateSchema(sql);
  await ensureQuestionTrackingSchema(sql);
  await ensureQuestionCatalogSchema(sql);
  await ensureAppRuntimeSchema(sql);
}

function getParticipantSeed(index) {
  return {
    firstName: FIRST_NAMES[index % FIRST_NAMES.length],
    lastName: `${LAST_NAMES[(index * 5) % LAST_NAMES.length]} ${index + 1}`.trim(),
    city: CITIES[(index * 7) % CITIES.length],
    email: `test${index + 1}@sladgry.pl`
  };
}

function getParticipantIndex(participant, fallbackIndex) {
  const match = String(participant.email || '').match(/^test(\d+)@sladgry\.pl$/i);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed - 1;
  }

  return fallbackIndex;
}

function getMaxAnswersForParticipant(index, questionCount) {
  if (!questionCount) return 0;
  const minAnswers = Math.min(questionCount, 8);
  const span = Math.max(1, questionCount - minAnswers + 1);
  return Math.min(questionCount, minAnswers + ((index * 7) % span));
}

function getMaxBonusesForParticipant(index, bonusCount) {
  if (!bonusCount) return 0;
  return Math.min(bonusCount, (index * 3) % Math.min(bonusCount + 1, 6));
}

function getAnswerOffsetSeconds(index, answerIndex, gameSeconds) {
  const spreadSeconds = Math.max(90, gameSeconds - 30);
  return 8 + ((index * 11 + answerIndex * 29 + (index % 17) * (answerIndex + 1)) % spreadSeconds);
}

function getBonusOffsetSeconds(index, bonusIndex, gameSeconds) {
  const spreadSeconds = Math.max(90, gameSeconds - 40);
  return 18 + ((index * 19 + bonusIndex * 97 + (index % 13) * 9) % spreadSeconds);
}

function isCorrectAnswer(index, answerIndex) {
  return ((index + answerIndex * 2) % 5) !== 0;
}

async function clearTestScope(sql) {
  await sql`DELETE FROM answers WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM bonus_redemptions WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM question_opens WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM participants WHERE scope = ${TEST_SCOPE}`;
  await sql`DELETE FROM game_state WHERE scope = ${TEST_SCOPE}`;
}

async function readTestCounts(sql) {
  await ensureSimulationSchema(sql);

  const [participantsRows, answersRows, bonusesRows, citiesRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS "count" FROM participants WHERE scope = ${TEST_SCOPE}`,
    sql`SELECT COUNT(*)::int AS "count" FROM answers WHERE scope = ${TEST_SCOPE}`,
    sql`SELECT COUNT(*)::int AS "count" FROM bonus_redemptions WHERE scope = ${TEST_SCOPE}`,
    sql`SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(city), ''), 'BEZ MIASTA'))::int AS "count" FROM participants WHERE scope = ${TEST_SCOPE}`
  ]);

  return {
    participants: Number(participantsRows[0]?.count || 0),
    answers: Number(answersRows[0]?.count || 0),
    bonuses: Number(bonusesRows[0]?.count || 0),
    cities: Number(citiesRows[0]?.count || 0)
  };
}

async function recomputeTestParticipantScores(sql) {
  await sql`
    UPDATE participants p
    SET
      score =
        COALESCE((
          SELECT COUNT(*)::int
          FROM answers a
          WHERE a.participant_id = p.id
            AND a.scope = ${TEST_SCOPE}
            AND a.correct = TRUE
        ), 0)
        + COALESCE((
          SELECT COUNT(*)::int
          FROM bonus_redemptions br
          WHERE br.participant_id = p.id
            AND br.scope = ${TEST_SCOPE}
        ), 0),
      answered_count = COALESCE((
        SELECT COUNT(*)::int
        FROM answers a
        WHERE a.participant_id = p.id
          AND a.scope = ${TEST_SCOPE}
      ), 0),
      last_activity = GREATEST(
        p.created_at,
        COALESCE((
          SELECT MAX(a.created_at)
          FROM answers a
          WHERE a.participant_id = p.id
            AND a.scope = ${TEST_SCOPE}
        ), p.created_at),
        COALESCE((
          SELECT MAX(br.created_at)
          FROM bonus_redemptions br
          WHERE br.participant_id = p.id
            AND br.scope = ${TEST_SCOPE}
        ), p.created_at)
      )
    WHERE p.scope = ${TEST_SCOPE}
  `;
}

async function materializeTestProgress(sql, options = {}) {
  await ensureSimulationSchema(sql);

  const gameRows = await sql`
    SELECT started_at, ended_at, duration_minutes
    FROM game_state
    WHERE scope = ${TEST_SCOPE}
    LIMIT 1
  `;
  const gameState = gameRows[0];

  if (!gameState?.started_at || gameState.ended_at) {
    return { insertedAnswers: 0, insertedBonuses: 0 };
  }

  const nowMs = Number(options.nowMs || Date.now());
  const startedAtMs = new Date(gameState.started_at).getTime();
  if (!Number.isFinite(startedAtMs)) {
    return { insertedAnswers: 0, insertedBonuses: 0 };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const durationMinutes = Number(gameState.duration_minutes || SIMULATION_DURATION_MINUTES);
  const gameSeconds = Math.max(60, durationMinutes * 60);

  const [participants, questions, bonuses, existingAnswers, existingBonuses] = await Promise.all([
    sql`
      SELECT id, email, created_at AS "createdAt"
      FROM participants
      WHERE scope = ${TEST_SCOPE}
      ORDER BY id ASC
    `,
    getQuestionCatalog(sql),
    getBonusCatalog(sql),
    sql`
      SELECT participant_id AS "participantId", question_id AS "questionId"
      FROM answers
      WHERE scope = ${TEST_SCOPE}
    `,
    sql`
      SELECT participant_id AS "participantId", bonus_id AS "bonusId"
      FROM bonus_redemptions
      WHERE scope = ${TEST_SCOPE}
    `
  ]);

  if (!participants.length || !questions.length) {
    return { insertedAnswers: 0, insertedBonuses: 0 };
  }

  const answerSet = new Set(existingAnswers.map((item) => `${item.participantId}:${item.questionId}`));
  const bonusSet = new Set(existingBonuses.map((item) => `${item.participantId}:${item.bonusId}`));
  const dueAnswers = [];
  const dueBonuses = [];

  participants.forEach((participant, fallbackIndex) => {
    const participantIndex = getParticipantIndex(participant, fallbackIndex);
    const answersTarget = getMaxAnswersForParticipant(participantIndex, questions.length);
    const bonusesTarget = getMaxBonusesForParticipant(participantIndex, bonuses.length);

    for (let answerIndex = 0; answerIndex < answersTarget; answerIndex += 1) {
      const question = questions[(participantIndex + answerIndex) % questions.length];
      if (!question?.id) continue;

      const key = `${participant.id}:${question.id}`;
      const offsetSeconds = getAnswerOffsetSeconds(participantIndex, answerIndex, gameSeconds);
      if (offsetSeconds > elapsedSeconds || answerSet.has(key)) continue;

      const correct = isCorrectAnswer(participantIndex, answerIndex);
      dueAnswers.push({
        participantId: participant.id,
        questionId: question.id,
        answer: correct ? (question.answers[0] || `ODPOWIEDZ ${question.id}`) : `TEST ${question.id}`,
        correct,
        createdAt: new Date(startedAtMs + offsetSeconds * 1000),
        openCreatedAt: new Date(startedAtMs + Math.max(1, offsetSeconds - 16) * 1000)
      });
    }

    for (let bonusIndex = 0; bonusIndex < bonusesTarget; bonusIndex += 1) {
      const bonus = bonuses[(participantIndex + bonusIndex) % bonuses.length];
      if (!bonus?.id) continue;

      const key = `${participant.id}:${bonus.id}`;
      const offsetSeconds = getBonusOffsetSeconds(participantIndex, bonusIndex, gameSeconds);
      if (offsetSeconds > elapsedSeconds || bonusSet.has(key)) continue;

      dueBonuses.push({
        participantId: participant.id,
        bonusId: bonus.id,
        createdAt: new Date(startedAtMs + offsetSeconds * 1000)
      });
    }
  });

  dueAnswers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  dueBonuses.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let insertedAnswers = 0;
  let insertedBonuses = 0;

  for (const answer of dueAnswers.slice(0, Number(options.maxAnswers || ANSWER_BATCH_LIMIT))) {
    await sql`
      INSERT INTO question_opens (scope, participant_id, question_id, created_at)
      VALUES (${TEST_SCOPE}, ${answer.participantId}, ${answer.questionId}, ${answer.openCreatedAt})
    `;

    await sql`
      INSERT INTO answers (scope, participant_id, question_id, answer, correct, created_at)
      VALUES (${TEST_SCOPE}, ${answer.participantId}, ${answer.questionId}, ${answer.answer}, ${answer.correct}, ${answer.createdAt})
      ON CONFLICT (participant_id, question_id) DO NOTHING
    `;
    insertedAnswers += 1;
  }

  for (const bonus of dueBonuses.slice(0, Number(options.maxBonuses || BONUS_BATCH_LIMIT))) {
    await sql`
      INSERT INTO bonus_redemptions (scope, participant_id, bonus_id, created_at)
      VALUES (${TEST_SCOPE}, ${bonus.participantId}, ${bonus.bonusId}, ${bonus.createdAt})
      ON CONFLICT (participant_id, bonus_id) DO NOTHING
    `;
    insertedBonuses += 1;
  }

  if (insertedAnswers || insertedBonuses) {
    await recomputeTestParticipantScores(sql);
  }

  return { insertedAnswers, insertedBonuses };
}

async function seedLargeTestSimulation(sql) {
  await ensureSimulationSchema(sql);

  const now = new Date();
  const startedAt = new Date(now.getTime() - SIMULATION_INITIAL_OFFSET_MS);
  await clearTestScope(sql);

  for (let index = 0; index < SIMULATION_PARTICIPANT_COUNT; index += 1) {
    const participant = getParticipantSeed(index);
    await sql`
      INSERT INTO participants (
        scope,
        first_name,
        last_name,
        city,
        email,
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
        0,
        0,
        ${startedAt},
        ${startedAt}
      )
    `;
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
      announcement_updated_at,
      results_participants_revealed_at,
      results_cities_revealed_at
    )
    VALUES (
      ${getScopeGameStateId(TEST_SCOPE)},
      ${TEST_SCOPE},
      ${startedAt},
      NULL,
      NULL,
      ${SIMULATION_DURATION_MINUTES},
      'Wielki test 300 uczestników jest aktywny. Tablica i panel pokazują symulację zapisaną w bazie.',
      ${now},
      NULL,
      NULL
    )
    ON CONFLICT (scope) DO UPDATE
    SET
      id = EXCLUDED.id,
      started_at = EXCLUDED.started_at,
      ended_at = NULL,
      summary_at = NULL,
      duration_minutes = EXCLUDED.duration_minutes,
      announcement_text = EXCLUDED.announcement_text,
      announcement_updated_at = EXCLUDED.announcement_updated_at,
      results_participants_revealed_at = NULL,
      results_cities_revealed_at = NULL
  `;

  await sql`
    UPDATE app_runtime
    SET
      admin_view_scope = ${TEST_SCOPE},
      test_mode_enabled = TRUE,
      test_seeded_at = NOW(),
      test_participant_count = ${SIMULATION_PARTICIPANT_COUNT}
    WHERE id = 1
  `;

  await materializeTestProgress(sql, {
    nowMs: now.getTime(),
    maxAnswers: 90,
    maxBonuses: 25
  });

  return readTestCounts(sql);
}

async function disableTestMode(sql) {
  await ensureSimulationSchema(sql);
  await sql`
    UPDATE app_runtime
    SET admin_view_scope = ${LIVE_SCOPE}, test_mode_enabled = FALSE
    WHERE id = 1
  `;
}

async function clearTestMode(sql) {
  await ensureSimulationSchema(sql);
  await clearTestScope(sql);
  await sql`
    UPDATE app_runtime
    SET
      admin_view_scope = ${LIVE_SCOPE},
      test_mode_enabled = FALSE,
      test_seeded_at = NULL,
      test_participant_count = 0
    WHERE id = 1
  `;
}

module.exports = {
  SIMULATION_PARTICIPANT_COUNT,
  clearTestMode,
  disableTestMode,
  materializeTestProgress,
  readTestCounts,
  seedLargeTestSimulation
};

const { QUESTIONS } = require('./questions-data');
const { ensureQuestionCatalogSchema } = require('./db-schema');

const MIN_QUESTION_COUNT = 1;
const DEFAULT_QUESTION_COUNT = QUESTIONS.length || 30;
const configuredQuestionLimit = Number.parseInt(process.env.MAX_QUESTION_COUNT || '300', 10);
const MAX_QUESTION_COUNT = Number.isFinite(configuredQuestionLimit)
  ? configuredQuestionLimit
  : 300;

function clampQuestionCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_QUESTION_COUNT;
  return Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, parsed));
}

function getFallbackQuestion(id) {
  const savedDefault = QUESTIONS.find(item => Number(item.id) === Number(id));
  if (savedDefault) {
    return {
      id: savedDefault.id,
      text: savedDefault.text,
      answers: [...savedDefault.answers],
      active: true
    };
  }

  return {
    id,
    text: `Pytanie ${id}`,
    answers: [],
    active: false
  };
}

function parseAnswers(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item || '').trim()).filter(Boolean);
      }
    } catch (_error) {
      // Pole admina przyjmuje tekst rozdzielony znakiem "/", średnikiem albo nową linią.
    }

    return trimmed
      .split(/\s*(?:\/|\n|;)\s*/g)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeQuestionRow(row) {
  return {
    id: Number(row.id),
    text: String(row.text || '').trim(),
    answers: parseAnswers(row.answers),
    active: row.active !== false
  };
}

function normalizeAnswer(value) {
  return String(value || '').toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function getQuestionCatalog(sql, options = {}) {
  await ensureQuestionCatalogSchema(sql);

  const rows = await sql`
    SELECT id, text, answers, active
    FROM questions_catalog
    WHERE id >= 1
    ORDER BY id ASC
  `;

  const rowMap = new Map(rows.map(row => [Number(row.id), normalizeQuestionRow(row)]));
  const highestSavedId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
  const highestDefaultId = QUESTIONS.reduce((max, question) => Math.max(max, Number(question.id) || 0), DEFAULT_QUESTION_COUNT);
  const catalogSize = Math.min(MAX_QUESTION_COUNT, Math.max(DEFAULT_QUESTION_COUNT, highestDefaultId, highestSavedId));
  const catalog = Array.from({ length: catalogSize }, (_, index) => {
    const id = index + 1;
    const fallback = getFallbackQuestion(id);
    const saved = rowMap.get(id);
    if (!saved || !saved.text || !saved.answers.length) {
      return {
        id,
        text: fallback.text,
        answers: [...fallback.answers],
        active: saved?.active !== false
      };
    }

    return saved;
  });

  return options.includeInactive ? catalog : catalog.filter(item => item.active);
}

async function getQuestionById(sql, id) {
  const questionId = Number(id);
  const catalog = await getQuestionCatalog(sql);
  return catalog.find(item => item.id === questionId) || null;
}

async function recalculateAllParticipantScores(sql) {
  await sql`
    UPDATE participants p
    SET
      score =
        COALESCE((
          SELECT COUNT(*)::int
          FROM answers a
          JOIN questions_catalog q ON q.id = a.question_id AND q.active = TRUE
          WHERE a.participant_id = p.id
            AND a.correct = TRUE
            AND a.scope = p.scope
        ), 0)
        + COALESCE((
          SELECT COUNT(*)::int
          FROM bonus_redemptions br
          WHERE br.participant_id = p.id
            AND br.scope = p.scope
        ), 0),
      answered_count = COALESCE((
        SELECT COUNT(*)::int
        FROM answers a
        JOIN questions_catalog q ON q.id = a.question_id AND q.active = TRUE
        WHERE a.participant_id = p.id
          AND a.scope = p.scope
      ), 0)
  `;
}

async function recalculateAnswersForQuestion(sql, question) {
  const acceptedAnswers = new Set(question.answers.map(normalizeAnswer));
  const rows = await sql`
    SELECT id, answer
    FROM answers
    WHERE question_id = ${question.id}
      AND participant_id IS NOT NULL
  `;

  for (const row of rows) {
    const nextCorrect = acceptedAnswers.has(normalizeAnswer(row.answer));
    await sql`
      UPDATE answers
      SET correct = ${nextCorrect}
      WHERE id = ${row.id}
    `;
  }
}

async function saveQuestionCatalog(sql, payload) {
  await ensureQuestionCatalogSchema(sql);

  const rawQuestions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.questions)
      ? payload.questions
      : [payload?.question || payload].filter(Boolean);
  const questionCount = clampQuestionCount(payload?.questionCount || rawQuestions.length || DEFAULT_QUESTION_COUNT);
  const activeIds = new Set(Array.from({ length: questionCount }, (_, index) => index + 1));

  const items = rawQuestions
    .map((item) => ({
      id: Number(item?.id),
      text: String(item?.text || '').trim(),
      answers: parseAnswers(item?.answers)
    }))
    .filter(item => item.id >= 1 && item.id <= MAX_QUESTION_COUNT && activeIds.has(item.id));

  if (!items.length) {
    throw new Error('Brak poprawnych pytań do zapisania.');
  }

  await sql`
    UPDATE questions_catalog
    SET active = id <= ${questionCount}, updated_at = NOW()
    WHERE id >= 1
  `;

  for (const item of items) {
    if (!item.text) {
      throw new Error(`Pytanie ${item.id} nie może być puste.`);
    }

    if (!item.answers.length) {
      throw new Error(`Pytanie ${item.id} musi mieć co najmniej jedną poprawną odpowiedź.`);
    }

    await sql`
      INSERT INTO questions_catalog (id, text, answers, active, updated_at)
      VALUES (${item.id}, ${item.text}, ${JSON.stringify(item.answers)}::jsonb, TRUE, NOW())
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        answers = EXCLUDED.answers,
        active = TRUE,
        updated_at = NOW()
    `;

    await recalculateAnswersForQuestion(sql, item);
  }

  await recalculateAllParticipantScores(sql);
  return getQuestionCatalog(sql);
}

module.exports = {
  MAX_QUESTION_COUNT,
  clampQuestionCount,
  getQuestionCatalog,
  getQuestionById,
  parseAnswers,
  recalculateAllParticipantScores,
  saveQuestionCatalog
};

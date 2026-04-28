const { QUESTIONS } = require('./questions-data');
const { ensureQuestionCatalogSchema } = require('./db-schema');

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
      // Admin fields accept plain text separated by "/" or new lines.
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
    answers: parseAnswers(row.answers)
  };
}

function normalizeAnswer(value) {
  return String(value || '').toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function recalculateAnswersForQuestion(sql, question) {
  const acceptedAnswers = new Set(question.answers.map(normalizeAnswer));
  const rows = await sql`
    SELECT id, participant_id AS "participantId", answer
    FROM answers
    WHERE question_id = ${question.id}
      AND participant_id IS NOT NULL
  `;
  const participantIds = new Set();

  for (const row of rows) {
    const nextCorrect = acceptedAnswers.has(normalizeAnswer(row.answer));
    await sql`
      UPDATE answers
      SET correct = ${nextCorrect}
      WHERE id = ${row.id}
    `;
    participantIds.add(Number(row.participantId));
  }

  for (const participantId of participantIds) {
    await sql`
      UPDATE participants
      SET
        score =
          COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${participantId} AND correct = TRUE), 0)
          + COALESCE((SELECT COUNT(*)::int FROM bonus_redemptions WHERE participant_id = ${participantId}), 0),
        answered_count = COALESCE((SELECT COUNT(*)::int FROM answers WHERE participant_id = ${participantId}), 0),
        last_activity = NOW()
      WHERE id = ${participantId}
    `;
  }
}

async function getQuestionCatalog(sql) {
  await ensureQuestionCatalogSchema(sql);

  const rows = await sql`
    SELECT id, text, answers
    FROM questions_catalog
    WHERE id BETWEEN 1 AND 30
    ORDER BY id ASC
  `;

  const rowMap = new Map(rows.map(row => [Number(row.id), normalizeQuestionRow(row)]));

  return QUESTIONS.map((fallback) => {
    const saved = rowMap.get(fallback.id);
    if (!saved || !saved.text || !saved.answers.length) {
      return {
        id: fallback.id,
        text: fallback.text,
        answers: [...fallback.answers]
      };
    }

    return saved;
  });
}

async function getQuestionById(sql, id) {
  const questionId = Number(id);
  const catalog = await getQuestionCatalog(sql);
  return catalog.find(item => item.id === questionId) || null;
}

async function saveQuestionCatalog(sql, questions) {
  await ensureQuestionCatalogSchema(sql);

  const items = (Array.isArray(questions) ? questions : [questions])
    .map((item) => ({
      id: Number(item?.id),
      text: String(item?.text || '').trim(),
      answers: parseAnswers(item?.answers)
    }))
    .filter(item => item.id >= 1 && item.id <= 30);

  if (!items.length) {
    throw new Error('Brak poprawnych pytań do zapisania.');
  }

  for (const item of items) {
    if (!item.text) {
      throw new Error(`Pytanie ${item.id} nie może być puste.`);
    }

    if (!item.answers.length) {
      throw new Error(`Pytanie ${item.id} musi mieć co najmniej jedną poprawną odpowiedź.`);
    }

    await sql`
      INSERT INTO questions_catalog (id, text, answers, updated_at)
      VALUES (${item.id}, ${item.text}, ${JSON.stringify(item.answers)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        answers = EXCLUDED.answers,
        updated_at = NOW()
    `;

    await recalculateAnswersForQuestion(sql, item);
  }

  return getQuestionCatalog(sql);
}

module.exports = {
  getQuestionCatalog,
  getQuestionById,
  parseAnswers,
  saveQuestionCatalog
};

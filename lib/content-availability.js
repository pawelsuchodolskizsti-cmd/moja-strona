const { transaction } = require('./transactions');
const { json } = require('./api-guard');

function blockedResponse(kind) {
  return json(423, {
    contentBlocked: true,
    error: kind === 'question'
      ? 'To pytanie jest chwilowo wyłączone z powodu problemu technicznego. Zeskanuj inny kod QR i wróć tutaj później.'
      : 'Ten bonus jest chwilowo wyłączony z powodu problemu technicznego. Zeskanuj inny kod QR i wróć tutaj później.'
  });
}

async function checkContentBlocked(sql, kind, id) {
  const rows = kind === 'question'
    ? await sql`SELECT technical_blocked FROM questions_catalog WHERE id=${id}`
    : await sql`SELECT technical_blocked FROM bonus_catalog WHERE id=${id}`;
  return rows[0]?.technical_blocked ? blockedResponse(kind) : null;
}

async function setContentBlocked(sql, body) {
  const { kind, id, blocked, expectedBlocked } = body;
  if (!['question', 'bonus'].includes(kind) || typeof blocked !== 'boolean' || typeof expectedBlocked !== 'boolean'
    || (kind === 'question' ? !Number.isSafeInteger(id) || id < 1 : typeof id !== 'string' || !id.trim() || id.length > 64)) {
    return json(400, { error: 'Nieprawidłowe dane blokady.' });
  }
  const query = kind === 'question'
    ? sql`UPDATE questions_catalog SET technical_blocked=${blocked}, updated_at=NOW()
        WHERE id=${id} AND active=TRUE AND technical_blocked=${expectedBlocked} RETURNING id`
    : sql`UPDATE bonus_catalog SET technical_blocked=${blocked}, updated_at=NOW()
        WHERE id=${id} AND active=TRUE AND technical_blocked=${expectedBlocked} RETURNING id`;
  // Serialize against answer/bonus writes, so a confirmed block stops further submissions.
  const queries = [query];
  if (kind === 'question' && blocked) queries.push(sql`
    UPDATE participants SET current_question_id=NULL, current_question_opened_at=NULL
    WHERE current_question_id=${id}
      AND EXISTS(SELECT 1 FROM questions_catalog WHERE id=${id} AND technical_blocked=TRUE)`);
  const [changed] = await transaction(sql, queries, { exclusive: true });
  if (!changed.length) return json(409, { error: 'Stan kodu zmienił się. Odśwież listę i sprawdź jego aktualną dostępność.' });
  return null;
}

module.exports = { checkContentBlocked, setContentBlocked };

const { BONUS_CODES } = require('./bonus-codes-data');
const { ensureBonusCatalogSchema } = require('./db-schema');

function normalizeBonusRow(row) {
  return {
    id: String(row.id || '').trim(),
    label: String(row.label || row.id || '').trim(),
    secret: String(row.secret || '').trim(),
    technicalBlocked: row.technical_blocked === true,
    active: row.active !== false,
    sortOrder: Number(row.sort_order || row.sortOrder || 0)
  };
}

async function getBonusCatalog(sql, options = {}) {
  await ensureBonusCatalogSchema(sql);

  const rows = await sql`
    SELECT id, label, secret, active, sort_order, technical_blocked
    FROM bonus_catalog
    ORDER BY sort_order ASC, id ASC
  `;

  const rowMap = new Map(rows.map(row => [String(row.id), normalizeBonusRow(row)]));
  const catalog = BONUS_CODES.map((fallback, index) => {
    const saved = rowMap.get(fallback.id);
    if (!saved || !saved.secret) {
      return {
        id: fallback.id,
        label: fallback.label,
        secret: fallback.secret,
        technicalBlocked: saved?.technicalBlocked === true,
        active: saved?.active !== false,
        sortOrder: index + 1
      };
    }

    return saved;
  });

  return options.includeInactive ? catalog : catalog.filter(item => item.active);
}

async function getBonusById(sql, id) {
  const bonusId = String(id || '').trim();
  const catalog = await getBonusCatalog(sql);
  return catalog.find(item => item.id === bonusId) || null;
}

async function saveBonusCatalog(sql, bonuses) { await require('./catalog-write').saveCatalog(sql,{bonuses});return getBonusCatalog(sql); }

module.exports = {
  getBonusCatalog,
  getBonusById,
  saveBonusCatalog
};

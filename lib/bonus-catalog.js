const { BONUS_CODES } = require('./bonus-codes-data');
const { ensureBonusCatalogSchema } = require('./db-schema');

function normalizeBonusRow(row) {
  return {
    id: String(row.id || '').trim(),
    label: String(row.label || row.id || '').trim(),
    secret: String(row.secret || '').trim(),
    active: row.active !== false,
    sortOrder: Number(row.sort_order || row.sortOrder || 0)
  };
}

async function getBonusCatalog(sql, options = {}) {
  await ensureBonusCatalogSchema(sql);

  const rows = await sql`
    SELECT id, label, secret, active, sort_order
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

async function saveBonusCatalog(sql, bonuses) {
  await ensureBonusCatalogSchema(sql);

  const items = (Array.isArray(bonuses) ? bonuses : [bonuses])
    .map((item, index) => ({
      id: String(item?.id || '').trim(),
      label: String(item?.label || item?.id || '').trim(),
      secret: String(item?.secret || '').trim(),
      active: item?.active !== false,
      sortOrder: Number(item?.sortOrder || index + 1)
    }))
    .filter(item => item.id);

  if (!items.length) {
    throw new Error('Brak poprawnych bonusów do zapisania.');
  }

  for (const item of items) {
    if (!item.label) {
      throw new Error(`Bonus ${item.id} musi mieć nazwę.`);
    }

    if (!item.secret) {
      throw new Error(`Bonus ${item.id} musi mieć hasło.`);
    }

    await sql`
      INSERT INTO bonus_catalog (id, label, secret, active, sort_order, updated_at)
      VALUES (${item.id}, ${item.label}, ${item.secret}, ${item.active}, ${item.sortOrder}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        secret = EXCLUDED.secret,
        active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    `;
  }

  return getBonusCatalog(sql);
}

module.exports = {
  getBonusCatalog,
  getBonusById,
  saveBonusCatalog
};

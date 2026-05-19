window.QR_LABELS = {
  home: 'Strona g\u0142\u00f3wna',
  scoreboard: 'Tablica wynik\u00f3w'
};

window.buildQrCatalog = function buildQrCatalog(origin, options = {}) {
  const baseOrigin = String(origin || window.location.origin || '').replace(/\/+$/, '');
  const questionCatalog = Array.isArray(options.questionCatalog) ? options.questionCatalog : [];
  const bonusCatalog = Array.isArray(options.bonusCatalog) ? options.bonusCatalog : [];
  const questionCount = Number(options.questionCount || questionCatalog.length || 30);
  const bonusItems = bonusCatalog.length
    ? bonusCatalog
    : Array.from({ length: Number(options.bonusCount || 10) }, (_, index) => {
      const id = `B${String(index + 1).padStart(2, '0')}`;
      return { id, label: `Bonus ${index + 1}` };
    });
  const items = [
    {
      id: 'home',
      type: 'screen',
      label: 'Strona g\u0142\u00f3wna',
      shortLabel: 'Start',
      description: 'Ekran startowy i logowanie uczestnik\u00f3w.',
      path: '/',
      url: `${baseOrigin}/`
    },
    {
      id: 'scoreboard',
      type: 'screen',
      label: 'Tablica wynik\u00f3w',
      shortLabel: 'Wyniki',
      description: 'Publiczny ekran rankingowy do TV lub projektora.',
      path: '/wyniki/',
      url: `${baseOrigin}/wyniki/`
    }
  ];

  for (let i = 1; i <= questionCount; i += 1) {
    const question = questionCatalog.find((item) => Number(item.id) === i);
    items.push({
      id: `question-${i}`,
      type: 'question',
      label: `Pytanie ${i}`,
      shortLabel: `Pyt. ${i}`,
      description: question?.text || `Kod QR otwieraj\u0105cy pytanie numer ${i}.`,
      path: `/?q=${i}`,
      url: `${baseOrigin}/?q=${i}`
    });
  }

  bonusItems.forEach((bonus, index) => {
    const bonusId = bonus.id || `B${String(index + 1).padStart(2, '0')}`;
    items.push({
      id: `bonus-${bonusId}`,
      type: 'bonus',
      label: bonus.label || `Bonus ${index + 1}`,
      shortLabel: bonusId,
      description: `Kod QR otwieraj\u0105cy bonus ${bonusId}.`,
      path: `/bonus/?b=${bonusId}`,
      url: `${baseOrigin}/bonus/?b=${bonusId}`
    });
  });

  return items;
};

window.groupQrCatalog = function groupQrCatalog(origin, options = {}) {
  const items = window.buildQrCatalog(origin, options);
  return {
    screens: items.filter((item) => item.type === 'screen'),
    questions: items.filter((item) => item.type === 'question'),
    bonuses: items.filter((item) => item.type === 'bonus'),
    all: items
  };
};

window.QR_LABELS = {
  home: 'Strona g\u0142\u00f3wna',
  scoreboard: 'Tablica wynik\u00f3w'
};

window.buildQrCatalog = function buildQrCatalog(origin) {
  const baseOrigin = String(origin || window.location.origin || '').replace(/\/+$/, '');
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

  for (let i = 1; i <= 30; i += 1) {
    items.push({
      id: `question-${i}`,
      type: 'question',
      label: `Pytanie ${i}`,
      shortLabel: `Pyt. ${i}`,
      description: `Kod QR otwieraj\u0105cy pytanie numer ${i}.`,
      path: `/?q=${i}`,
      url: `${baseOrigin}/?q=${i}`
    });
  }

  for (let i = 1; i <= 10; i += 1) {
    const bonusId = `B${String(i).padStart(2, '0')}`;
    items.push({
      id: `bonus-${bonusId}`,
      type: 'bonus',
      label: `Bonus ${i}`,
      shortLabel: bonusId,
      description: `Kod QR otwieraj\u0105cy bonus ${bonusId}.`,
      path: `/bonus/?b=${bonusId}`,
      url: `${baseOrigin}/bonus/?b=${bonusId}`
    });
  }

  return items;
};

window.groupQrCatalog = function groupQrCatalog(origin) {
  const items = window.buildQrCatalog(origin);
  return {
    screens: items.filter((item) => item.type === 'screen'),
    questions: items.filter((item) => item.type === 'question'),
    bonuses: items.filter((item) => item.type === 'bonus'),
    all: items
  };
};

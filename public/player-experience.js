/* Shared onboarding and milestones for both QR entry points. No score is stored here. */
window.PlayerExperience = (() => {
  const steps = [
    ['QR', 'Skanuj i zbieraj punkty', 'Szukaj kodów QR na trasie. Każdy kod otwiera pytanie. Poprawna odpowiedź to 1 punkt. Masz jedną próbę - przeczytaj pytanie uważnie.'],
    ['+1', 'Odkrywaj bonusy', 'Wypatruj bonusowych kodów QR i rozmawiaj z wolontariuszami. Zeskanuj kod i wpisz hasło do bonusu. Każdy bonus daje 1 dodatkowy punkt i można odebrać go tylko raz.'],
    ['3 h', 'Graj przez 3 godziny', 'Wspólna runda trwa 3 godziny od startu organizatora. Odliczanie znajdziesz na ekranie głównym, przy każdym pytaniu i bonusie. Dołączając później, korzystasz z pozostałego czasu. Gotowy?']
  ];
  const definitions = [
    {id:'first-clue', icon:'1', tone:'blue', name:'Pierwszy Trop', text:'Pierwszy kod za Tobą. Gra właśnie nabrała tempa.', field:'answers', goal:1},
    {id:'spark-hunter', icon:'+', tone:'lime', name:'Łowca Iskier', text:'Masz bonus. Złapałeś dodatkową okazję na trasie.', field:'bonuses', goal:1},
    {id:'volunteer-talker', icon:'W', tone:'gold', name:'Rozmówca Wolontariuszy', text:'Dwa bonusy za Tobą. Rozmawiaj i odkrywaj dalej!', field:'bonuses', goal:2},
    {id:'quiet-star', icon:'★', tone:'blue', name:'Cicha Gwiazda', text:'Już 8 odpowiedzi! Twój postęp naprawdę widać.', field:'answers', goal:8},
    {id:'unstoppable', icon:'N', tone:'gold', name:'Nie do zatrzymania', text:'Masz dwucyfrowy wynik odpowiedzi. To już konkretna seria.', field:'answers', goal:10},
    {id:'final-sprinter', icon:'S', tone:'lime', name:'Finałowy Sprinter', text:'Jesteś z nami w ostatnich 15 minutach gry.'}
  ];
  let instructionScope = '', step = 0, toastBusy = false;
  const queue = [], pending = new Set();
  function saved() { try { const value = JSON.parse(storageGet('playerExperience', 'null')); return value?.scope === scope() ? value : {scope:scope(), values:{}}; } catch (_) { return {scope:scope(), values:{}}; } }
  function shortKey(key) { return key.replace(scope(), 'player'); }
  function read(key) { return saved().values[shortKey(key)] || null; }
  function write(key, value) { const data = saved(); data.values[shortKey(key)] = value; const text = JSON.stringify(data); if (storageGet('playerExperience', '') !== text) storageSet('playerExperience', text); }
  function scope() { return participantId ? `${participantId}:${storageGet('participantGameStartedAt', '')}` : ''; }
  function instruction(show, resume) {
    const key = scope();
    if (!key || read(`instructions:${key}`)) return false;
    if (instructionScope !== key) { instructionScope = key; step = 0; }
    const root = document.getElementById('instruction-screen');
    const render = (focus = false) => {
      root.querySelector('[data-instruction-step]').textContent = `Krok ${step + 1} z ${steps.length}`;
      root.querySelector('[data-instruction-icon]').textContent = steps[step][0];
      root.querySelector('[data-instruction-title]').textContent = steps[step][1];
      root.querySelector('[data-instruction-copy]').textContent = steps[step][2];
      root.querySelectorAll('[data-instruction-dot]').forEach((dot, i) => dot.classList.toggle('active', i <= step));
      const back = root.querySelector('[data-instruction-back]');
      back.hidden = step === 0;
      back.onclick = () => { step--; render(true); };
      const next = root.querySelector('[data-instruction-next]');
      next.textContent = step === steps.length - 1 ? 'Start' : 'Dalej';
      next.onclick = async () => {
        if (step < steps.length - 1) { step++; render(true); return; }
        write(`instructions:${key}`, true);
        next.disabled = true;
        try { await resume(); } finally { next.disabled = false; }
      };
      if (focus) root.querySelector('[data-instruction-title]').focus({preventScroll:true});
    };
    render();
    show('instruction-screen');
    return true;
  }
  function enqueue(render, message, type, title, key) {
    const player = scope();
    // Round-scoped notices survive navigation between question and bonus QR pages.
    const savedKey = player && /^(badge-|warning-|bonus-count-)/.test(key) ? `notice:${player}:${key}` : '';
    if (savedKey && (read(savedKey) || pending.has(savedKey))) return;
    if (savedKey) pending.add(savedKey);
    queue.push(() => {
      pending.delete(savedKey);
      if (player && player !== scope()) return;
      if (savedKey) write(savedKey, true);
      render(message, type, title, key ? `${player}:${key}` : '');
    });
    drain();
  }
  function drain() {
    if (toastBusy || !queue.length) return;
    toastBusy = true;
    queue.shift()();
    setTimeout(() => { toastBusy = false; drain(); }, 3500);
  }
  function renderProgress(stats, ready, remaining, active, notify) {
    const key = scope();
    const savedKey = `milestones:${key}`;
    const previous = key ? read(savedKey) : null;
    const current = definitions.filter(b => b.field ? Number(stats[b.field] || 0) >= b.goal :
      (previous?.ids?.includes(b.id) || (active && remaining > 0 && remaining <= 900000 && stats.answers >= 1)));
    if (key && ready) {
      if (previous) current.forEach(b => notify(b.text, 'badge', `Nowa odznaka: ${b.name}`, `badge-${b.id}`));
      else current.forEach(b => write(`notice:${key}:badge-${b.id}`, true));
      write(savedKey, {ids:current.map(b => b.id)});
    }
    const next = definitions.find(b => b.field && !current.includes(b));
    document.querySelectorAll('[data-badge-list]').forEach(list => {
      const html = `${next ? `<div class="milestone-next"><strong>Następny kamień milowy: ${next.name}</strong><span>${Math.min(Number(stats[next.field] || 0), next.goal)} / ${next.goal} ${next.field === 'answers' ? 'odpowiedzi' : 'bonusów'}</span><progress value="${Math.min(Number(stats[next.field] || 0), next.goal)}" max="${next.goal}" aria-label="Postęp: ${next.name}"></progress></div>` : '<div class="milestone-next">Wszystkie kamienie milowe zdobyte. Zbieraj kolejne punkty!</div>'}
        ${current.map(b => `<div class="badge-chip ${b.tone}"><div class="badge-chip-icon">${b.icon}</div><div><div class="badge-chip-name">${b.name}</div><div class="badge-chip-text">${b.text}</div></div></div>`).join('')}`;
      if (list.innerHTML !== html) list.innerHTML = html;
    });
  }
  return {instruction, enqueue, renderProgress};
})();

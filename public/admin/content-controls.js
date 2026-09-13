window.ContentControls = (() => {
  let root, list, status, summary, search, filter, reload, busy = false, loading = false, items = [];
  const key = item => `${item.kind}:${item.id}`;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function render() {
    const focusKey = document.activeElement?.dataset.contentKey;
    list.replaceChildren();
    const blockedCount = items.filter(item => item.technicalBlocked).length;
    summary.textContent = `Zablokowane kody: ${blockedCount} z ${items.length}`;
    const query = search.value.trim().toLocaleLowerCase('pl');
    const visible = items.filter(item => (filter.value !== 'blocked' || item.technicalBlocked)
      && (filter.value !== 'question' && filter.value !== 'bonus' || item.kind === filter.value)
      && `${item.title} ${item.text}`.toLocaleLowerCase('pl').includes(query));
    for (const item of visible) {
      const row = document.createElement('article'); row.className = 'content-control-row';
      row.dataset.blocked = String(item.technicalBlocked);
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.title;
      const description = document.createElement('p'); description.textContent = item.text;
      const badge = document.createElement('span'); badge.className = 'content-control-status';
      badge.textContent = item.technicalBlocked ? 'Blokada techniczna' : 'Dostępny';
      copy.append(title, description, badge);
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'btn outline'; button.dataset.contentKey = key(item);
      button.textContent = item.technicalBlocked ? 'Odblokuj' : 'Zablokuj';
      button.setAttribute('aria-label', `${button.textContent}: ${item.title}`);
      button.disabled = busy; button.onclick = () => change(item);
      row.append(copy, button); list.append(row);
    }
    if (!visible.length) { const empty = document.createElement('p'); empty.textContent = 'Brak kodów dla wybranych filtrów.'; list.append(empty); }
    if (focusKey) [...list.querySelectorAll('button')].find(button => button.dataset.contentKey === focusKey)?.focus({preventScroll:true});
  }
  function receive(data) {
    items = [
      ...(data.questionCatalog || []).map(item => ({...item, kind:'question', title:`Pytanie ${item.id}`})),
      ...(data.bonusCatalog || []).map(item => ({...item, kind:'bonus', title:`Bonus ${item.id}`, text:item.label}))
    ];
    render();
  }
  async function refresh() {
    if (!root || busy || loading) return;
    loading = true; reload.disabled = true;
    try {
      const response = await AdminSession.fetch('/api/admin-question-catalog', {cache:'no-store'});
      const data = await response.json();
      if (!response.ok || data.error) throw Error(data.error || 'Nie udało się odczytać dostępności kodów.');
      receive(data); message('Lista jest aktualna.');
    } catch (error) { message(error.message, true); }
    finally { loading = false; reload.disabled = false; }
  }
  async function change(item) {
    if (busy || loading) return;
    busy = true; reload.disabled = true; render();
    message('Zapisywanie zmiany…');
    try {
      const response = await AdminSession.fetch('/api/admin-question-catalog', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'technical-block',kind:item.kind,id:item.id,blocked:!item.technicalBlocked,expectedBlocked:item.technicalBlocked})
      });
      const data = await response.json();
      if (!response.ok || data.error) throw Error(data.error || 'Nie udało się zmienić dostępności. Odśwież listę.');
      receive(data);
      message(`${item.title}: ${item.technicalBlocked ? 'odblokowano kod.' : 'włączono blokadę techniczną.'} Dotychczasowe punkty pozostają zapisane.`);
    } catch (error) { message(`${error.message} Użyj „Odśwież listę”, aby sprawdzić stan.`, true); }
    finally { busy = false; reload.disabled = false; render(); }
  }
  function init(panel) {
    root = panel;
    root.innerHTML = `<section class="ops-card content-controls">
      <div class="ops-title">Dostępność pytań i bonusów</div>
      <p class="ops-copy">Blokada dotyczy wskazanego kodu QR. Nie odbiera zdobytych punktów ani nie zużywa próby odpowiedzi. Pozostałe kody i odliczanie działają dalej. Po naprawie kliknij „Odblokuj”.</p>
      <p class="ops-copy">To ustawienie wspólnego katalogu — obowiązuje w grze LIVE także wtedy, gdy przeglądasz dane TEST. Blokady pozostają włączone do ręcznego odblokowania.</p>
      <div class="content-control-toolbar">
        <label>Szukaj kodu<input id="content-block-search" class="auth-input" type="search" placeholder="Numer pytania lub nazwa bonusu"></label>
        <label>Pokaż<select id="content-block-filter" class="auth-input"><option value="all">Wszystkie kody</option><option value="blocked">Tylko zablokowane</option><option value="question">Pytania</option><option value="bonus">Bonusy</option></select></label>
        <button type="button" id="content-block-reload" class="btn outline">Odśwież listę</button>
      </div>
      <p id="content-block-summary"></p>
      <p id="content-block-feedback" role="status" aria-live="polite"></p>
      <div id="content-block-list"></div>
    </section>`;
    list = root.querySelector('#content-block-list'); status = root.querySelector('#content-block-feedback');
    summary = root.querySelector('#content-block-summary'); search = root.querySelector('#content-block-search');
    filter = root.querySelector('#content-block-filter'); reload = root.querySelector('#content-block-reload');
    search.oninput = render; filter.onchange = render; reload.onclick = refresh;
  }
  return {init, refresh};
})();

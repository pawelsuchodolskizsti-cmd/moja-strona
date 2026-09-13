(() => {
  const admin = document.body.dataset.volunteerMode === 'admin';
  const endpoint = admin ? '/api/admin-volunteers' : '/api/volunteer-tickets';
  const $ = id => document.getElementById(id);
  const statuses = {open:'Nowe',progress:'W trakcie',resolved:'Rozwiązane'};
  let user = null, catalog = null, selected = null, cursor = null, messageCursor;
  let listVersion = 0, messageRows = [], messageSignature = '', mutations = 0, listBusy = false;
  const operationKeys = new WeakMap();
  function node(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function feedback(id, message = '', error = false) { $(id).textContent = message; $(id).className = error ? 'error' : 'success'; }
  function date(value) { return new Date(value).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  function showLogin(message = '') {
    user = null; selected = null; messageRows = []; listVersion++;
    $('desk-shell').hidden = true; $('volunteer-login').hidden = false; $('volunteer-logout').hidden = true;
    $('ticket-list').replaceChildren(); $('ticket-thread-post').replaceChildren(); $('ticket-messages').replaceChildren();
    feedback('volunteer-login-message',message,!!message); ViewLoading.finish();
  }
  async function request(url, payload) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),15000);
    try {
      const options = {credentials:'same-origin',cache:'no-store',signal:controller.signal};
      if (payload) Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const response = await (admin ? AdminSession.fetch(url,options) : fetch(url,options));
      let data; try { data = await response.json(); } catch { throw Error('Serwer jest chwilowo niedostępny. Spróbuj ponownie.'); }
      if (response.status === 401 && url !== '/api/volunteer-session') {
        if (admin) AdminSession.redirect(); else showLogin('Sesja wygasła. Zaloguj się ponownie.');
      }
      if (!response.ok) throw Error(data.error || 'Nie udało się zapisać zmian.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw Error('Nie udało się połączyć. Spróbuj ponownie — treść pozostaje w formularzu.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function operation(form, payload) {
    const signature = JSON.stringify(payload), previous = operationKeys.get(form);
    const key = previous?.signature === signature ? previous.key : (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    operationKeys.set(form,{signature,key}); return {...payload,requestId:key};
  }
  function bindForm(id, messageId, action) {
    const form = $(id); if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (form.dataset.busy) return;
      form.dataset.busy = 'true'; mutations++; feedback(messageId);
      const controls = [...form.querySelectorAll('input,select,textarea,button')]; controls.forEach(e => e.disabled = true);
      try { await action(form); }
      catch (error) { feedback(messageId,error.message,true); }
      finally { controls.forEach(e => e.disabled = false); delete form.dataset.busy; mutations--; }
    });
  }
  function targetOptions() {
    const type = $('ticket-target-type').value, select = $('ticket-target-id');
    $('ticket-target-label').hidden = type === 'general'; select.required = type !== 'general'; select.replaceChildren();
    if (type === 'general') return;
    select.append(new Option(type === 'question' ? 'Wybierz pytanie' : 'Wybierz bonus',''));
    for (const item of catalog[type === 'question' ? 'questions' : 'bonuses']) {
      const option = new Option(item.label + (item.technicalBlocked ? ' — blokada techniczna' : !item.active ? ' — nieaktywny' : ''),item.id);
      select.append(option);
    }
  }
  function bonusFilter() {
    if (!admin) return;
    const select = $('ticket-bonus-filter'), value = select.value; select.replaceChildren(new Option('Wszystkie punkty',''));
    for (const bonus of catalog.bonuses) {
      const account = catalog.accounts.find(a => a.bonusId === bonus.id);
      select.append(new Option(bonus.label+(account ? ' · '+account.name : ''),bonus.id));
    }
    select.value = value;
  }
  function renderAccounts() {
    const root = $('volunteer-account-list'); root.replaceChildren();
    for (const bonus of catalog.bonuses) {
      let account = catalog.accounts.find(a => a.bonusId === bonus.id) || {bonusId:bonus.id,name:'',enabled:true,revision:0};
      const form = node('form',undefined,'volunteer-account'); form.dataset.bonusId = bonus.id;
      const label = node('label','Imię — hasło wolontariusza'), input = node('input'); input.value = account.name; input.maxLength = 80; input.required = true; input.autocomplete = 'off'; label.append(input);
      const enabledLabel = node('label',undefined,'account-enabled'), enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = account.enabled; enabledLabel.append(enabled,node('span','Dostęp aktywny'));
      const button = node('button',account.revision ? 'Zapisz' : 'Przypisz'); button.type = 'submit';
      const message = node('p'); message.setAttribute('role','status');
      form.append(node('div',bonus.label,'account-title'),label,enabledLabel,button,message); root.append(form);
      form.onsubmit = async event => {
        event.preventDefault(); if (button.disabled) return; mutations++; button.disabled = true; input.disabled = true; enabled.disabled = true;
        try {
          const data = await request(endpoint,{action:'account',bonusId:bonus.id,name:input.value,enabled:enabled.checked,revision:account.revision});
          account = data.account; catalog.accounts = catalog.accounts.filter(a => a.bonusId!==bonus.id).concat(account);
          input.value = account.name; button.textContent = 'Zapisz'; message.textContent = 'Zapisano przypisanie'; message.className = 'success'; bonusFilter();
        } catch (error) { message.textContent = error.message; message.className = 'error'; }
        finally { mutations--; button.disabled = false; input.disabled = false; enabled.disabled = false; }
      };
    }
  }
  function postCard(ticket, full = false) {
    const article = node('article',undefined,'ticket-card'), meta = node('div',undefined,'ticket-meta');
    meta.append(node('span',statuses[ticket.status],`ticket-badge ${ticket.status}`),node('span',ticket.kind==='issue'?'Usterka techniczna':'Pytanie'),node('span',`#${ticket.id} · ${ticket.bonusId} · ${ticket.authorName}`),node('span',date(ticket.createdAt)));
    const body = full || ticket.body.length<=240 ? ticket.body : ticket.body.slice(0,240)+'…';
    article.append(meta,node(full?'h2':'h3',ticket.title),node('span',ticket.targetLabel,'ticket-target'),node('p',body,'ticket-body'));
    if (!full) {
      const footer = node('div',undefined,'ticket-card-footer'), link = node('button','Otwórz rozmowę','secondary'); link.type = 'button'; link.dataset.ticketId = ticket.id;
      link.onclick = () => openThread(ticket.id); footer.append(node('span',`Odpowiedzi: ${ticket.replyCount} · aktualizacja ${date(ticket.updatedAt)}`),link); article.append(footer);
    }
    return article;
  }
  async function loadList(append = false) {
    if (append && (listBusy || !cursor)) return;
    const version = ++listVersion; listBusy = true;
    const params = new URLSearchParams({status:$('ticket-status-filter').value,search:$('ticket-search').value});
    if (admin) params.set('bonusId',$('ticket-bonus-filter').value);
    if (append) params.set('before',cursor);
    try {
      const data = await request(endpoint+'?'+params);
      if (version !== listVersion || selected || !user) return;
      if (!append) $('ticket-list').replaceChildren();
      $('ticket-list').querySelector('.desk-empty')?.remove();
      for (const ticket of data.tickets) $('ticket-list').append(postCard(ticket));
      if (!$('ticket-list').children.length) $('ticket-list').append(node('p','Brak zgłoszeń w tym widoku.','desk-empty'));
      cursor = data.before; $('ticket-more').hidden = !cursor;
    } finally { if (version===listVersion) listBusy = false; }
  }
  async function loadThread(older = false) {
    const ticketId = selected; if (!ticketId) return;
    const params = new URLSearchParams({id:ticketId}); if (older && messageCursor) params.set('before',messageCursor);
    const data = await request(endpoint+'?'+params);
    if (selected !== ticketId || !user) return;
    $('ticket-thread-post').replaceChildren(postCard(data.ticket,true));
    if (admin && document.activeElement !== $('ticket-status')) $('ticket-status').value = data.ticket.status;
    const rows = new Map(messageRows.map(m => [m.id,m])); data.messages.forEach(m => rows.set(m.id,m)); messageRows = [...rows.values()].sort((a,b)=>a.id-b.id);
    if (older || messageCursor === undefined) messageCursor = data.before;
    $('message-more').hidden = !messageCursor;
    const signature = JSON.stringify(messageRows);
    if (signature !== messageSignature) {
      messageSignature = signature; $('ticket-messages').replaceChildren();
      for (const item of messageRows) {
        const message = node('article',undefined,`thread-message ${item.authorRole}`);
        message.append(node('strong',item.authorRole==='admin' ? 'Organizator' : item.authorName),node('small',' · '+date(item.createdAt)),node('p',item.body)); $('ticket-messages').append(message);
      }
    }
    if (!messageRows.length) $('ticket-messages').replaceChildren(node('p','Tutaj pojawią się odpowiedzi.','desk-empty'));
  }
  async function openThread(ticketId, history = true) {
    selected = Number(ticketId); listVersion++; listBusy = false; messageRows = []; messageCursor = undefined; messageSignature = '';
    $('desk-list-view').hidden = true; $('ticket-thread').hidden = false; $('ticket-thread-post').replaceChildren(node('p','Wczytujemy zgłoszenie…'));
    $('ticket-messages').replaceChildren(); $('ticket-reply').value = ''; feedback('ticket-reply-message');
    if (history) window.history.pushState(null,'','#zgloszenie-'+selected);
    try { await loadThread(); }
    catch (error) { feedback('desk-feedback',error.message,true); $('ticket-thread-post').replaceChildren(node('p',error.message,'desk-empty')); }
  }
  async function openList(history = true) {
    selected = null; $('desk-list-view').hidden = false; $('ticket-thread').hidden = true;
    if (history) window.history.pushState(null,'',location.pathname+location.search);
    try { await loadList(); } catch (error) { feedback('desk-feedback',error.message,true); }
  }
  async function start() {
    catalog = await request(endpoint+'?view=catalog');
    if (admin) { AdminNavigation.mountAux('volunteers'); renderAccounts(); bonusFilter(); }
    else { targetOptions(); $('volunteer-logout').hidden = false; }
    $('desk-identity').textContent = admin ? 'Kontakt z wolontariuszami · zgłoszenia z rzeczywistej gry' : `${user.name} · punkt ${user.bonusId}`;
    $('volunteer-login').hidden = true; $('desk-shell').hidden = false;
    const thread = /^#zgloszenie-(\d+)$/.exec(location.hash);
    if (thread) await openThread(thread[1],false); else await openList(false);
    ViewLoading.finish();
  }
  bindForm('volunteer-login-form','volunteer-login-message',async () => {
    const data = await request('/api/volunteer-session',{bonusId:$('volunteer-bonus-id').value.trim().toUpperCase(),password:$('volunteer-password').value});
    user = data.user; $('volunteer-password').value = ''; await start();
  });
  bindForm('ticket-create-form','ticket-create-message',async form => {
    const data = await request(endpoint,operation(form,{action:'create',kind:$('ticket-kind').value,targetType:$('ticket-target-type').value,targetId:$('ticket-target-id').value,title:$('ticket-title').value,body:$('ticket-body').value}));
    form.reset(); targetOptions(); operationKeys.delete(form); feedback('desk-feedback','Zgłoszenie zostało wysłane do organizatora.'); await openThread(data.ticket.id);
  });
  bindForm('ticket-reply-form','ticket-reply-message',async form => {
    const ticketId = selected;
    await request(endpoint,operation(form,{action:'reply',ticketId,body:$('ticket-reply').value}));
    if (selected===ticketId) { $('ticket-reply').value = ''; feedback('ticket-reply-message','Odpowiedź została wysłana.'); await loadThread(); } operationKeys.delete(form);
  });
  bindForm('ticket-status-form','desk-feedback',async () => { await request(endpoint,{action:'status',ticketId:selected,status:$('ticket-status').value}); await loadThread(); feedback('desk-feedback','Status zgłoszenia został zapisany.'); });
  $('ticket-target-type')?.addEventListener('change',targetOptions);
  $('volunteer-logout')?.addEventListener('click',async () => {
    try { const response = await fetch('/api/volunteer-session',{method:'DELETE',credentials:'same-origin'}); if (!response.ok) throw Error('Nie udało się wylogować. Spróbuj ponownie.'); showLogin(); }
    catch (error) { feedback('desk-feedback',error.message,true); }
  });
  $('ticket-back').onclick = () => openList();
  $('ticket-more').onclick = () => loadList(true).catch(e=>feedback('desk-feedback',e.message,true));
  $('message-more').onclick = () => loadThread(true).catch(e=>feedback('desk-feedback',e.message,true));
  $('desk-refresh').onclick = () => loadList().catch(e=>feedback('desk-feedback',e.message,true));
  $('ticket-filter-form').onsubmit = event => { event.preventDefault(); openList(false); };
  $('ticket-status-filter').onchange = () => openList(false);
  $('ticket-bonus-filter')?.addEventListener('change',()=>openList(false));
  window.addEventListener('hashchange',()=>{if (!user) return; const match = /^#zgloszenie-(\d+)$/.exec(location.hash); if (match) openThread(match[1],false); else openList(false);});
  if (admin) window.addEventListener('admin-session-expired',()=>AdminSession.redirect());
  (async () => {
    try {
      if (admin) { if (!await AdminSession.check()) { AdminSession.redirect(); return; } user = {role:'admin'}; }
      else { const session = await request('/api/volunteer-session'); if (!session.authenticated) { showLogin(); return; } user = session.user; }
      await start();
    } catch (error) { ViewLoading.error(error.message); }
  })();
  PlayerNetwork.startPolling(async () => {
    if (!user || mutations || !catalog || listBusy) return;
    try { if (selected) await loadThread(); else if ($('ticket-list').children.length<=20) await loadList(); }
    catch (error) { feedback('desk-feedback',error.message,true); }
  },20000,3000);
})();

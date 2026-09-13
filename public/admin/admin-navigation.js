window.AdminNavigation = (() => {
  const groups = [
    ['Gra', [['home','Pulpit'],['live','Na żywo'],['announcements','Komunikaty'],['content-blocks','Blokady techniczne'],['preview','Podgląd gracza']]],
    ['Uczestnicy', [['leaderboard','Ranking'],['institution-ranking','Ranking placówek'],['institutions','Placówki','/admin/placowki/'],['answers','Odpowiedzi'],['bonuses','Bonusy'],['question-stats','Statystyki pytań']]],
    ['Organizacja', [['communications','Kontakt Fundacji','/admin/komunikacja/'],['history','Historia i archiwum','/admin/historia/'],['volunteers','Wolontariusze','/admin/wolontariusze/'],['finale','Finał i wyniki'],['qr','Kody QR i pytania','/admin/qr/'],['documents','Dyplomy i pliki'],['diagnostics','Testy i ustawienia']]]
  ];
  const descriptions = {
    'content-blocks':'Czasowo wyłącz pojedynczy kod QR i przywróć go po naprawie.',
    home:'Stan rundy i najważniejsze sterowanie grą.',live:'Aktywność uczestników i ruch przy pytaniach.',
    leaderboard:'Wyniki uczestników, szczegóły kont i eksport danych.', 'institution-ranking':'Wspólne wyniki uczestników każdej placówki.',
    answers:'Przeglądaj odpowiedzi i filtruj ich wyniki.',bonuses:'Sprawdź odebrane bonusy uczestników.',
    'question-stats':'Skuteczność odpowiedzi i statystyki pytań.',announcements:'Przekaż informację wszystkim graczom.',
    finale:'Steruj kolejnymi etapami odsłaniania wyników.',preview:'Sprawdź najważniejsze ekrany gracza.',
    documents:'Przygotuj dyplomy, umowy i pliki do druku.',diagnostics:'Kontrola systemu, symulacja i zarządzanie danymi.'
  };
  const titles=Object.fromEntries(groups.flatMap(([,items])=>items.map(([id,title])=>[id,title])));
  const panels=new Map();
  let ready=false, auxiliary=false, sidebar, toggle, backdrop, selected='home';
  const mobile=matchMedia('(max-width: 960px)');
  function drawer(open,focus=true){
    document.body.classList.toggle('admin-menu-open',open);
    toggle?.setAttribute('aria-expanded',String(open));
    if(backdrop)backdrop.hidden=!open;
    if(sidebar)sidebar.inert=mobile.matches&&!open;
    if(open&&focus)sidebar.querySelector('[aria-current="page"],a,button')?.focus();
    else if(focus&&mobile.matches)toggle?.focus();
  }
  function mount(parent,current){
    sidebar=document.createElement('aside');sidebar.id='admin-sidebar';sidebar.setAttribute('aria-label','Menu administratora');
    sidebar.innerHTML='<div class="admin-nav-brand"><span class="admin-nav-mark">OD</span><div>ONE DAY<small>Panel organizatora</small></div><button type="button" class="admin-nav-close" aria-label="Zamknij menu">×</button></div>';
    const nav=document.createElement('nav');nav.setAttribute('aria-label','Sekcje panelu');
    for(const [label,items] of groups){
      const group=document.createElement('div');group.className='admin-nav-group';const caption=document.createElement('p');caption.textContent=label;group.append(caption);
      for(const [id,title,url] of items){
        const link=document.createElement('a');link.className='admin-nav-link';link.href=url||'/admin/#'+id;link.dataset.section=id;
        if(id==='institutions')link.id='manage-institutions';
        link.innerHTML='<span class="admin-nav-dot" aria-hidden="true"></span>';link.append(document.createTextNode(title));
        if(id===current)link.setAttribute('aria-current','page');
        if(!url&&!auxiliary)link.onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();show(id);};
        group.append(link);
      }
      nav.append(group);
    }
    sidebar.append(nav);
    const footer=document.createElement('div');footer.className='admin-nav-footer';footer.innerHTML='<a href="/wyniki/" target="_blank" rel="noopener">Ekran wyników ↗</a><span class="event-brand">Gwiazdka One Day 2026</span>';sidebar.append(footer);
    toggle=document.createElement('button');toggle.type='button';toggle.className='admin-menu-toggle';toggle.innerHTML='<span aria-hidden="true">☰</span> Menu';toggle.setAttribute('aria-controls','admin-sidebar');toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>drawer(true);
    backdrop=document.createElement('button');backdrop.type='button';backdrop.className='admin-menu-backdrop';backdrop.hidden=true;backdrop.tabIndex=-1;backdrop.setAttribute('aria-label','Zamknij menu');backdrop.onclick=()=>drawer(false);
    parent.prepend(toggle);parent.prepend(sidebar);parent.append(backdrop);
    sidebar.querySelector('.admin-nav-close').onclick=()=>drawer(false);
    sidebar.addEventListener('keydown',event=>{
      if(!mobile.matches||!document.body.classList.contains('admin-menu-open'))return;
      if(event.key==='Escape'){event.preventDefault();drawer(false);return;}
      if(event.key==='Tab'){
        const links=[...sidebar.querySelectorAll('a,button')].filter(el=>el.getClientRects().length);const first=links[0],last=links[links.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    mobile.addEventListener('change',()=>drawer(false,false));drawer(false,false);
  }
  function panel(id){const section=document.createElement('section');section.className='admin-section';section.dataset.adminSection=id;section.hidden=true;panels.set(id,section);return section;}
  function move(target,selector){const node=typeof selector==='string'?document.querySelector(selector):selector;if(!node)throw Error('Brak elementu panelu: '+selector);target.append(node);return node;}
  function init(){
    if(ready)return;ready=true;
    const shell=document.getElementById('admin-shell');shell.classList.add('admin-layout');
    const main=document.createElement('main');main.className='admin-main';main.append(...shell.children);shell.append(main);
    const header=main.querySelector('.header-row');header.querySelector('h1').id='admin-section-title';header.querySelector('h1').tabIndex=-1;
    const subtitle=main.querySelector(':scope > .sub');subtitle.id='admin-section-description';
    const institutionCard=document.getElementById('manage-institutions').closest('.ops-card');institutionCard.remove();
    mount(shell,'home');
    const sections=document.createElement('div');sections.className='admin-sections';
    for(const [id] of Object.entries(descriptions))sections.append(panel(id));
    main.append(sections);
    window.ContentControls.init(panels.get('content-blocks'));
    const home=panels.get('home'),diagnostics=panels.get('diagnostics');
    const stats=main.querySelector(':scope > .stats-row');const extraStats=document.createElement('div');extraStats.className='stats-row';
    [...stats.children].slice(3).forEach(node=>extraStats.append(node));home.append(stats);
    const control=move(home,'.control-panel');
    const utilities=document.createElement('div');utilities.className='utility-grid admin-test-actions';
    for(const id of ['btn-quick-test','btn-integrity-scan','btn-start-simulator'])move(utilities,'#'+id);
    diagnostics.append(utilities);move(diagnostics,'#system-bar');move(diagnostics,'.notes-panel');move(diagnostics,'.simulator-card');
    const resetCard=document.createElement('section');resetCard.className='ops-card admin-reset-card';resetCard.innerHTML='<div class="ops-title">Zarządzanie danymi</div><p class="ops-copy">Operacja dotyczy aktualnie wybranego trybu danych. Przed resetem powstaje pełne archiwum rund. Sprawdź, czy pracujesz na grze LIVE, czy na symulacji.</p>';
    const reset=move(resetCard,'#btn-reset');reset.querySelector('small').textContent='Zapisuje archiwum i czyści wybrany tryb';diagnostics.append(resetCard);
    const feedback=document.getElementById('admin-feedback');feedback.setAttribute('role','status');main.insertBefore(feedback,main.querySelector('.hero'));
    const scope=document.createElement('div');scope.id='admin-scope-label';scope.className='admin-scope-label';scope.textContent='Dane gry LIVE';header.querySelector('.header-main').append(scope);
    for(const id of ['live','leaderboard','answers','bonuses','question-stats']){const tab=move(panels.get(id),'#tab-'+id);tab.style.display='block';}
    panels.get('question-stats').prepend(extraStats);
    move(panels.get('institution-ranking'),'.city-dashboard-card');
    document.querySelector('#tab-leaderboard > .city-summary')?.remove();
    move(panels.get('announcements'),document.getElementById('admin-message').closest('.ops-card'));
    move(panels.get('preview'),document.getElementById('player-preview').closest('.ops-card'));
    move(panels.get('finale'),'.reveal-control-card');
    move(panels.get('documents'),'.diploma-admin-card');move(panels.get('documents'),'.qr-admin-card');
    main.querySelector('.hero').remove();main.querySelector(':scope > .ops-grid').remove();main.querySelector(':scope > .tab-row').remove();
    main.append(sections);
    const mini=document.getElementById('system-mini-bar');mini.tabIndex=0;mini.setAttribute('role','button');mini.setAttribute('aria-label','Przejdź do testów i stanu systemu');mini.onclick=()=>show('diagnostics');mini.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show('diagnostics');}};
    window.addEventListener('hashchange',()=>show(location.hash.slice(1),{history:false,focus:false}));
    show(location.hash.slice(1)||'home',{history:false,focus:false});
  }
  function show(id,options={}){
    if(!ready||auxiliary)return;
    if(!panels.has(id))id='home';selected=id;
    panels.forEach((section,key)=>section.hidden=key!==id);
    sidebar.querySelectorAll('[data-section]').forEach(link=>{if(link.dataset.section===id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.getElementById('admin-section-title').textContent=titles[id];document.getElementById('admin-section-description').textContent=descriptions[id];
    document.title=titles[id]+' - Panel One Day';
    currentTab=id;renderVisibleData();if(id==='content-blocks')window.ContentControls.refresh();if(id==='institution-ranking')renderCityRanking();
    if(options.history!==false&&location.hash!=='#'+id)history.pushState(null,'','#'+id);
    drawer(false,false);
    if(options.focus!==false){window.scrollTo({top:0,behavior:'instant'});document.getElementById('admin-section-title').focus({preventScroll:true});}
  }
  function mountAux(id){if(ready)return;ready=true;auxiliary=true;document.body.classList.add('admin-nav-aux');mount(document.body,id);}
  function updateScope(scope){const element=document.getElementById('admin-scope-label');if(element){element.textContent=scope==='test'?'Dane symulacji TEST':'Dane gry LIVE';element.classList.toggle('test',scope==='test');}}
  function access(unlocked){if(!unlocked)drawer(false,false);}
  return {init,show,mountAux,updateScope,access};
})();

(() => {
  const status=document.getElementById('status'),catalog=document.getElementById('catalog');
  let data={institutions:[],unassigned:[]};
  function message(element,text,error=false){element.textContent=text;element.className=error?'error':'success';}
  async function request(body){const res=await AdminSession.fetch('/api/admin-institutions',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const result=await res.json();if(!res.ok)throw Error(result.error||'Nie udało się wykonać operacji.');return result;}
  function field(text,value,max){const label=document.createElement('label');label.append(document.createTextNode(text));const input=document.createElement('input');input.value=value;input.maxLength=max;input.required=true;label.append(input);return {label,input};}
  function applyFilter(){const normalize=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase();const text=normalize(document.getElementById('catalog-search').value);[...catalog.children].forEach(row=>row.hidden=!normalize(row.dataset.search).includes(text));}
  function render(){
    catalog.replaceChildren();
    for(const institution of data.institutions){
      const row=document.createElement('form');row.className='institution-row';row.dataset.id=institution.id;row.dataset.search=institution.name+' '+institution.city;
      const name=field('Nazwa placówki',institution.name,160),city=field('Miejscowość',institution.city,100);
      const activeLabel=document.createElement('label');activeLabel.className='active-check';const active=document.createElement('input');active.type='checkbox';active.checked=institution.active;activeLabel.append(active,document.createTextNode('Dostępna przy zapisie'));
      const save=document.createElement('button');save.type='submit';save.textContent='Zapisz';const feedback=document.createElement('p');feedback.className='row-message';feedback.role='status';
      row.append(name.label,city.label,activeLabel,save,feedback);
      row.onsubmit=async event=>{event.preventDefault();row.querySelectorAll('input,button').forEach(el=>el.disabled=true);try{const result=await request({action:'save',institutionId:institution.id,revision:institution.revision,name:name.input.value,city:city.input.value,active:active.checked});Object.assign(institution,result);name.input.value=result.name;city.input.value=result.city;row.dataset.search=institution.name+' '+institution.city;message(feedback,'Zapisano. Ranking zachowuje dotychczasowe punkty.');renderUnassigned();}catch(error){message(feedback,error.message,true);}finally{row.querySelectorAll('input,button').forEach(el=>el.disabled=false);}};
      catalog.append(row);
    }
    applyFilter();renderUnassigned();
  }
  function renderUnassigned(){
    const root=document.getElementById('unassigned');root.replaceChildren();
    if(!data.unassigned.length){root.textContent='W bieżącej rundzie nie ma uczestników wymagających przypisania.';return;}
    for(const p of data.unassigned){
      const row=document.createElement('div');row.className='assignment';const person=document.createElement('div');person.textContent=p.firstName+' '+p.lastName;const original=document.createElement('small');original.textContent='Poprzedni zapis: '+(p.city||'brak');person.append(original);
      const select=document.createElement('select');select.setAttribute('aria-label','Placówka dla '+p.firstName+' '+p.lastName);const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Wybierz placówkę';select.append(placeholder);
      for(const i of data.institutions.filter(i=>i.active)){const option=document.createElement('option');option.value=i.id;option.textContent=i.name+' — '+i.city;select.append(option);}
      const button=document.createElement('button');button.textContent='Przypisz';button.onclick=async()=>{if(!select.value){message(status,'Wybierz placówkę dla uczestnika.',true);return;}button.disabled=true;try{await request({action:'assign',participantId:p.id,institutionId:Number(select.value)});data.unassigned=data.unassigned.filter(item=>item.id!==p.id);renderUnassigned();message(status,'Przypisano uczestnika. Jego punkty należą teraz do wybranej placówki.');}catch(error){message(status,error.message,true);button.disabled=false;}};
      row.append(person,select,button);root.append(row);
    }
  }
  async function load(){try{data=await request();render();message(status,`Placówek w katalogu: ${data.institutions.length}.`);}catch(error){message(status,error.message,true);}}
  document.getElementById('refresh').onclick=load;document.getElementById('catalog-search').oninput=applyFilter;
  document.getElementById('add-institution').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await request({action:'save',name:document.getElementById('new-name').value,city:document.getElementById('new-city').value,active:true});event.target.reset();await load();message(status,'Dodano placówkę. Jest dostępna w wyszukiwarce gracza.');}catch(error){message(status,error.message,true);}finally{button.disabled=false;}};
  window.addEventListener('admin-session-expired',()=>AdminSession.redirect());
  (async()=>{try{if(!await AdminSession.check()){AdminSession.redirect();return;}document.getElementById('institution-admin').hidden=false;await load();}catch(error){message(status,'Nie udało się sprawdzić dostępu. Odśwież stronę.',true);}})();
})();

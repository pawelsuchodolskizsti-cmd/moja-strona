(() => {
  const input=document.getElementById('institution-search'),idInput=document.getElementById('institution-id');
  if(!input)return;
  const list=document.getElementById('institution-options'),status=document.getElementById('institution-status'),retry=document.getElementById('institution-retry');
  let institutions=[],selected=null,highlight=-1,loaded=false;
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function near(a,b) {
    if(a.length<4||Math.abs(a.length-b.length)>1)return false;
    let row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}
    return row[b.length]<=1;
  }
  function choose(item) {
    selected=item;idInput.value=item.id;input.value=`${item.name} - ${item.city}`;
    status.textContent=`Wybrano: ${input.value}`;close();input.focus();
  }
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');highlight=-1;}
  function render(){
    if(!loaded)return;
    const terms=normalize(input.value).split(' ').filter(Boolean);
    const matches=institutions.filter(item=>{
      const words=normalize(item.name+' '+item.city).split(' ');
      return terms.every(term=>words.some(word=>word.includes(term)||near(term,word)));
    });
    list.replaceChildren();highlight=-1;
    for(const item of matches.slice(0,30)){
      const option=document.createElement('button');option.type='button';option.role='option';option.id=`institution-option-${item.id}`;option.dataset.id=item.id;option.setAttribute('aria-selected','false');
      option.textContent=`${item.name} - ${item.city}`;option.onmousedown=e=>e.preventDefault();option.onclick=()=>choose(item);list.append(option);
    }
    list.hidden=!matches.length;input.setAttribute('aria-expanded',String(!list.hidden));input.removeAttribute('aria-activedescendant');
    status.textContent=matches.length ? `Wybierz swoją placówkę z listy${matches.length>30?' - wpisz więcej znaków, aby zawęzić wyniki':''}.` : 'Brak pasujących placówek. Sprawdź nazwę lub zgłoś brak organizatorowi.';
  }
  input.addEventListener('input',()=>{selected=null;idInput.value='';render()});
  input.addEventListener('focus',()=>{if(!selected)render()});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){close();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(list.hidden)render();const options=[...list.children];if(!options.length)return;
      highlight=(highlight+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options.forEach((option,i)=>{option.setAttribute('aria-selected',String(i===highlight));if(i===highlight){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}});
    }
    if(event.key==='Enter'&&!list.hidden){event.preventDefault();if(highlight>=0)list.children[highlight].click();}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.institution-picker'))close()});
  async function load(){
    loaded=false;retry.hidden=true;status.textContent='Ładowanie placówek…';
    try{
      const response=await fetch('/api/institutions',{cache:'no-store'});if(!response.ok)throw Error();
      const data=await response.json();institutions=data.institutions;loaded=true;
      if(selected){const updated=institutions.find(i=>i.id===selected.id);if(updated)choose(updated);else{selected=null;idInput.value='';}}
      if(!selected){status.textContent=institutions.length?'Wyszukaj miasto lub nazwę, a następnie wybierz placówkę.':'Brak dostępnych placówek. Skontaktuj się z organizatorem.';if(document.activeElement===input)render();}
      retry.hidden=false;
    }catch{status.textContent='Nie udało się pobrać placówek. Sprawdź połączenie i odśwież listę.';retry.hidden=false;}
  }
  retry.onclick=load;load();
})();

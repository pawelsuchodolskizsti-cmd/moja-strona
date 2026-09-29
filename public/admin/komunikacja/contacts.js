(()=>{
  const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const labels={draft:'Wzór - zapis testowy',pending_guardian:'Oczekuje na opiekuna',active:'Aktywna',withdrawn:'Wycofana'};
  let cursors=[0],page=0,version=0;
  function csvCell(value){
    let text=String(value??'');
    if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  $('contact-export').onclick=async()=>{
    const button=$('contact-export'),status=$('contact-export-status');button.disabled=true;
    try{
      const rows=[['ID zapisu','ID uczestnika','Imię','Nazwisko','ID placówki','Placówka i miejscowość','E-mail','Status zgody','Data zgody (UTC)','Pełnoletność / opiekun','Wersja zgody','Treść zgody','Źródło zapisu']];
      let before=0,count=0;
      do{
        const data=await request({before,status:'',search:''});
        for(const item of data.items){
          if(item.status==='withdrawn')continue;
          rows.push([item.id,item.participantId,item.firstName,item.lastName,item.institutionId,item.institution,item.email,labels[item.status]||item.status,item.consentedAt,item.ageDeclaration==='adult'?'Osoba pełnoletnia':'Wymagane potwierdzenie opiekuna',item.version,item.consentText,item.source==='after-game'?'Po zakończeniu gry':item.source==='player-registration'?'Zapis do gry':item.source]);count++;
        }
        before=data.before;status.textContent=`Przygotowywanie pliku: ${count} osób…`;
      }while(before);
      if(!count){status.textContent='Brak zapisanych osób do eksportu.';return;}
      const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`one-day-kontakt-${new Date().toISOString().slice(0,10)}.csv`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent=`Plik gotowy. Liczba zapisanych osób: ${count}.`;
    }catch(e){status.textContent='Nie udało się przygotować pełnego pliku. Spróbuj ponownie. '+e.message;}finally{button.disabled=false;}
  };
  async function request(params,body){const response=await AdminSession.fetch('/api/admin-communications'+(params?'?'+new URLSearchParams(params):''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się wczytać danych.');return data;}
  async function load(reset=false){if(reset){page=0;cursors=[0];}const ticket=++version;$('contact-prev').disabled=true;$('contact-next').disabled=true;$('contact-feedback').textContent='';try{
    const data=await request({before:cursors[page],status:$('contact-status').value,search:$('contact-search').value});if(ticket!==version)return;
    $('contact-draft').hidden=!data.draft;$('contact-counts').textContent=data.counts.map(s=>`${labels[s.status]}: ${s.count}`).join(' · ')||'Brak zapisów';$('contact-list').replaceChildren();
    if(data.items.length){
      const table=node('table');table.className='contacts-table';const head=node('thead'),header=node('tr');
      for(const title of ['Uczestnik','Placówka','E-mail','Status i data zapisu','Zgoda','Działania']){const th=node('th',title);th.scope='col';header.append(th);}head.append(header);table.append(head);const body=node('tbody');
      for(const item of data.items){
        const row=node('tr');row.append(node('td',`${item.firstName} ${item.lastName}`),node('td',item.institution),node('td',item.email));
        const state=node('td'),status=node('strong',labels[item.status]);status.className='contact-status';state.append(status,node('div',new Date(item.consentedAt).toLocaleString('pl-PL')));if(item.withdrawnAt)state.append(node('div','Wycofanie: '+new Date(item.withdrawnAt).toLocaleString('pl-PL')));row.append(state);
        const consent=node('td');consent.append(node('div',item.ageDeclaration==='adult'?'Osoba pełnoletnia':'Potrzebne potwierdzenie opiekuna'));
        const details=node('details');details.append(node('summary','Treść i wersja zapisu'),node('p',item.version),node('p',item.consentText));consent.append(details);row.append(consent);
        const actions=node('td');if(item.status!=='withdrawn'){const button=node('button','Wycofaj zgodę');button.type='button';button.className='secondary';button.onclick=async()=>{if(!confirm(`Wycofać zapis na kontakt dla ${item.firstName} ${item.lastName}?`))return;button.disabled=true;try{await request(null,{action:'withdraw',contactId:Number(item.id)});await load();$('contact-feedback').textContent='Zapis został wycofany.';}catch(e){$('contact-feedback').textContent=e.message;button.disabled=false;}};actions.append(button);}else actions.textContent='-';row.append(actions);body.append(row);
      }
      table.append(body);$('contact-list').append(table);
    }
    if(!data.items.length)$('contact-list').append(node('p','Brak zapisów dla wybranych filtrów.'));
    $('contact-page').textContent='Strona '+(page+1);$('contact-prev').disabled=page===0;$('contact-next').disabled=!data.before;$('contact-next').onclick=()=>{cursors[++page]=data.before;load();};
  }catch(e){if(ticket===version){$('contact-feedback').textContent=e.message;$('contact-prev').disabled=page===0;}}}
  $('contact-prev').onclick=()=>{page=Math.max(0,page-1);load();};$('contact-filters').onsubmit=e=>{e.preventDefault();load(true);};$('contact-status').onchange=()=>load(true);
  (async()=>{try{if(!await AdminSession.check()){AdminSession.redirect();return;}AdminNavigation.mountAux('communications');await load();ViewLoading.finish();}catch(e){ViewLoading.error(e.message);}})();
})();

window.AdminDataTools=(()=>{
 async function request(query,body){const r=await AdminSession.fetch('/api/admin-data-tools'+(query?'?'+new URLSearchParams(query):''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Nie udało się wykonać operacji.');return d;}
 async function download(meta,status){
  if(meta.status!=='ready'){status('Kopia danych jest zapisana. Przygotowuję plik Excel...');meta=await request(null,{action:'prepare',id:meta.id});}
  const chunks=[];for(let index=0;index<meta.chunk_count;index++){status(`Pobieranie pliku Excel: ${index+1} / ${meta.chunk_count}`);const d=await request({view:'chunk',id:meta.id,index});chunks.push(Uint8Array.from(atob(d.data),c=>c.charCodeAt(0)));}
  const blob=new Blob(chunks,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});if(blob.size!==meta.byte_length)throw Error('Plik jest niekompletny. Pobierz go ponownie z archiwum.');
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==meta.sha256)throw Error('Kontrola pliku nie powiodła się. Pobierz go ponownie z archiwum.');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=meta.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Excel został przygotowany do pobrania i zapisany w Historii i archiwum.');
 }
 function mount(){const root=document.querySelector('.admin-reset-card');if(!root||root.querySelector('#data-export-all'))return;
  const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:12px;margin-top:18px';
  const exportButton=document.createElement('button');exportButton.id='data-export-all';exportButton.className='btn primary';exportButton.textContent='Pobierz wszystko do Excela i zapisz w archiwum';
  const clearButton=document.createElement('button');clearButton.id='data-cleanup-trials';clearButton.className='btn outline';clearButton.textContent='Usuń opinie i kontakty z prób';
  const help=document.createElement('p');help.className='ops-copy';help.textContent='Excel obejmuje LIVE, TEST i zachowane rundy. Czyszczenie usuwa opinie oraz kontakty z bieżącej bazy, także wpisane w LIVE. Zapisane wcześniej archiwa pozostają dostępne.';
  const status=document.createElement('p');status.id='data-tools-status';status.setAttribute('role','status');status.style.overflowWrap='anywhere';
  const report=text=>status.textContent=text;const busy=value=>{exportButton.disabled=value;clearButton.disabled=value;};
  exportButton.onclick=async()=>{busy(true);try{let requestId=sessionStorage.getItem('fullGameExportRequest');if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem('fullGameExportRequest',requestId);}report('Zapisuję pełną kopię danych...');const meta=await request(null,{action:'export',requestId});await download(meta,report);sessionStorage.removeItem('fullGameExportRequest');}catch(e){report(e.message+' Kopię można dokończyć lub pobrać w Historii i archiwum.');}finally{busy(false);}};
  clearButton.onclick=async()=>{busy(true);try{report('Sprawdzam wpisy do usunięcia...');const preview=await request(null,{action:'cleanup-preview'});if(!preview.feedback&&!preview.contacts){report('Nie ma opinii ani kontaktów do usunięcia.');return;}
   const dialog=document.createElement('dialog');dialog.style.cssText='background:#121722;color:#fff;border:1px solid #574668;border-radius:18px;padding:24px;max-width:min(520px,calc(100vw - 32px));margin:auto';
   const title=document.createElement('h2');title.textContent='Usunąć wpisy z prób?';const text=document.createElement('p');text.style.cssText='line-height:1.6;margin:16px 0';text.textContent=`Do usunięcia: ${preview.feedback} opinii i ${preview.contacts} kontaktów Fundacji. Obejmuje to wszystkie obecne wpisy, także z LIVE. Usunięcie z bazy jest trwałe. Uczestnicy, punkty i zapisane archiwa pozostaną. Jeśli chcesz zachować te wpisy, najpierw pobierz pełny Excel.`;
   const cancel=document.createElement('button');cancel.className='btn outline';cancel.textContent='Anuluj';const confirm=document.createElement('button');confirm.className='btn danger';confirm.textContent='Usuń te opinie i kontakty';confirm.style.margin='12px';dialog.append(title,text,cancel,confirm);document.body.append(dialog);
   const approved=await new Promise(resolve=>{cancel.onclick=()=>{dialog.close();resolve(false);};confirm.onclick=()=>{dialog.close();resolve(true);};dialog.oncancel=()=>resolve(false);dialog.showModal();cancel.focus();});dialog.remove();
   if(!approved){report('Anulowano. Dane pozostały w bazie.');return;}const result=await request(null,{action:'cleanup',token:preview.token,confirm:'USUN WPISY Z PROB'});report(`Usunięto z bazy: ${result.feedback} opinii i ${result.contacts} kontaktów. Wpisy dodane lub zmienione po otwarciu potwierdzenia zostały zachowane.`);
  }catch(e){report(e.message);}finally{busy(false);}};
  actions.append(exportButton,clearButton);root.append(actions,help,status);
 }
 const observer=new MutationObserver(()=>{if(document.querySelector('.admin-reset-card')){mount();observer.disconnect();}});if(document.getElementById('admin-shell'))observer.observe(document.body,{childList:true,subtree:true});mount();
 return {request,download};
})();

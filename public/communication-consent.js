(() => {
  const key='foundationContactManageToken';
  function token(create=false){
    let value='';try{value=localStorage.getItem(key)||'';}catch{}
    if(/^[a-f0-9]{64}$/.test(value))return value;
    if(!create)return '';
    value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem(key,value);if(localStorage.getItem(key)!==value)throw Error();}
    catch{throw Error('Przeglądarka nie może zachować klucza rezygnacji z kontaktu. Możesz dołączyć do gry bez zgody na kontakt.');}
    return value;
  }
  window.CommunicationConsent={payload(){
    if(!document.getElementById('accept-communication')?.checked)return {communicationConsent:false};
    const age=document.getElementById('communication-age').value;
    if(!age)throw Error('Wybierz informację o pełnoletności przy dobrowolnej zgodzie lub pozostaw zgodę niezaznaczoną.');
    return {communicationConsent:true,communicationConsentVersion:CommunicationPolicy.version,communicationToken:token(true),communicationAge:age};
  }};
  document.querySelectorAll('[data-communication-title]').forEach(e=>e.textContent=CommunicationPolicy.title);
  document.querySelectorAll('[data-communication-text]').forEach(e=>e.textContent=CommunicationPolicy.text);
  const checkbox=document.getElementById('accept-communication');
  if(checkbox){const update=()=>{document.getElementById('communication-age-field').hidden=!checkbox.checked;};checkbox.addEventListener('change',update);update();}
  const status=document.getElementById('communication-manage-status'),withdraw=document.getElementById('communication-withdraw');
  if(!status||!withdraw)return;
  async function request(action){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch('/api/communication-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,communicationToken:token()}),cache:'no-store',signal:controller.signal});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się połączyć. Spróbuj ponownie.');return data;
    }catch(e){throw Error(e.name==='AbortError'?'Połączenie trwa zbyt długo. Sprawdź zapis ponownie.':e.message);}finally{clearTimeout(timeout);}
  }
  function render(data){
    const current=data.states.filter(s=>s.status!=='withdrawn').reduce((n,s)=>n+s.count,0);
    withdraw.hidden=!current;withdraw.disabled=false;
    status.textContent=current?'Na tym urządzeniu znaleziono zapis na kontakt. Możesz go wycofać poniżej.':data.states.length?'Zgoda została wycofana. Nie wpływa to na Twoją grę ani punkty.':'Nie znaleziono zapisu na kontakt dla tego urządzenia.';
  }
  withdraw.onclick=async()=>{withdraw.disabled=true;try{render(await request('withdraw'));}catch(e){status.textContent=e.message;withdraw.disabled=false;}};
  if(!token()){status.textContent='Brak zapisanego klucza na tym urządzeniu. Jeśli zgodę zapisano na innym telefonie lub usunięto dane przeglądarki, poproś organizatora o wycofanie jej w panelu.';return;}
  const retry=document.getElementById('communication-retry');
  async function refresh(){if(retry)retry.hidden=true;try{render(await request('status'));}catch(e){status.textContent=e.message;if(retry)retry.hidden=false;}}
  if(retry)retry.onclick=refresh;refresh();
})();

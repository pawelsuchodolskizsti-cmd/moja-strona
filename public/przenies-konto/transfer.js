(() => {
  const $=id=>document.getElementById(id),transferToken=location.hash.slice(1),pendingKey='pendingAccountTransfer';
  let deviceToken='';
  async function request(action){const response=await fetch('/api/session-transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,transferToken,...(action==='claim'?{deviceToken}:{})}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się przenieść konta.');return data;}
  function message(error){return error.name==='TimeoutError'?'Połączenie trwa zbyt długo. Spróbuj ponownie na tym telefonie.':error.message;}
  async function check(){
    $('transfer-retry').hidden=true;
    try{
      const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
      if(pending?.transferToken===transferToken){deviceToken=pending.deviceToken;$('transfer-status').textContent='Możesz ponowić potwierdzenie przeniesienia na tym telefonie.';$('transfer-confirmation').hidden=false;return;}
      const data=await request('check');$('transfer-status').textContent=`Konto: ${data.firstName}. Link jest ważny do ${new Date(data.expiresAt).toLocaleTimeString('pl-PL')}.`;$('transfer-confirmation').hidden=false;
    }catch(error){$('transfer-status').textContent=message(error);$('transfer-retry').hidden=false;}
  }
  $('transfer-confirm').onclick=async()=>{
    const button=$('transfer-confirm');button.disabled=true;
    try{
      if(!deviceToken)deviceToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      sessionStorage.setItem(pendingKey,JSON.stringify({transferToken,deviceToken}));
      localStorage.setItem('transferStorageCheck','1');if(localStorage.getItem('transferStorageCheck')!=='1')throw Error('Włącz zapisywanie danych witryny, aby przenieść konto.');localStorage.removeItem('transferStorageCheck');
      const data=await request('claim');
      localStorage.setItem('deviceToken',deviceToken);localStorage.setItem('participantId',String(data.participantId));localStorage.setItem('participantGameStartedAt',data.gameStartedAt);localStorage.removeItem('playerExperience');
      sessionStorage.removeItem(pendingKey);history.replaceState(null,'',location.pathname);
      $('transfer-confirmation').hidden=true;$('transfer-retry').hidden=true;$('transfer-status').textContent='Gotowe! Konto jest teraz dostępne na tym telefonie. Wszystkie punkty i postępy zostały zachowane.';$('transfer-continue').hidden=false;
    }catch(error){$('transfer-status').textContent=message(error);}finally{button.disabled=false;}
  };
  $('transfer-retry').onclick=check;check();
})();

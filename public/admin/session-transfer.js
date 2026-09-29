(() => {
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(520px,calc(100% - 32px));box-sizing:border-box;background:#121722;color:#eaf0ff;border:1px solid #39445b;border-radius:20px;padding:24px;';
  dialog.innerHTML='<h2>Przenieś konto na inny telefon</h2><p data-transfer-status role="status"></p><label>Jednorazowy link<input data-transfer-link readonly style="width:100%;box-sizing:border-box;padding:12px;margin:10px 0;font:14px system-ui" aria-label="Jednorazowy link do przeniesienia konta"></label><button type="button" data-transfer-copy>Kopiuj link</button><form method="dialog" style="margin-top:16px"><button>Zamknij</button></form>';
  document.body.append(dialog);const status=dialog.querySelector('[data-transfer-status]'),input=dialog.querySelector('input'),copy=dialog.querySelector('[data-transfer-copy]');let busy=false;
  window.createParticipantTransfer=async id=>{
    if(busy)return;busy=true;input.value='';copy.disabled=true;status.textContent='Przygotowywanie linku…';if(!dialog.open)dialog.showModal();
    try{const response=await AdminSession.fetch('/api/admin-adjust-participant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participantId:Number(id),action:'create-transfer'})});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Nie udało się utworzyć linku.');input.value=new URL(data.transferPath,location.origin).href;copy.disabled=false;const person=allParticipants.find(p=>Number(p.id)===Number(id));status.textContent=`${person?person.firstName+' '+person.lastName+'. ':''}Link ważny do ${new Date(data.expiresAt).toLocaleTimeString('pl-PL')}. Wyślij go tej osobie. Stary telefon straci dostęp dopiero po potwierdzeniu na nowym. Wygenerowanie kolejnego linku unieważni poprzedni.`;}
    catch(e){status.textContent=e.message;}finally{busy=false;}
  };
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Skopiowano';setTimeout(()=>copy.textContent='Kopiuj link',2000);}catch{input.focus();input.select();status.textContent='Zaznaczono link. Skopiuj go ręcznie.';}};
})();

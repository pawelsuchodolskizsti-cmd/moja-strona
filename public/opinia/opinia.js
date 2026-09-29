(() => {
  const $=id=>document.getElementById(id),contactOnly=new URLSearchParams(location.search).has('kontakt');
  async function request(action,extra={}){
    let participantId,deviceToken;
    try{participantId=localStorage.getItem('participantId');deviceToken=localStorage.getItem('deviceToken');}catch{}
    if(!deviceToken)throw Error('Otwórz stronę na urządzeniu, na którym bierzesz udział w grze.');
    const response=await fetch('/api/player-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(participantId?{participantId}:{}),deviceToken,...extra}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się zapisać. Spróbuj ponownie.');return data;
  }
  const message=e=>e.name==='TimeoutError'?'Połączenie trwa zbyt długo. Spróbuj ponownie. Wpisany tekst pozostał w formularzu.':e.message;
  function stars(){const value=Number(document.querySelector('[name=rating]:checked')?.value||0);document.querySelectorAll('.stars label').forEach((label,i)=>label.classList.toggle('selected',i<value));$('rating-label').textContent=value?`Twoja ocena: ${value} / 5`:'Wybierz od 1 do 5 gwiazdek';}
  document.querySelectorAll('[name=rating]').forEach(r=>r.onchange=stars);
  function contact(data){$('contact-draft').hidden=!data.draft;$('contact-section').hidden=!contactOnly&&data.contactJoined;$('contact-form').hidden=data.contactJoined;if(data.contactJoined)$('page-status').textContent=contactOnly?'Twój zapis na kontakt jest już zachowany.':'';}
  async function load(){
    $('retry').hidden=true;
    try{const data=await request('status');$('page-status').textContent='';$('feedback-section').hidden=contactOnly;contact(data);
      if(data.feedback){document.querySelector(`[name=rating][value="${data.feedback.rating}"]`).checked=true;$('liked').value=data.feedback.liked;$('improvements').value=data.feedback.improvements;$('feedback-form').querySelector('button').textContent='Zapisz zmiany opinii';stars();}
    }catch(e){$('page-status').textContent=message(e);$('retry').hidden=false;}
  }
  $('feedback-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('feedback-status').textContent='Zapisywanie…';try{await request('save',{rating:Number(document.querySelector('[name=rating]:checked')?.value),liked:$('liked').value,improvements:$('improvements').value});$('feedback-status').textContent='Dziękujemy! Twoja opinia została zapisana.';button.textContent='Zapisz zmiany opinii';}catch(error){$('feedback-status').textContent=message(error);}finally{button.disabled=false;}};
  $('contact-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const data=await request('join',CommunicationConsent.payload());contact(data);$('page-status').textContent=data.draft?'Dziękujemy! Zapisano testową zgodę na kontakt zgodnie z obecnym wzorem.':'Dziękujemy! Twój zapis na kontakt został zachowany.';}catch(error){$('contact-status').textContent=message(error);}finally{button.disabled=false;}};
  $('retry').onclick=load;load();
})();

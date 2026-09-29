(() => {
  const targets=[document.getElementById('thanks-screen'),document.getElementById('bonus-result-thanks')].filter(Boolean);
  if(!targets.length)return;
  for(const target of targets){
    const panel=document.createElement('section');panel.className='after-game-actions';
    panel.innerHTML='<a class="after-game-link" href="/opinia/"><strong>Podziel się opinią</strong><span>Oceń grę i pomóż nam przygotować kolejne wydarzenia</span></a><a class="after-game-link" data-contact-invite href="/opinia/?kontakt=1" hidden><strong>Zostań z One Day</strong><span>Dołącz do aktualności Fundacji</span></a>';
    const card=target.closest('.card');
    panel.classList.toggle('after-game-home',target.id==='thanks-screen');
    card.after(panel);
    let pending=false,lastCheck=0;
    const refresh=async()=>{
      panel.hidden=!target.getClientRects().length;
      document.body.classList.toggle('after-game-separated',!panel.hidden);
      if(panel.hidden||pending||Date.now()-lastCheck<15000)return;
      pending=true;
      try{
        const participantId=localStorage.getItem('participantId'),deviceToken=localStorage.getItem('deviceToken');
        if(!deviceToken)return;
        const response=await fetch('/api/player-feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',...(participantId?{participantId}:{}),deviceToken}),signal:AbortSignal.timeout(12000)});
        if(!response.ok)return;const data=await response.json();lastCheck=Date.now();panel.querySelector('[data-contact-invite]').hidden=data.contactJoined;
      }catch{}finally{pending=false;}
    };
    new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['style'],subtree:true});
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);refresh();
  }
})();

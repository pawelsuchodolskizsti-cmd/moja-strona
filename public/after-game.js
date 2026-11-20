(() => {
  const targets=[document.getElementById('thanks-screen'),document.getElementById('bonus-result-thanks')].filter(Boolean);
  if(!targets.length)return;
  for(const target of targets){
    const panel=document.createElement('section');panel.className='after-game-actions';
    panel.innerHTML='<a class="after-game-link" href="/opinia/"><strong>Podziel się opinią</strong><span>Oceń grę i pomóż nam przygotować kolejne wydarzenia</span></a>';
    const card=target.closest('.card');
    panel.classList.toggle('after-game-home',target.id==='thanks-screen');
    card.after(panel);
    const refresh=()=>{
      panel.hidden=!target.getClientRects().length;
      document.body.classList.toggle('after-game-separated',!panel.hidden);
    };
    new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['style'],subtree:true});
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);refresh();
  }
})();

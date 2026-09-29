(() => {
  const style=document.createElement('style');
  style.textContent=`.reveal-show{position:fixed;inset:0;z-index:1000;display:grid;place-content:center;text-align:center;padding:24px;background:radial-gradient(ellipse at center,#fff9ffff,#eee8fcf5);color:#30214f;pointer-events:none}.reveal-show[hidden]{display:none}.reveal-show p{font:800 clamp(22px,4vw,60px)/1.2 'Syne',sans-serif;margin:0 0 24px}.reveal-show strong{display:block;font:800 clamp(100px,24vh,300px)/1 'Syne',sans-serif;color:#bb429f}.reveal-show small{font:500 clamp(16px,2vw,28px)/1.5 system-ui;margin-top:24px}.reveal-confetti{position:fixed;inset:0;z-index:1001;pointer-events:none;overflow:hidden}.reveal-confetti i{position:absolute;top:-30px;width:12px;height:20px;animation:reveal-fall 4s ease-in forwards}@keyframes reveal-fall{to{transform:translate(var(--drift),110vh) rotate(var(--spin))}}`;
  document.head.append(style);
  const overlay=document.createElement('div');overlay.className='reveal-show';overlay.hidden=true;overlay.innerHTML='<p></p><strong></strong><small>Za chwilę poznamy wyniki</small>';document.body.append(overlay);
  let active=null,seen=new Set(),celebrationTimer=null,lastRefresh=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function celebrate(title){
    overlay.querySelector('p').textContent=title;overlay.querySelector('strong').textContent='Brawo!';overlay.querySelector('small').textContent='Gratulujemy wszystkim uczestnikom';
    clearTimeout(celebrationTimer);celebrationTimer=setTimeout(()=>{overlay.hidden=true;},1800);
    if(reduced.matches)return;
    const canvas=document.createElement('div');canvas.className='reveal-confetti';canvas.setAttribute('aria-hidden','true');
    const colors=['#ff3d80','#9362ee','#ffc857','#b4ef64','#ffffff'];
    for(let i=0;i<150;i++){const piece=document.createElement('i');piece.style.cssText=`left:${Math.random()*100}%;background:${colors[i%colors.length]};animation-delay:${Math.random()*.8}s;--drift:${Math.random()*400-200}px;--spin:${Math.random()*1440-720}deg;border-radius:${i%3===0?'50%':'2px'}`;canvas.append(piece);}
    document.body.append(canvas);setTimeout(()=>canvas.remove(),5000);
  }
  setInterval(()=>{
    const reveal=scoreboardState.resultsReveal||{};
    const events=[['participants',reveal.participantsAt,'Najlepsi uczestnicy'],['cities',reveal.citiesAt,'Najlepsze placówki']].filter(e=>Number.isFinite(Date.parse(e[1])));
    if(!['ended','thanks'].includes(scoreboardState.phase)||!events.length){active=null;seen.clear();overlay.hidden=true;clearTimeout(celebrationTimer);document.querySelectorAll('.reveal-confetti').forEach(e=>e.remove());return;}
    if(active&&!events.some(e=>e[0]+e[1]===active.key)){active=null;overlay.hidden=true;}
    if(!active){
      const pending=events.find(e=>Date.parse(e[1])>GameClock.now()&&!seen.has(e[0]+e[1]));
      if(!pending)return;
      active={key:pending[0]+pending[1],time:Date.parse(pending[1]),title:pending[2]};clearTimeout(celebrationTimer);
    }
    overlay.hidden=false;overlay.querySelector('p').textContent=active.title;
    const seconds=Math.max(0,Math.ceil((active.time-GameClock.now())/1000));
    overlay.querySelector('strong').textContent=seconds||'…';overlay.querySelector('small').textContent=seconds?'Za chwilę poznamy wyniki':'Odsłaniamy wyniki';
    if(seconds===0){
      if(Date.parse(scoreboardState.serverNow)>=active.time){const title=active.title;seen.add(active.key);active=null;celebrate(title);}
      else if(GameClock.now()-lastRefresh>1000){lastRefresh=GameClock.now();scheduleScoreboardRefresh(true);}
    }
  },100);
})();

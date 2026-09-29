(() => {
  const style=document.createElement('style');
  style.textContent=`.reveal-show{position:fixed;inset:0;z-index:1000;display:grid;place-content:center;text-align:center;padding:24px;background:transparent;color:#fff;text-shadow:0 2px 5px #24133f,0 4px 18px #24133f,0 0 40px #24133f;pointer-events:none}.reveal-show[hidden]{display:none}.reveal-show.counting{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:#21113b20}.reveal-show p{font:800 clamp(22px,4vw,60px)/1.2 'Syne',sans-serif;margin:0 0 24px}.reveal-show strong{display:block;font:800 clamp(86px,22vh,280px)/1 'Syne',sans-serif;color:#ff6baa}.reveal-show small{font:700 clamp(16px,2vw,26px)/1.5 'Syne',sans-serif;margin-top:24px}.reveal-show.celebrating{place-content:start center;padding-top:28px}.reveal-show.celebrating p{font-size:clamp(18px,2.4vw,36px);margin-bottom:8px}.reveal-show.celebrating strong{font-size:clamp(36px,6vw,86px)}.reveal-show.celebrating small{font-size:clamp(14px,1.5vw,22px);margin-top:8px}.reveal-effects{position:fixed;inset:0;z-index:1001;pointer-events:none;width:100%;height:100%}@media(prefers-reduced-motion:reduce){.reveal-show.counting{backdrop-filter:none;-webkit-backdrop-filter:none}}`;
  style.textContent+=`.award-card{gap:18px;text-align:center}.award-winners{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;flex:1;min-height:0;align-content:center;overflow:auto}.award-winner{display:flex;flex-direction:column;justify-content:center;gap:22px;padding:28px 18px;border:1px solid #ded3ef;border-radius:22px;background:linear-gradient(135deg,#fff5fa,#f0edff);min-width:0}.award-place{font:800 clamp(22px,2.5vw,46px)/1.2 'Syne',sans-serif}.award-name{font:800 clamp(22px,2.5vw,48px)/1.2 'Syne',sans-serif;overflow-wrap:anywhere}.award-score{font:800 clamp(28px,3vw,56px)/1.2 'Syne',sans-serif}.award-next{align-self:center;max-width:100%;border:1px solid #d5c2ef;background:#f5efff;color:#6b3f8b;border-radius:14px;padding:12px 20px;min-height:44px;font:700 15px 'DM Sans',sans-serif;cursor:pointer}.award-single .award-winners{grid-template-columns:1fr}.award-single .award-name{font-size:clamp(30px,5vw,88px)}.award-single .award-place,.award-single .award-score{font-size:clamp(32px,4vw,64px)}@media(max-width:600px){.award-winners{grid-template-columns:1fr;gap:10px}.award-winner{padding:14px;gap:8px}.award-name{font-size:20px}.award-place,.award-score{font-size:24px}.award-card{gap:12px}.award-next{font-size:13px}}.reveal-show strong.event-brand{text-shadow:none;filter:drop-shadow(0 3px 5px #24133f60)}
.screen>.brand-strip,.screen>.hero,.screen>.announcement-card,.screen>.city-card,.screen>.participants-sidebar,.board>.board-card{transition:transform 1.1s cubic-bezier(.2,.75,.2,1),opacity .8s}
.reveal-ranking-focus .screen>.brand-strip,.reveal-ranking-focus .screen>.hero{transform:translateY(-110vh);opacity:0}
.reveal-ranking-focus .screen>.participants-sidebar{transform:translateX(110vw);opacity:0}
.reveal-ranking-focus .board>.board-card{transform:translateX(-110vw);opacity:0}
.reveal-ranking-focus .screen>.city-card,.reveal-ranking-focus .screen>.announcement-card{transform:translateY(110vh);opacity:0}
.reveal-ranking-focus{overflow:hidden}
.reveal-ranking-stage{position:fixed;z-index:999;inset:150px max(20px,10vw) 30px;display:flex;pointer-events:auto}
.reveal-ranking-stage>.board-card{width:100%;height:100%;transform-origin:top left;padding:clamp(18px,3vw,48px);box-shadow:0 20px 90px #24133f55}
.reveal-ranking-stage .section-title{font-size:clamp(24px,3vw,48px)}
.reveal-ranking-stage .board-tools{display:none}
.reveal-ranking-stage .list-name,.reveal-ranking-stage .podium-name{font-size:clamp(18px,2vw,34px)}
.reveal-ranking-stage .list-score strong,.reveal-ranking-stage .podium-score{font-size:clamp(24px,2.5vw,42px)}
.reveal-ranking-stage .list{display:grid;align-content:start;grid-auto-rows:max-content}.reveal-show.celebrating{padding-top:16px}.reveal-show.celebrating p{font-size:clamp(18px,2vw,28px);margin-bottom:4px}.reveal-show.celebrating strong{font-size:clamp(36px,4vw,58px)}.reveal-show.celebrating small{font-size:14px;margin-top:4px}.reveal-ranking-stage .podium-grid{align-content:center;gap:20px}
.reveal-ranking-stage .podium-item{padding:clamp(16px,3vh,32px)}
@media(max-width:600px){.reveal-ranking-stage{inset:145px 12px 16px}.reveal-ranking-stage .section-head{margin-bottom:12px}.reveal-ranking-stage .section-copy{font-size:11px}}
@media(prefers-reduced-motion:reduce){.screen>*,.board>.board-card{transition:none!important}}
`;
  document.head.append(style);
  const overlay=document.createElement('div');overlay.className='reveal-show';overlay.hidden=true;overlay.innerHTML='<p></p><strong></strong><small>Za chwilę poznamy wyniki</small>';document.body.append(overlay);
  const titleEl=overlay.querySelector('p'),numberEl=overlay.querySelector('strong'),noteEl=overlay.querySelector('small');
  numberEl.classList.add('event-brand');
  let restoreFocus=()=>{},focus=null,advanceBusy=false,lastTap=0;
  const savedKey=p=>'award-presentation:'+String(scoreboardState.dataScope||'live')+':'+p.kind+':'+p.eventAt;
  function readProgress(p){try{const v=JSON.parse(sessionStorage.getItem(savedKey(p))||'null');if(v&&Number.isInteger(v.step)&&v.step>=0&&v.step<=4&&Number.isInteger(v.remote)&&v.remote>=0&&v.remote<=4)return v;}catch{}return {step:p.step,remote:p.step};}
  function saveProgress(p,value){try{sessionStorage.setItem(savedKey(p),JSON.stringify(value));}catch{}}
  function presentationItems(kind){return kind==='cities'?[...(scoreboardState.cityStats||[])].sort(GameRanking.compareCities).slice(0,3):[...(scoreboardState.leaderboard||[])].sort((a,b)=>Number(a.rank)-Number(b.rank)).slice(0,3);}
  function renderFocus(){if(!focus)return;const items=presentationItems(focus.kind),signature=JSON.stringify([focus.step,items]);if(signature===focus.signature)return;focus.signature=signature;
    const {card,step,kind}=focus;card.replaceChildren();card.classList.toggle('award-single',step>0);
    const title=document.createElement('h2');title.className='section-title';title.textContent=kind==='cities'?'Najlepsze placówki':'Najlepsi uczestnicy';card.append(title);
    const list=document.createElement('div');list.className='award-winners';
    const selected=step===0?items:items.slice(step-1,step);
    if(!selected.length){const empty=document.createElement('p');empty.textContent=step?'Brak laureata na tym miejscu.':'Brak wyników do pokazania.';list.append(empty);}
    selected.forEach((item,index)=>{const rank=step||index+1,row=document.createElement('article');row.className='award-winner';row.dataset.rank=rank;
      const badge=document.createElement('div');badge.className='award-place event-brand';badge.textContent=rank+'. miejsce';
      const name=document.createElement('div');name.className='award-name';name.textContent=kind==='cities'?item.city:item.name;
      const score=document.createElement('div');score.className='award-score event-brand';score.textContent=Number(item.score||0)+' pkt';
      row.append(badge,name,score);if(kind==='participants'&&item.city){const city=document.createElement('p');city.textContent=item.city;row.append(city);}list.append(row);});card.append(list);
    const next=document.createElement('button');next.type='button';next.className='award-next';next.textContent=step===3?'Dotknij, aby wrócić do całej tablicy':'Dotknij, aby pokazać '+(step+1)+'. miejsce';next.onclick=advance;card.append(next);
    if(!reduced.matches)list.animate([{opacity:.25,transform:'scale(.94)'},{opacity:1,transform:'scale(1)'}],{duration:650,easing:'ease-out'});
  }
  function syncPresentation(p){
    if(!p||!['ended','thanks'].includes(scoreboardState.phase)||Date.parse(p.eventAt)>Math.min(GameClock.now(),Date.parse(scoreboardState.serverNow))){restoreFocus();return;}
    let progress=readProgress(p);if(p.step>progress.remote){progress.step=Math.min(4,progress.step+p.step-progress.remote);progress.remote=p.step;saveProgress(p,progress);}
    if(progress.step>=4){restoreFocus();return;}
    const key=savedKey(p);if(!focus||focus.key!==key){restoreFocus();const target=document.querySelector(p.kind==='cities'?'#podium':'#leaderboard-list')?.closest('.board-card'),before=target?.getBoundingClientRect();
      const stage=document.createElement('div'),card=document.createElement('section');stage.className='reveal-ranking-stage';stage.setAttribute('aria-label','Prezentacja nagród');card.className='card board-card award-card';stage.append(card);document.body.append(stage);document.body.classList.add('reveal-ranking-focus');focus={key,kind:p.kind,step:progress.step,stage,card,p};
      restoreFocus=()=>{stage.remove();document.body.classList.remove('reveal-ranking-focus');focus=null;restoreFocus=()=>{};};
      renderFocus();if(before&&!reduced.matches){const after=card.getBoundingClientRect();card.animate([{transform:'translate('+(before.left-after.left)+'px,'+(before.top-after.top)+'px) scale('+(before.width/after.width)+','+(before.height/after.height)+')'},{transform:'none'}],{duration:1000,easing:'cubic-bezier(.2,.75,.2,1)'});}
    }else{focus.step=progress.step;focus.p=p;renderFocus();}
  }
  async function advance(){if(!focus||advanceBusy||performance.now()-lastTap<650)return;lastTap=performance.now();advanceBusy=true;const p={...focus.p},key=focus.key;
    try{const r=await fetch('/api/game-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'presentation-next',scope:scoreboardState.dataScope||'live',kind:p.kind,eventAt:p.eventAt,step:p.step})});
      if(r.ok){const d=await r.json();scoreboardState.presentation=d.presentation;syncPresentation(d.presentation);scheduleScoreboardRefresh(true);}
      else if(r.status===401){const progress=readProgress(p);progress.step=Math.min(4,progress.step+1);saveProgress(p,progress);if(focus?.key===key)syncPresentation(p);}
      else{scheduleScoreboardRefresh(true);}
    }catch{if(focus?.key===key){const note=focus.card.querySelector('.award-next');if(note)note.textContent='Brak połączenia. Dotknij, aby spróbować ponownie.';}}
    finally{advanceBusy=false;}
  }
  document.addEventListener('click',event=>{if(focus&&!event.target.closest('button,a,input,select,textarea'))advance();});
  let active=null,seen=new Set(),celebrationTimer=null,lastRefresh=0,stopEffects=()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function fireworks(){
    stopEffects();if(reduced.matches)return;
    const canvas=document.createElement('canvas');canvas.className='reveal-effects';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
    const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
    const colors=['#ff4089','#a174ff','#ffd66b','#b5ec7a','#ffffff'];
    let width=innerWidth,height=innerHeight,particles=[],rockets=[],halos=[],frame=0,last=performance.now(),start=last,nextBurst=0,nextConfetti=0,stopped=false;
    function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}
    resize();window.addEventListener('resize',resize);
    function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.remove();particles=[];rockets=[];halos=[];}
    stopEffects=stop;
    function burst(x,y,color){
      const scale=Math.min(1.6,Math.max(.7,Math.min(width,height)/700)),count=width<600?90:144;
      halos.push({x,y,color,life:.65,scale});
      for(let i=0;i<count;i++){const angle=Math.PI*2*i/count+Math.random()*.035,outer=i%3!==0,speed=(outer?240+Math.random()*160:90+Math.random()*100)*scale;particles.push({x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:2.2+Math.random()*1.2,max:3.4,color:outer?color:'#ffd66b',type:'spark',size:(1.8+Math.random()*1.8)*scale});}
    }
    function draw(now){
      const elapsed=now-start;if(elapsed>=30000||reduced.matches){stop();return;}
      const dt=Math.min((now-last)/1000,.04);last=now;ctx.clearRect(0,0,width,height);
      if(elapsed<27000&&elapsed>=nextBurst){nextBurst=elapsed+(elapsed>22000?850:1100);const salvo=width<600?2:3;for(let i=0;i<salvo;i++){const x=(.12+(i+Math.random()*.5)/salvo*.76)*width,target=(.17+Math.random()*.36)*height;rockets.push({x,y:height+10+i*height*.13,target,color:colors[Math.floor(Math.random()*colors.length)]});}}
      if(elapsed<25500&&elapsed>=nextConfetti){nextConfetti=elapsed+220;for(let i=0;i<12;i++)particles.push({x:Math.random()*width,y:-20,vx:(Math.random()-.5)*60,vy:height/4+Math.random()*70,life:4.5,max:4.5,color:colors[i%colors.length],type:'confetti',size:5+Math.random()*5,angle:Math.random()*6,spin:Math.random()*5-2.5});}
      for(const rocket of rockets){rocket.y-=height*dt;ctx.globalAlpha=.85;ctx.strokeStyle=rocket.color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(rocket.x,rocket.y+65);ctx.lineTo(rocket.x,rocket.y);ctx.stroke();if(rocket.y<=rocket.target){burst(rocket.x,rocket.target,rocket.color);rocket.done=true;}}
      rockets=rockets.filter(r=>!r.done);
      for(const halo of halos){halo.life-=dt;const t=1-halo.life/.65;ctx.globalAlpha=Math.max(0,halo.life/.65)*.35;ctx.strokeStyle=halo.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(halo.x,halo.y,Math.max(0,20+t*150*halo.scale),0,Math.PI*2);ctx.stroke();}
      halos=halos.filter(h=>h.life>0);
      for(const p of particles){p.life-=dt;p.px=p.x;p.py=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;ctx.globalAlpha=Math.min(1,p.life/.6);ctx.fillStyle=p.color;
        if(p.type==='spark'){p.vy+=55*dt;const drag=Math.pow(.985,dt*60);p.vx*=drag;p.vy*=drag;ctx.strokeStyle=p.color;ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x-p.vx*.055,p.y-p.vy*.055);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.globalAlpha*=.8;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p.x,p.y,p.size*.45,0,Math.PI*2);ctx.fill();}
        else{p.angle+=p.spin*dt;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*1.7);ctx.restore();}
      }
      particles=particles.filter(p=>p.life>0&&p.y<height+40);const limit=width<600?1100:1800;if(particles.length>limit)particles=particles.slice(-limit);ctx.globalAlpha=1;frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);
  }
  function celebrate(title,kind){
    syncPresentation(scoreboardState.presentation);
    overlay.classList.remove('counting');overlay.classList.add('celebrating');titleEl.textContent=title;numberEl.textContent='Brawo!';noteEl.textContent='Gratulujemy wszystkim uczestnikom';
    clearTimeout(celebrationTimer);celebrationTimer=setTimeout(()=>{overlay.hidden=true;},6000);fireworks();
  }
  function clearShow(){restoreFocus();active=null;seen.clear();overlay.hidden=true;overlay.classList.remove('counting','celebrating');clearTimeout(celebrationTimer);stopEffects();}
  setInterval(()=>{
    const reveal=scoreboardState.resultsReveal||{};
    const events=[['participants',reveal.participantsAt,'Najlepsi uczestnicy'],['cities',reveal.citiesAt,'Najlepsze placówki']].filter(e=>Number.isFinite(Date.parse(e[1])));
    if(!['ended','thanks'].includes(scoreboardState.phase)||!events.length){clearShow();return;}
    if(active&&!events.some(e=>e[0]+e[1]===active.key)){active=null;overlay.hidden=true;overlay.classList.remove('counting');}
    if(!active){
      syncPresentation(scoreboardState.presentation);
      const pending=events.find(e=>Date.parse(e[1])>GameClock.now()&&!seen.has(e[0]+e[1]));
      if(!pending)return;
      active={kind:pending[0],key:pending[0]+pending[1],time:Date.parse(pending[1]),title:pending[2]};clearTimeout(celebrationTimer);stopEffects();restoreFocus();overlay.classList.remove('celebrating');overlay.classList.add('counting');
    }
    overlay.hidden=false;titleEl.textContent=active.title;
    const seconds=Math.max(0,Math.ceil((active.time-GameClock.now())/1500)),text=String(seconds||'…');
    if(numberEl.textContent!==text){numberEl.textContent=text;if(!reduced.matches)numberEl.animate([{transform:'scale(.88)',opacity:.55},{transform:'scale(1)',opacity:1}],{duration:500,easing:'ease-out'});}
    noteEl.textContent=seconds?'Za chwilę poznamy wyniki':'Odsłaniamy wyniki';
    if(seconds===0){
      if(Date.parse(scoreboardState.serverNow)>=active.time){const title=active.title,kind=active.kind;seen.add(active.key);active=null;celebrate(title,kind);}
      else if(GameClock.now()-lastRefresh>1000){lastRefresh=GameClock.now();scheduleScoreboardRefresh(true);}
    }
  },100);
  window.addEventListener('pagehide',()=>{restoreFocus();stopEffects();clearTimeout(celebrationTimer);});
})();

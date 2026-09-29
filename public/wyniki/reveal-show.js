(() => {
  const style=document.createElement('style');
  style.textContent=`.reveal-show{position:fixed;inset:0;z-index:1000;display:grid;place-content:center;text-align:center;padding:24px;background:transparent;color:#fff;text-shadow:0 2px 5px #24133f,0 4px 18px #24133f,0 0 40px #24133f;pointer-events:none}.reveal-show[hidden]{display:none}.reveal-show.counting{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);background:#21113b20}.reveal-show p{font:800 clamp(22px,4vw,60px)/1.2 'Syne',sans-serif;margin:0 0 24px}.reveal-show strong{display:block;font:800 clamp(86px,22vh,280px)/1 'Syne',sans-serif;color:#ff6baa}.reveal-show small{font:700 clamp(16px,2vw,26px)/1.5 'Syne',sans-serif;margin-top:24px}.reveal-show.celebrating{place-content:start center;padding-top:28px}.reveal-show.celebrating p{font-size:clamp(18px,2.4vw,36px);margin-bottom:8px}.reveal-show.celebrating strong{font-size:clamp(36px,6vw,86px)}.reveal-show.celebrating small{font-size:clamp(14px,1.5vw,22px);margin-top:8px}.reveal-effects{position:fixed;inset:0;z-index:1001;pointer-events:none;width:100%;height:100%}@media(prefers-reduced-motion:reduce){.reveal-show.counting{backdrop-filter:none;-webkit-backdrop-filter:none}}`;
  document.head.append(style);
  const overlay=document.createElement('div');overlay.className='reveal-show';overlay.hidden=true;overlay.innerHTML='<p></p><strong></strong><small>Za chwilę poznamy wyniki</small>';document.body.append(overlay);
  const titleEl=overlay.querySelector('p'),numberEl=overlay.querySelector('strong'),noteEl=overlay.querySelector('small');
  let active=null,seen=new Set(),celebrationTimer=null,lastRefresh=0,stopEffects=()=>{};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function fireworks(){
    stopEffects();if(reduced.matches)return;
    const canvas=document.createElement('canvas');canvas.className='reveal-effects';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
    const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
    const colors=['#ff4089','#a174ff','#ffd66b','#b5ec7a','#ffffff'];
    let width=innerWidth,height=innerHeight,particles=[],rockets=[],frame=0,last=performance.now(),start=last,nextBurst=0,nextConfetti=0,stopped=false;
    function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);}
    resize();window.addEventListener('resize',resize);
    function stop(){if(stopped)return;stopped=true;cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.remove();particles=[];rockets=[];}
    stopEffects=stop;
    function burst(x,y,color){
      for(let i=0;i<64;i++){const angle=Math.PI*2*i/64,speed=50+Math.random()*150;particles.push({x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1.5+Math.random(),max:2.5,color,type:'spark',size:1.5+Math.random()*1.5});}
    }
    function draw(now){
      const elapsed=now-start;if(elapsed>=30000||reduced.matches){stop();return;}
      const dt=Math.min((now-last)/1000,.04);last=now;ctx.clearRect(0,0,width,height);
      if(elapsed<27000&&elapsed>=nextBurst){nextBurst=elapsed+650;const x=(.08+Math.random()*.84)*width,target=(.12+Math.random()*.45)*height;rockets.push({x,y:height+10,target,color:colors[Math.floor(Math.random()*colors.length)]});}
      if(elapsed<25500&&elapsed>=nextConfetti){nextConfetti=elapsed+220;for(let i=0;i<12;i++)particles.push({x:Math.random()*width,y:-20,vx:(Math.random()-.5)*60,vy:height/4+Math.random()*70,life:4.5,max:4.5,color:colors[i%colors.length],type:'confetti',size:5+Math.random()*5,angle:Math.random()*6,spin:Math.random()*5-2.5});}
      for(const rocket of rockets){rocket.y-=height*dt;ctx.globalAlpha=.85;ctx.strokeStyle=rocket.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(rocket.x,rocket.y+32);ctx.lineTo(rocket.x,rocket.y);ctx.stroke();if(rocket.y<=rocket.target){burst(rocket.x,rocket.target,rocket.color);rocket.done=true;}}
      rockets=rockets.filter(r=>!r.done);
      for(const p of particles){p.life-=dt;p.px=p.x;p.py=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;ctx.globalAlpha=Math.min(1,p.life/.6);ctx.fillStyle=p.color;
        if(p.type==='spark'){p.vy+=55*dt;p.vx*=Math.pow(.97,dt*60);ctx.strokeStyle=p.color;ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(p.x,p.y);ctx.stroke();}
        else{p.angle+=p.spin*dt;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*1.7);ctx.restore();}
      }
      particles=particles.filter(p=>p.life>0&&p.y<height+40);if(particles.length>1000)particles=particles.slice(-1000);ctx.globalAlpha=1;frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);
  }
  function celebrate(title){
    overlay.classList.remove('counting');overlay.classList.add('celebrating');titleEl.textContent=title;numberEl.textContent='Brawo!';noteEl.textContent='Gratulujemy wszystkim uczestnikom';
    clearTimeout(celebrationTimer);celebrationTimer=setTimeout(()=>{overlay.hidden=true;},6000);fireworks();
  }
  function clearShow(){active=null;seen.clear();overlay.hidden=true;overlay.classList.remove('counting','celebrating');clearTimeout(celebrationTimer);stopEffects();}
  setInterval(()=>{
    const reveal=scoreboardState.resultsReveal||{};
    const events=[['participants',reveal.participantsAt,'Najlepsi uczestnicy'],['cities',reveal.citiesAt,'Najlepsze placówki']].filter(e=>Number.isFinite(Date.parse(e[1])));
    if(!['ended','thanks'].includes(scoreboardState.phase)||!events.length){clearShow();return;}
    if(active&&!events.some(e=>e[0]+e[1]===active.key)){active=null;overlay.hidden=true;overlay.classList.remove('counting');}
    if(!active){
      const pending=events.find(e=>Date.parse(e[1])>GameClock.now()&&!seen.has(e[0]+e[1]));
      if(!pending)return;
      active={key:pending[0]+pending[1],time:Date.parse(pending[1]),title:pending[2]};clearTimeout(celebrationTimer);stopEffects();overlay.classList.remove('celebrating');overlay.classList.add('counting');
    }
    overlay.hidden=false;titleEl.textContent=active.title;
    const seconds=Math.max(0,Math.ceil((active.time-GameClock.now())/1500)),text=String(seconds||'…');
    if(numberEl.textContent!==text){numberEl.textContent=text;if(!reduced.matches)numberEl.animate([{transform:'scale(.88)',opacity:.55},{transform:'scale(1)',opacity:1}],{duration:500,easing:'ease-out'});}
    noteEl.textContent=seconds?'Za chwilę poznamy wyniki':'Odsłaniamy wyniki';
    if(seconds===0){
      if(Date.parse(scoreboardState.serverNow)>=active.time){const title=active.title;seen.add(active.key);active=null;celebrate(title);}
      else if(GameClock.now()-lastRefresh>1000){lastRefresh=GameClock.now();scheduleScoreboardRefresh(true);}
    }
  },100);
  window.addEventListener('pagehide',()=>{stopEffects();clearTimeout(celebrationTimer);});
})();

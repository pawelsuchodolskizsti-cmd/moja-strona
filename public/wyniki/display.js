// Slowly expose overflow on an unattended display. Manual interaction pauses it.
(() => {
  const states = new WeakMap();
  const selectors = '.sidebar-list,.city-grid,.list,.announcement-content,.hero-main';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let previous = performance.now();
  document.addEventListener('wheel', pause, {passive:true});
  document.addEventListener('touchstart', pause, {passive:true});
  document.addEventListener('keydown', pause);
  function pause(event) {
    const element = event.target.closest?.(selectors);
    if (element) states.set(element, {until:performance.now()+20000,position:element.scrollTop});
  }
  setInterval(() => {
    const now = performance.now(), elapsed = Math.min(now-previous,100);
    previous = now;
    if (document.hidden || reduceMotion.matches || innerWidth < 1100 || innerHeight < 650) return;
    document.querySelectorAll(selectors).forEach(element => {
      const max = element.scrollHeight-element.clientHeight;
      if (max <= 2 || !element.clientHeight) { states.delete(element); return; }
      let state = states.get(element);
      if (!state) { state={until:now+6000,position:element.scrollTop}; states.set(element,state); }
      if (element.matches(':hover') || element.contains(document.activeElement)) { state.until=now+4000; return; }
      if (now < state.until) return;
      if (state.restart) { element.scrollTop=0; state.position=0;state.restart=false;state.until=now+6000;return; }
      state.position=Math.min(max,state.position+elapsed*.022);
      element.scrollTop=state.position;
      if (state.position>=max) {state.restart=true;state.until=now+6000;}
    });
  },50);
})();

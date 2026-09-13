(() => {
  const root=document.getElementById('social-posts');
  if(!root)return;
  const posts=(window.OneDayPosts||[]).filter(post=>!post.hidden&&post.image&&post.url);
  if(!posts.length)return;
  const viewport=root.querySelector('.posts-viewport'),track=root.querySelector('.posts-track');
  const group=document.createElement('div');group.className='posts-group';group.setAttribute('role','list');
  for(const post of posts){
    const card=document.createElement('article');card.className='post-card';card.dataset.postId=post.id;card.setAttribute('role','listitem');
    const link=document.createElement('a');link.className='post-link';link.href=post.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',post.caption+' — otwórz post na Instagramie (nowa karta)');
    const frame=document.createElement('div');frame.className='post-image-frame';
    const image=document.createElement('img');image.className='post-image';image.src='/social-posts/'+post.image;image.alt=post.caption;image.width=210;image.height=210;image.decoding='async';image.draggable=false;
    const fallback=document.createElement('span');fallback.className='post-image-fallback';fallback.textContent='Zobacz post na Instagramie';
    frame.append(image,fallback);const caption=document.createElement('span');caption.className='post-caption';caption.textContent=post.caption;
    link.append(frame,caption);card.append(link);group.append(card);
  }
  track.append(group);
  const clone=group.cloneNode(true);clone.dataset.postsClone='';clone.setAttribute('aria-hidden','true');clone.removeAttribute('role');clone.querySelectorAll('a').forEach(link=>link.tabIndex=-1);track.append(clone);
  track.querySelectorAll('img').forEach(img=>{const failed=()=>img.parentElement.classList.add('image-unavailable');img.addEventListener('error',failed);if(img.complete&&!img.naturalWidth)failed();});
  root.hidden=false;
  const pauseButton=root.querySelector('[data-posts-pause]'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=false,hovered=false,visible=false,pointerDown=false,resumeAt=0,last=0,position=0;
  function updatePause(){pauseButton.textContent=paused?'▶':'Ⅱ';pauseButton.setAttribute('aria-label',paused?'Wznów przesuwanie postów':'Zatrzymaj przesuwanie postów');pauseButton.setAttribute('aria-pressed',String(paused));pauseButton.hidden=reduced.matches;}
  pauseButton.onclick=()=>{paused=!paused;updatePause();};reduced.addEventListener('change',updatePause);updatePause();
  const hold=()=>{resumeAt=performance.now()+6000;position=viewport.scrollLeft;};
  viewport.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')hovered=true;});viewport.addEventListener('pointerleave',()=>{hovered=false;});
  viewport.addEventListener('pointerdown',()=>{pointerDown=true;hold();});window.addEventListener('pointerup',()=>{if(pointerDown){pointerDown=false;hold();}});window.addEventListener('pointercancel',()=>{pointerDown=false;hold();});
  viewport.addEventListener('wheel',hold,{passive:true});viewport.addEventListener('touchend',hold,{passive:true});viewport.addEventListener('keydown',hold);
  for(const [selector,direction]of [['[data-posts-prev]',-1],['[data-posts-next]',1]])root.querySelector(selector).onclick=()=>{
    const width=group.getBoundingClientRect().width,step=group.firstElementChild.getBoundingClientRect().width+12;
    if(!width)return;position=(viewport.scrollLeft+direction*step+width)%width;viewport.scrollLeft=position;hold();
  };
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;last=0;},{threshold:.05}).observe(root);
  function tick(now){
    const delta=last?Math.min(now-last,60):0;last=now;
    if(visible&&!document.hidden&&!paused&&!reduced.matches&&!hovered&&!pointerDown&&now>=resumeAt&&!viewport.contains(document.activeElement)){
      const width=group.getBoundingClientRect().width;
      if(width){if(Math.abs(viewport.scrollLeft-position)>2)position=viewport.scrollLeft;position=(position+delta*.023)%width;viewport.scrollLeft=position;}
    } else position=viewport.scrollLeft;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

(() => {
  const $=id=>document.getElementById(id),node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  let page=0,cursors=[0],busy=false;
  async function load(){
    if(busy)return;busy=true;$('feedback-prev').disabled=true;$('feedback-next').disabled=true;$('feedback-status').textContent='Ładowanie…';
    try{const response=await AdminSession.fetch('/api/admin-feedback?before='+cursors[page],{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się wczytać opinii.');
      $('feedback-summary').textContent=`Liczba opinii: ${data.summary.count}. Średnia ocena: ${data.summary.average||'-'} / 5`;$('feedback-list').replaceChildren();
      for(const item of data.items){const card=node('article','');card.className='contact-card';card.append(node('h2',`${'★'.repeat(item.rating)} (${item.rating}/5)`),node('p','Zapisano: '+new Date(item.updated_at).toLocaleString('pl-PL')));if(item.round_started_at)card.append(node('p','Runda: '+new Date(item.round_started_at).toLocaleString('pl-PL')));card.append(node('h3','Co się podobało'),node('pre',item.liked||'Brak opisu'),node('h3','Co możemy poprawić'),node('pre',item.improvements||'Brak opisu'));$('feedback-list').append(card);}
      $('feedback-status').textContent=data.items.length?'':'Brak opinii.';$('feedback-page').textContent='Strona '+(page+1);$('feedback-next').disabled=!data.before;$('feedback-next').onclick=()=>{cursors[++page]=data.before;load();};
    }catch(e){$('feedback-status').textContent=e.message;}finally{busy=false;$('feedback-prev').disabled=page===0;}
  }
  $('feedback-prev').onclick=()=>{page=Math.max(0,page-1);load();};$('feedback-refresh').onclick=()=>{if(busy)return;page=0;cursors=[0];load();};
  (async()=>{try{if(!await AdminSession.check()){AdminSession.redirect();return;}AdminNavigation.mountAux('feedback');await load();ViewLoading.finish();}catch(e){ViewLoading.error(e.message);}})();
})();

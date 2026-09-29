(() => {
  const $=id=>document.getElementById(id),node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  let page=0,cursors=[0],busy=false;
  async function load(){
    if(busy)return;busy=true;$('feedback-prev').disabled=true;$('feedback-next').disabled=true;$('feedback-status').textContent='Ładowanie…';
    try{const response=await AdminSession.fetch('/api/admin-feedback?before='+cursors[page],{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się wczytać opinii.');
      $('feedback-summary').textContent=`Liczba opinii: ${data.summary.count}. Średnia ocena: ${data.summary.average||'-'} / 5`;$('feedback-list').replaceChildren();
      if(data.items.length){
        const table=node('table','');table.className='feedback-table';
        const head=node('thead',''),header=node('tr','');
        for(const title of ['Ocena','Zapisano','Runda','Co się podobało','Co możemy poprawić']){const th=node('th',title);th.scope='col';header.append(th);}
        head.append(header);table.append(head);const body=node('tbody','');
        for(const item of data.items){
          const row=node('tr','');
          for(const value of [`${'★'.repeat(item.rating)} (${item.rating}/5)`,new Date(item.updated_at).toLocaleString('pl-PL'),item.round_started_at?new Date(item.round_started_at).toLocaleString('pl-PL'):'-',item.liked||'Brak opisu',item.improvements||'Brak opisu'])row.append(node('td',value));
          body.append(row);
        }
        table.append(body);$('feedback-list').append(table);
      }
      $('feedback-status').textContent=data.items.length?'':'Brak opinii.';$('feedback-page').textContent='Strona '+(page+1);$('feedback-next').disabled=!data.before;$('feedback-next').onclick=()=>{cursors[++page]=data.before;load();};
    }catch(e){$('feedback-status').textContent=e.message;}finally{busy=false;$('feedback-prev').disabled=page===0;}
  }
  $('feedback-prev').onclick=()=>{page=Math.max(0,page-1);load();};$('feedback-refresh').onclick=()=>{if(busy)return;page=0;cursors=[0];load();};
  (async()=>{try{if(!await AdminSession.check()){AdminSession.redirect();return;}AdminNavigation.mountAux('feedback');await load();ViewLoading.finish();}catch(e){ViewLoading.error(e.message);}})();
})();

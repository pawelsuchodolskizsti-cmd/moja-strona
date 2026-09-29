(() => {
  const dialog=document.createElement('dialog');
  dialog.className='player-help-dialog';dialog.setAttribute('aria-labelledby','player-help-title');dialog.setAttribute('aria-describedby','player-help-copy');
  dialog.innerHTML='<h2 id="player-help-title">Potrzebujesz pomocy technicznej?</h2><p id="player-help-copy">Zgłoś się do teatru. Pomożemy Ci wrócić do gry.</p><form method="dialog"><button class="player-help-close" autofocus>Rozumiem</button></form>';
  document.body.append(dialog);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  for(const screen of document.querySelectorAll('body > .card')){
    if(screen.id==='login-screen')continue;
    const row=document.createElement('div');row.className='player-help-row';
    const button=document.createElement('button');button.type='button';button.className='player-help-button';button.textContent='?';button.setAttribute('aria-label','Pomoc techniczna');button.setAttribute('aria-haspopup','dialog');
    button.onclick=()=>dialog.showModal();row.append(button);screen.prepend(row);
  }
})();

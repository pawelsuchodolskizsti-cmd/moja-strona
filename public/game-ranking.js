(function(root) {
  function compareParticipants(a,b) {
    const time = v => v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER;
    return Number(b.score||0)-Number(a.score||0) || Number(b.answeredCount||0)-Number(a.answeredCount||0)
      || time(a.scoreAt || a.createdAt)-time(b.scoreAt || b.createdAt) || Number(a.id||0)-Number(b.id||0);
  }
  function compareCities(a,b) { return Number(b.score||0)-Number(a.score||0) || Number(b.participants||0)-Number(a.participants||0) || String(a.city||'').localeCompare(String(b.city||''),'pl'); }
  const api={compareParticipants,compareCities};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.GameRanking=api;
})(typeof window!=='undefined'?window:globalThis);

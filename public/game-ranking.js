(function(root) {
  function compareParticipants(a,b) {
    const time = v => v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER;
    return Number(b.score||0)-Number(a.score||0) || Number(b.answeredCount||0)-Number(a.answeredCount||0)
      || time(a.scoreAt || a.createdAt)-time(b.scoreAt || b.createdAt) || Number(a.id||0)-Number(b.id||0);
  }
  function compareCities(a,b) { return Number(b.score||0)-Number(a.score||0) || Number(b.participants||0)-Number(a.participants||0) || String(a.city||'').localeCompare(String(b.city||''),'pl'); }
  function institutionStats(participants) {
    const groups = new Map();
    for (const p of participants) {
      const label=String(p.city||'Nieprzypisana placówka');
      const key=p.institutionId ? 'institution:'+p.institutionId : 'legacy:'+label;
      const group=groups.get(key)||{institutionId:p.institutionId||null,city:label,score:0,participants:0,answers:0};
      group.score+=Number(p.score||0);group.participants++;group.answers+=Number(p.answeredCount||0);groups.set(key,group);
    }
    return [...groups.values()].sort(compareCities);
  }
  const api={compareParticipants,compareCities,institutionStats};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  else root.GameRanking=api;
})(typeof window!=='undefined'?window:globalThis);

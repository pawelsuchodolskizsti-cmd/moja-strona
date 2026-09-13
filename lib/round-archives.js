const crypto=require('node:crypto');
/* Executed inside the same exclusive transaction as reset/start: failed archival prevents deletion. */
function archiveQuery(sql,scope,reason,{once=false,endedOnly=false}={}){
 const batch=once?reason:crypto.randomUUID();
 return sql`WITH rounds AS (
   SELECT DISTINCT game_started_at AS started FROM participants WHERE scope=${scope}
   UNION SELECT round_started_at FROM game_state WHERE scope=${scope} AND round_started_at IS NOT NULL
 ), captured AS (
   INSERT INTO round_archives(archive_key,scope,round_started_at,reason,game_state,counts)
   SELECT ${scope}||':'||COALESCE(r.started::text,'legacy')||':'||${batch},${scope},r.started,${reason},
     COALESCE((SELECT to_jsonb(g) FROM game_state g WHERE g.scope=${scope} AND g.round_started_at IS NOT DISTINCT FROM r.started),'{}'::jsonb),
     jsonb_build_object('participants',(SELECT COUNT(*) FROM participants p WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM r.started),
       'answers',(SELECT COUNT(*) FROM answers a JOIN participants p ON p.id=a.participant_id WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM r.started),
       'bonuses',(SELECT COUNT(*) FROM bonus_redemptions b JOIN participants p ON p.id=b.participant_id WHERE p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM r.started))
   FROM rounds r WHERE NOT ${endedOnly} OR EXISTS(SELECT 1 FROM game_state g WHERE g.scope=${scope} AND g.round_started_at=r.started AND (g.ended_at IS NOT NULL OR g.started_at IS NOT NULL AND NOW()>=g.started_at+g.duration_minutes*INTERVAL '1 minute'))
   ON CONFLICT(archive_key) DO NOTHING RETURNING id,round_started_at
 ) INSERT INTO round_archive_items(archive_id,kind,item_id,data)
 SELECT c.id,'participants',p.id::text,to_jsonb(p)-'device_token' FROM captured c JOIN participants p ON p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM c.round_started_at
 UNION ALL SELECT c.id,'answers',a.id::text,to_jsonb(a) FROM captured c JOIN participants p ON p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM c.round_started_at JOIN answers a ON a.participant_id=p.id
 UNION ALL SELECT c.id,'bonuses',b.id::text,to_jsonb(b) FROM captured c JOIN participants p ON p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM c.round_started_at JOIN bonus_redemptions b ON b.participant_id=p.id
 UNION ALL SELECT c.id,'questionOpens',o.id::text,to_jsonb(o) FROM captured c JOIN participants p ON p.scope=${scope} AND p.game_started_at IS NOT DISTINCT FROM c.round_started_at JOIN question_opens o ON o.participant_id=p.id
 UNION ALL SELECT c.id,'questions',q.id::text,to_jsonb(q) FROM captured c CROSS JOIN questions_catalog q
 UNION ALL SELECT c.id,'bonusCatalog',b.id,to_jsonb(b) FROM captured c CROSS JOIN bonus_catalog b
 UNION ALL SELECT c.id,'institutions',i.id::text,to_jsonb(i) FROM captured c CROSS JOIN institutions i`;
}
module.exports={archiveQuery};

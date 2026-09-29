const {neon}=require('@neondatabase/serverless');
const {withApi,json}=require('../api-guard');
const {ensureTransfer,hash}=require('../session-transfer');
const {transaction}=require('../transactions');
exports.handler=withApi('session-transfer',async event=>{
  const {action,transferToken,deviceToken}=event.payload;
  if(!['check','claim'].includes(action)||typeof transferToken!=='string'||!/^[a-f0-9]{64}$/.test(transferToken))return json(400,{error:'Nieprawidłowy link przeniesienia konta.'});
  const sql=neon(process.env.DATABASE_URL);await ensureTransfer(sql);const tokenHash=hash(transferToken);
  const [transfer]=await sql`SELECT t.participant_id,t.expires_at,t.used_at,t.claimed_device_hash,p.first_name,p.game_started_at,p.device_token
    FROM session_transfers t JOIN participants p ON p.id=t.participant_id AND p.scope='live' JOIN game_state g ON g.scope=p.scope AND g.round_started_at=t.round_started_at AND p.game_started_at=t.round_started_at
    WHERE t.token_hash=${tokenHash}`;
  if(!transfer||Date.parse(transfer.expires_at)<=Date.now())return json(410,{error:'Link wygasł lub został zastąpiony. Poproś organizatora w teatrze o nowy link.'});
  if(action==='check')return transfer.used_at?json(410,{error:'Ten link został już wykorzystany.'}):json(200,{ok:true,firstName:transfer.first_name,expiresAt:transfer.expires_at});
  if(typeof deviceToken!=='string'||!/^[a-f0-9]{64}$/.test(deviceToken))return json(400,{error:'Nie udało się przygotować nowej sesji.'});
  const deviceHash=hash(deviceToken);
  if(transfer.used_at){
    if(transfer.claimed_device_hash===deviceHash&&transfer.device_token===deviceToken)return json(200,{ok:true,participantId:transfer.participant_id,gameStartedAt:transfer.game_started_at});
    return json(410,{error:'Ten link został już wykorzystany.'});
  }
  const [rows]=await transaction(sql,[sql`WITH claimed AS (
    UPDATE session_transfers t SET used_at=NOW(),claimed_device_hash=${deviceHash}
    WHERE t.token_hash=${tokenHash} AND t.used_at IS NULL AND t.expires_at>NOW()
      AND EXISTS(SELECT 1 FROM participants p JOIN game_state g ON g.scope=p.scope AND g.round_started_at=p.game_started_at WHERE p.id=t.participant_id AND p.scope='live' AND p.game_started_at=t.round_started_at)
      AND NOT EXISTS(SELECT 1 FROM participants WHERE device_token=${deviceToken} AND id<>${transfer.participant_id})
    RETURNING t.participant_id
  ) UPDATE participants p SET device_token=${deviceToken},last_ip=NULL,last_user_agent=NULL,current_question_id=NULL,current_question_opened_at=NULL
    FROM claimed c WHERE p.id=c.participant_id RETURNING p.id,p.game_started_at`],{participantId:transfer.participant_id,deviceToken});
  if(!rows.length)return json(410,{error:'Link nie jest już dostępny. Sprawdź, czy konto zostało przeniesione, lub poproś organizatora o nowy link.'});
  return json(200,{ok:true,participantId:rows[0].id,gameStartedAt:rows[0].game_started_at});
});

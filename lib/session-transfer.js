const crypto=require('node:crypto');
const {migrate}=require('./schema-migrations');
const {transaction}=require('./transactions');
let ready;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function ensureTransfer(sql){
  if(!ready)ready=migrate(sql,'session-transfer',1,async q=>{
    q`CREATE TABLE IF NOT EXISTS session_transfers(participant_id INTEGER PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,round_started_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,claimed_device_hash TEXT)`;
  }).catch(e=>{ready=null;throw e;});await ready;
}
async function issueTransfer(sql,participantId){
  await ensureTransfer(sql);const token=crypto.randomBytes(32).toString('hex');
  const [rows]=await transaction(sql,[sql`INSERT INTO session_transfers(participant_id,token_hash,round_started_at,expires_at)
    SELECT p.id,${hash(token)},p.game_started_at,NOW()+INTERVAL '15 minutes' FROM participants p JOIN game_state g ON g.scope=p.scope AND g.round_started_at=p.game_started_at WHERE p.id=${participantId} AND p.scope='live'
    ON CONFLICT(participant_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,round_started_at=EXCLUDED.round_started_at,expires_at=EXCLUDED.expires_at,used_at=NULL,claimed_device_hash=NULL RETURNING expires_at`],{participantId});
  return rows.length?{ok:true,transferPath:'/przenies-konto/#'+token,expiresAt:rows[0].expires_at}:null;
}
module.exports={ensureTransfer,issueTransfer,hash};

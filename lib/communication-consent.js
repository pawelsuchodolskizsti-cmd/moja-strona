const crypto=require('node:crypto');
const {migrate}=require('./schema-migrations');
const policy=require('../public/communication-policy');
let ready;
function hash(token){return crypto.createHash('sha256').update(token).digest('hex');}
function validToken(token){return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);}
async function ensureCommunicationSchema(sql){
  if(!ready)ready=migrate(sql,'communication-consent',1,async q=>{
    // Independent of participants: resetting a round must not erase contact choices.
    q`CREATE TABLE IF NOT EXISTS communication_consents (
      id BIGSERIAL PRIMARY KEY,participant_id INTEGER NOT NULL UNIQUE,
      first_name TEXT NOT NULL,last_name TEXT NOT NULL,institution_id INTEGER NOT NULL,institution_label TEXT NOT NULL,email TEXT NOT NULL,
      consent_version TEXT NOT NULL,consent_text TEXT NOT NULL,consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      age_declaration TEXT NOT NULL CHECK(age_declaration IN ('adult','guardian_required')),
      status TEXT NOT NULL CHECK(status IN ('draft','pending_guardian','active','withdrawn')),
      manage_token_hash TEXT NOT NULL,withdrawn_at TIMESTAMPTZ,source TEXT NOT NULL DEFAULT 'player-registration')`;
    q`CREATE INDEX IF NOT EXISTS communication_consents_manage ON communication_consents(manage_token_hash)`;
    q`CREATE INDEX IF NOT EXISTS communication_consents_status ON communication_consents(status,id DESC)`;
  }).catch(e=>{ready=null;throw e;});
  await ready;
}
function validateChoice(body){
  if(body.communicationConsent!==undefined&&typeof body.communicationConsent!=='boolean')return 'Nieprawidłowa wartość zgody na kontakt.';
  if(body.communicationConsent!==true)return null;
  if(body.communicationConsentVersion!==policy.version)return 'Treść zgody została zaktualizowana. Odśwież stronę i zapoznaj się z aktualnymi zasadami kontaktu.';
  if(!validToken(body.communicationToken))return 'Nie udało się przygotować zapisu zgody. Spróbuj ponownie.';
  if(!['adult','guardian_required'].includes(body.communicationAge))return 'Wybierz informację o pełnoletności przy dobrowolnej zgodzie lub pozostaw zgodę niezaznaczoną.';
  return null;
}
function consentQuery(sql,{firstName,lastName,institutionId,email,deviceToken,body}){
  const status=policy.draft?'draft':body.communicationAge==='adult'?'active':'pending_guardian';
  return sql`INSERT INTO communication_consents(participant_id,first_name,last_name,institution_id,institution_label,email,consent_version,consent_text,age_declaration,status,manage_token_hash)
    SELECT p.id,p.first_name,p.last_name,p.institution_id,i.name||' - '||i.city,p.email,${policy.version},${policy.text},${body.communicationAge},${status},${hash(body.communicationToken)}
    FROM participants p JOIN institutions i ON i.id=p.institution_id JOIN game_state g ON g.scope=p.scope AND g.started_at=p.game_started_at
    WHERE p.scope='live' AND p.device_token=${deviceToken} AND p.first_name=${firstName} AND p.last_name=${lastName} AND p.institution_id=${institutionId} AND p.email=${email}
      AND NOW()<g.started_at+g.duration_minutes*INTERVAL '1 minute' AND NOT g.technical_pause_active
    ON CONFLICT(participant_id) DO NOTHING`;
}
module.exports={policy,hash,validToken,ensureCommunicationSchema,validateChoice,consentQuery};

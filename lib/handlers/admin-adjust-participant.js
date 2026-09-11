const {neon}=require('@neondatabase/serverless');
const {ensureScoringSchema}=require('../db-schema');
const {getBonusById}=require('../bonus-catalog');
const {withApi,json}=require('../api-guard');
const {transaction}=require('../transactions');
const {scoreQuery}=require('../scoring');
exports.handler=withApi('admin-adjust-participant',async event=>{
  const {participantId,action,bonusId}=event.payload;
  if(!participantId||!action)return json(400,{error:'Brakuje danych do korekty.'});
  if(!['add-point','remove-point','release-device','add-bonus','remove-bonus'].includes(action))return json(400,{error:'Nieznana akcja korekty.'});
  const sql=neon(process.env.DATABASE_URL);await ensureScoringSchema(sql);
  const [p]=await sql`SELECT id,scope FROM participants WHERE id=${participantId}`;
  if(!p)return json(404,{error:'Nie znaleziono uczestnika.'});
  const scope=p.scope;let change;let message;
  if(action==='add-point'||action==='remove-point') {
    const delta=action==='add-point'?1:-1;
    change=sql`UPDATE participants SET manual_score_adjustment=COALESCE(manual_score_adjustment,0)+CASE WHEN ${delta}<0 AND score<=0 THEN 0 ELSE ${delta} END,last_activity=NOW() WHERE id=${participantId} RETURNING id`;
    message=delta>0?'Dodano 1 punkt.':'Odjęto 1 punkt.';
  } else if(action==='release-device') {
    change=sql`UPDATE participants SET device_token=NULL,last_ip=NULL,last_user_agent=NULL,current_question_id=NULL,current_question_opened_at=NULL,last_activity=NOW() WHERE id=${participantId} RETURNING id`;
    message='Uczestnik może teraz zalogować się ponownie na nowym urządzeniu z tymi samymi danymi i adresem e-mail.';
  } else {
    const bonus=await getBonusById(sql,bonusId);
    if(!bonus)return json(400,{error:'Wybierz poprawny bonus.'});
    change=action==='add-bonus'
      ?sql`INSERT INTO bonus_redemptions(scope,participant_id,bonus_id) VALUES(${scope},${participantId},${bonusId}) ON CONFLICT(participant_id,bonus_id) DO NOTHING RETURNING id`
      :sql`DELETE FROM bonus_redemptions WHERE participant_id=${participantId} AND bonus_id=${bonusId} AND scope=${scope} RETURNING id`;
    message=action==='add-bonus'?`Dodano bonus ${bonus.label}.`:`Usunięto bonus ${bonus.label}.`;
  }
  const [changed]=await transaction(sql,[change,scoreQuery(sql,participantId)],{participantId});
  if(!changed.length)return json(200,{ok:false,error:action==='add-bonus'?'Ten bonus jest już przypisany do uczestnika.':'Ten bonus nie jest przypisany do uczestnika.'});
  return json(200,{ok:true,message});
});

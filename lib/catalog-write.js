const {transaction}=require('./transactions');
const {scoreQuery}=require('./scoring');
const {ensureScoringSchema}=require('./db-schema');
function invalid(message){const e=new Error(message);e.statusCode=400;throw e;}
async function saveCatalog(sql,payload){
  await ensureScoringSchema(sql);await require('./operations-schema').ensureOperationsSchema(sql);
  const queries=[];
  if(payload.questions || payload.question || payload.questionCount!==undefined){
    const {getQuestionCatalog,parseAnswers,MAX_QUESTION_COUNT}=require('./question-catalog');
    const existing=await getQuestionCatalog(sql,{includeInactive:true});
    const input=payload.questions||payload.question||[];const raw=Array.isArray(input)?input:[input];
    const count=payload.questionCount===undefined?existing.filter(q=>q.active).length:Number(payload.questionCount);
    if(!Number.isInteger(count)||count<1||count>MAX_QUESTION_COUNT)invalid(`Liczba pytań musi wynosić od 1 do ${MAX_QUESTION_COUNT}.`);
    const ids=new Set();const items=[];
    for(const item of raw){
      const id=Number(item?.id);
      if(!Number.isInteger(id)||id<1||id>count||ids.has(id))invalid('Nieprawidłowy lub powtórzony numer pytania.');
      ids.add(id);const text=String(item.text||'').trim(),answers=parseAnswers(item.answers);
      if(!text||!answers.length)invalid(`Pytanie ${id} musi mieć treść i co najmniej jedną poprawną odpowiedź.`);
      if(text.length>4000||answers.some(a=>a.length>4000))invalid('Treść pytania lub odpowiedzi jest zbyt długa.');
      items.push({id,text,answers});
    }
    for(let id=1;id<=count;id++)if(!ids.has(id)&&!existing.find(q=>q.id===id&&q.text&&q.answers.length))invalid(`Uzupełnij pytanie ${id}.`);
    queries.push(sql`UPDATE questions_catalog SET active=id<=${count},updated_at=NOW() WHERE id>=1`);
    for(const item of items){
      queries.push(sql`INSERT INTO questions_catalog(id,text,answers,active,updated_at) VALUES(${item.id},${item.text},${JSON.stringify(item.answers)}::jsonb,TRUE,NOW())
        ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text,answers=EXCLUDED.answers,active=TRUE,updated_at=NOW()`);
      queries.push(sql`UPDATE answers a SET correct=EXISTS(SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(item.answers)}::jsonb) accepted(value)
        WHERE regexp_replace(normalize(lower(btrim(accepted.value)),NFD),'[̀-ͯ]','','g')=regexp_replace(normalize(lower(btrim(a.answer)),NFD),'[̀-ͯ]','','g')) WHERE a.question_id=${item.id}`);
    }
  }
  if(payload.bonuses||payload.bonus){
    const input=payload.bonuses||payload.bonus;const items=Array.isArray(input)?input:[input];
    const known=new Set(require('./bonus-codes-data').BONUS_CODES.map(b=>b.id));const ids=new Set();
    for(const [index,item] of items.entries()){
      const id=String(item?.id||'').trim(),label=String(item?.label||'').trim(),secret=String(item?.secret||'').trim();
      if(!known.has(id)||ids.has(id)||!label||!secret)invalid('Każdy bonus musi mieć poprawny identyfikator, nazwę i hasło.');
      if(label.length>256||secret.length>256)invalid('Nazwa lub hasło bonusu jest zbyt długie.');ids.add(id);
      const sortOrder=Number(item.sortOrder||index+1);if(!Number.isInteger(sortOrder))invalid('Nieprawidłowa kolejność bonusu.');
      queries.push(sql`INSERT INTO bonus_catalog(id,label,secret,active,sort_order,updated_at) VALUES(${id},${label},${secret},${item.active!==false},${sortOrder},NOW())
        ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,secret=EXCLUDED.secret,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,updated_at=NOW()`);
    }
  }
  if(!queries.length)invalid('Brak danych do zapisania.');
  queries.unshift(require('./round-archives').archiveQuery(sql,'live','catalog-change'),require('./round-archives').archiveQuery(sql,'test','catalog-change'));
  queries.push(scoreQuery(sql));await transaction(sql,queries,{exclusive:true});
}
module.exports={saveCatalog};

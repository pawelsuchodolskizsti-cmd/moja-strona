/* Fetch only the currently inspected page. All records remain in the same database. */
const recordPages={answers:{stack:[0],index:0,key:'',version:0},bonuses:{stack:[0],index:0,key:'',version:0}};
async function readAdminRecords(params){
 const response=await AdminSession.fetch('/api/admin-records?'+new URLSearchParams(params),{cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Nie udało się pobrać danych.');return data;
}
function recordParams(kind){
 const ids=kind==='answers'?{search:'search-ans',question:'filter-question',city:'filter-city',correct:'filter-correct'}:{search:'search-bonuses',bonus:'filter-bonus-id',city:'filter-bonus-city'};
 const p={kind,scope:activeDataScope};if(adminRound)p.round=adminRound;
 for(const [key,id]of Object.entries(ids)){const value=document.getElementById(id).value;if(value&&value!=='all')p[key]=value;}
 return p;
}
function renderAnswers(){scheduleRecordPage('answers');}
function renderBonuses(){scheduleRecordPage('bonuses');}
function scheduleRecordPage(kind){const state=recordPages[kind];clearTimeout(state.timer);state.timer=setTimeout(()=>loadRecordPage(kind),180);}
async function loadRecordPage(kind){
 const params=recordParams(kind),key=JSON.stringify(params),state=recordPages[kind];
 if(state.key!==key){state.key=key;state.index=0;state.stack=[0];}
 const version=++state.version;params.before=state.stack[state.index];
 const root=document.getElementById(kind==='answers'?'tab-answers':'tab-bonuses');
 let controls=document.getElementById(kind+'-pagination');
 if(!controls){controls=document.createElement('div');controls.id=kind+'-pagination';controls.className='record-pagination';controls.setAttribute('role','status');root.append(controls);}
 try{
  const data=await readAdminRecords(params);
  if(version!==state.version||key!==JSON.stringify(recordParams(kind)))return;
  if(kind==='answers'){allAnswers=data.items;renderAnswerRows();}else{allBonuses=data.items;renderBonusRows();document.getElementById('bonus-meta').textContent=`Odebrane bonusy: ${adminTotals.bonuses}. Lista poniżej uwzględnia wybrane filtry.`;}
  controls.replaceChildren();
  const previous=document.createElement('button');previous.type='button';previous.className='btn outline';previous.textContent='Poprzednie';previous.disabled=state.index===0;previous.onclick=()=>{state.index--;loadRecordPage(kind);};
  const next=document.createElement('button');next.type='button';next.className='btn outline';next.textContent='Następne';next.disabled=!data.before;next.onclick=()=>{state.stack[++state.index]=data.before;loadRecordPage(kind);};
  const caption=document.createElement('span');caption.textContent=`Strona ${state.index+1} · ${data.items.length} wpisów`;
  controls.append(previous,caption,next);
 }catch(e){if(version===state.version){controls.textContent=e.message;const retry=document.createElement('button');retry.type='button';retry.className='btn outline';retry.textContent='Ponów';retry.onclick=()=>loadRecordPage(kind);controls.append(retry);}}
}
let participantRequest=0;
async function openParticipantModal(id){
 if(!allParticipants.some(p=>Number(p.id)===Number(id)))return;
 const version=++participantRequest,scope=activeDataScope,round=adminRound;
 currentParticipantId=Number(id);
 document.getElementById('participant-modal-name').textContent='Wczytujemy szczegóły…';
 document.getElementById('participant-modal-answers').textContent='';document.getElementById('participant-modal-bonuses').textContent='';
 document.getElementById('participant-modal').classList.add('show');setParticipantAdjustBusy(true);
 try{
  async function all(kind){let before=0,items=[];do{const d=await readAdminRecords({kind,scope,...(round?{round}:{}),participantId:id,before});items.push(...d.items);before=d.before;}while(before);return items;}
  const [answers,bonuses]=await Promise.all([all('answers'),all('bonuses')]);
  if(version!==participantRequest||currentParticipantId!==Number(id)||activeDataScope!==scope||adminRound!==round)return;
  participantDetails={answers,bonuses};renderParticipantModal(id);
 }catch(e){if(version===participantRequest)setParticipantAdjustFeedback(e.message,'error');}
}

window.AdminData={cancelParticipant:()=>{participantRequest++;}};

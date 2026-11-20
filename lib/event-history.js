const {randomUUID}=require('node:crypto');
const {neon}=require('@neondatabase/serverless');
const {migrate}=require('./schema-migrations');
async function ensure(sql){
 await migrate(sql,'event-history',1,async q=>{
  q`CREATE TABLE IF NOT EXISTS event_history(id BIGSERIAL PRIMARY KEY,request_id UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),endpoint TEXT NOT NULL,method TEXT NOT NULL,http_status INTEGER NOT NULL)`;
  q`CREATE INDEX IF NOT EXISTS event_history_latest ON event_history(id DESC)`;
 });
}
async function record(name,method,status,requestId){
 const sql=neon(process.env.DATABASE_URL);await ensure(sql);
 await sql`INSERT INTO event_history(request_id,endpoint,method,http_status) VALUES(${requestId},${name},${method},${status})`;
 await sql`DELETE FROM event_history WHERE created_at<NOW()-INTERVAL '30 days' OR id<(SELECT id FROM event_history ORDER BY id DESC OFFSET 9999 LIMIT 1)`;
}
function track(name,handler){return async event=>{
 const requestId=randomUUID();
 const response=await handler(event);
 response.headers={...response.headers,'X-Request-Id':requestId,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(response.statusCode>=400){
  try {const data=JSON.parse(response.body);data.requestId=requestId;response.body=JSON.stringify(data);}catch{}
  try{await record(name,event.httpMethod,response.statusCode,requestId);}catch{console.error(JSON.stringify({event:'event-history-unavailable',requestId,endpoint:name,status:response.statusCode}));}
 }
 return response;
};}
module.exports={ensure,track};

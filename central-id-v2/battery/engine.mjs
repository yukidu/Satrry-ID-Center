// Private Starry Battery settlement engine.
// NEVER expose this Worker on workers.dev, a public route, or a H-Global binding.
// Only the trusted Gateway may call it with a dedicated secret.
// All related D1 mutations are sent in a single atomic D1 batch().
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const reId=/^[A-Za-z0-9_-]{8,120}$/;
const reApp=/^[a-z0-9_-]{3,80}$/;
const reUser=/^[A-Za-z0-9_-]{4,180}$/;
const nowMs=()=>Date.now();
const SEC=()=>globalThis.crypto;
const first=async(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const many=async(db,sql,...args)=>{const r=await db.prepare(sql).bind(...args).all();return r.results||[]};
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const secureEqual=async(a,b)=>{
 const te=new TextEncoder(),x=new Uint8Array(await SEC().subtle.digest("SHA-256",te.encode(a))),y=new Uint8Array(await SEC().subtle.digest("SHA-256",te.encode(b)));
 let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;
};
const record=async(db,c)=>first(db,"SELECT reservation_id,user_id,app_id,operation_id,state,quantity,deadline_at_ms FROM battery_reservations WHERE app_id=? AND operation_id=? LIMIT 1",c.app_id,c.operation_id);
function same(r,c){return r&&r.user_id===c.user_id&&r.app_id===c.app_id&&r.operation_id===c.operation_id;}
function summary(r,idempotent=false){return {operation_id:r.operation_id,reservation_id:r.reservation_id,status:r.state,quantity:r.quantity,deadline_at_ms:r.deadline_at_ms,idempotent};}

export async function reserve(db,c,time=nowMs()){
 const old=await record(db,c);
 if(old){if(!same(old,c)||old.quantity!==c.quantity)return reply({error:"operation_conflict"},409);return reply(summary(old,true));}
 const lots=await many(db,"SELECT lot_id,available_units,expires_at_ms FROM battery_lots WHERE user_id=? AND available_units>0 AND expires_at_ms>? ORDER BY expires_at_ms ASC,lot_id ASC",c.user_id,time);
 let due=c.quantity;const alloc=[];
 for(const lot of lots){const qty=Math.min(due,lot.available_units);if(qty>0){alloc.push({lot_id:lot.lot_id,quantity:qty});due-=qty;}if(due===0)break;}
 if(due>0)return reply({error:"insufficient_eligible_battery"},409);
 const wallet=await first(db,"SELECT available_units FROM battery_wallets WHERE user_id=?",c.user_id);
 if(!wallet||wallet.available_units<c.quantity)return reply({error:"insufficient_wallet_battery"},409);
 const reservation_id=SEC().randomUUID(),deadline_at_ms=time+180000;
 const ops=[
  stmt(db,"INSERT INTO battery_reservations(reservation_id,user_id,app_id,operation_id,state,quantity,deadline_at_ms) VALUES(?,?,?,?,?,?,?)",reservation_id,c.user_id,c.app_id,c.operation_id,"reserved",c.quantity,deadline_at_ms),
  stmt(db,"UPDATE battery_wallets SET available_units=available_units-?,reserved_units=reserved_units+?,version=version+1 WHERE user_id=?",c.quantity,c.quantity,c.user_id)
 ];
 for(const a of alloc){
  // A stale lot that has expired between read and write causes a CHECK failure,
  // rolling the entire batch back. No partial reservation is accepted.
  ops.push(stmt(db,"UPDATE battery_lots SET available_units=CASE WHEN expires_at_ms>? THEN available_units-? ELSE -1 END,reserved_units=reserved_units+? WHERE lot_id=? AND user_id=?",time,a.quantity,a.quantity,a.lot_id,c.user_id));
  ops.push(stmt(db,"INSERT INTO battery_reservation_allocations(reservation_id,lot_id,quantity) VALUES(?,?,?)",reservation_id,a.lot_id,a.quantity));
 }
 try{await db.batch(ops);return reply({operation_id:c.operation_id,reservation_id,status:"reserved",quantity:c.quantity,deadline_at_ms,idempotent:false,allocations:alloc.length});}
 catch{
  const existing=await record(db,c);
  if(existing&&same(existing,c)&&existing.quantity===c.quantity)return reply(summary(existing,true));
  return reply({error:"reservation_transaction_conflict_retry"},409);
 }
}

export async function settle(db,c,action,time=nowMs()){
 let r=await record(db,c);
 if(!r)return reply({error:"reservation_not_found"},404);
 if(!same(r,c))return reply({error:"operation_conflict"},409);
 if(r.state!=="reserved"){
  if(action==="commit"&&r.state==="committed")return reply(summary(r,true));
  if(action==="release"&&(r.state==="released"||r.state==="expired"))return reply(summary(r,true));
  return reply({error:"reservation_already_final",state:r.state},409);
 }
 if(action==="commit"&&r.deadline_at_ms<=time){
  // No late commit. Funds are still reserved until timeout sweeper/release.
  return reply({error:"reservation_expired_must_release"},409);
 }
 const allocations=await many(db,
  "SELECT a.lot_id,a.quantity,l.expires_at_ms FROM battery_reservation_allocations a JOIN battery_lots l ON l.lot_id=a.lot_id WHERE a.reservation_id=? ORDER BY l.expires_at_ms,a.lot_id",r.reservation_id);
 if(allocations.reduce((n,a)=>n+a.quantity,0)!==r.quantity)return reply({error:"reservation_corrupt"},503);
 const next=action==="commit"?"committed":(time>=r.deadline_at_ms?"expired":"released");
 const ops=[stmt(db,
   "UPDATE battery_reservations SET state=CASE WHEN state='reserved' AND (?='released' OR ?='expired' OR deadline_at_ms>?) THEN ? ELSE 'invalid' END WHERE reservation_id=? AND user_id=?",
   next,next,time,next,r.reservation_id,c.user_id)];
 if(action==="commit"){
  ops.push(stmt(db,"UPDATE battery_wallets SET reserved_units=reserved_units-?,version=version+1 WHERE user_id=?",r.quantity,c.user_id));
  for(const a of allocations)ops.push(stmt(db,"UPDATE battery_lots SET reserved_units=reserved_units-? WHERE lot_id=? AND user_id=?",a.quantity,a.lot_id,c.user_id));
  ops.push(stmt(db,"INSERT INTO battery_ledger(entry_id,user_id,app_id,operation_id,quantity_delta,created_at_ms) VALUES(?,?,?,?,?,?)",
    SEC().randomUUID(),c.user_id,c.app_id,c.operation_id,-r.quantity,time));
 }else{
  // Release to original source lots. Lot expiry maintenance must subsequently
  // zero expired available units before reporting spendable balance.
  ops.push(stmt(db,"UPDATE battery_wallets SET reserved_units=reserved_units-?,available_units=available_units+?,version=version+1 WHERE user_id=?",r.quantity,r.quantity,c.user_id));
  for(const a of allocations)ops.push(stmt(db,"UPDATE battery_lots SET reserved_units=reserved_units-?,available_units=available_units+? WHERE lot_id=? AND user_id=?",a.quantity,a.quantity,a.lot_id,c.user_id));
 }
 try{await db.batch(ops);return reply({...summary({...r,state:next}),idempotent:false});}
 catch{
  r=await record(db,c);
  if(r&&same(r,c)&&(r.state===next||action==="release"&&r.state==="expired"))return reply(summary(r,true));
  return reply({error:"settlement_transaction_conflict_retry"},409);
 }
}
export default{
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=="POST"||!["/v1/reserve","/v1/commit","/v1/release"].includes(url.pathname))return reply({error:"not_found"},404);
  if(!env?.BATTERY_DB?.batch||typeof env.BATTERY_ENGINE_SECRET!=="string"||env.BATTERY_ENGINE_SECRET.length<32)return reply({error:"engine_not_configured"},503);
  const auth=request.headers.get("X-Battery-Internal-Authorization")||"";
  if(!auth.startsWith("Bearer ")||!await secureEqual(auth.slice(7),env.BATTERY_ENGINE_SECRET))return reply({error:"internal_access_denied"},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return reply({error:"unsupported_content_type"},415);
  let c;
  try{const raw=await request.text();if(raw.length>2048)return reply({error:"request_too_large"},413);c=JSON.parse(raw);}
  catch{return reply({error:"invalid_json"},400);}
  const action=url.pathname.split("/").at(-1);
  if(!c||Array.isArray(c)||typeof c!=="object"||
   Object.keys(c).sort().join(",")!==(action==="reserve"?"app_id,operation_id,quantity,user_id":"app_id,operation_id,user_id")||
   !reId.test(c.operation_id||"")||!reApp.test(c.app_id||"")||!reUser.test(c.user_id||"")||
   (action==="reserve"&&(!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>1000000)))return reply({error:"invalid_operation"},400);
  try{return action==="reserve"?await reserve(env.BATTERY_DB,c):await settle(env.BATTERY_DB,c,action);}
  catch{return reply({error:"engine_database_unavailable"},503);}
 }
};
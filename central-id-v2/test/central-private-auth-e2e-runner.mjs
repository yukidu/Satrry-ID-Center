import {issueCentralStarryToken} from "./private-token-issuer.mjs";
// CENTRAL-ONLY isolated Cloudflare D1 + Service Binding acceptance harness.
// No public route, no real member, and no real user token issuer.
// Remove Cron trigger after a report has been recorded.
const RUN_ID="central-auth-pr40-20261024-e2e-3";
const USER="__central_auth_pr40_synthetic";
let TOKEN="T".repeat(43);
const SESSION="S".repeat(43);
const encoder=new TextEncoder();
const hex=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
const send=async(env,{token=TOKEN,secret=env.CENTRAL_AUTH_CALLER_SECRET,brand="starry",body='{"required_brand":"starry"}'}={})=>{
 const headers={"Content-Type":"application/json","Authorization":"Bearer "+token,"X-Battery-Caller":brand};
 if(secret!==null)headers["X-Central-Service-Auth"]=secret;
 const response=await env.CENTRAL_AUTH_VERIFY.fetch(new Request("https://central-auth.internal/v1/introspect",{method:"POST",headers,body}));
 return{status:response.status,data:await response.json()};
};
const query=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const cleanup=async db=>{
 await db.batch([
  db.prepare("DELETE FROM central_service_access_tokens WHERE user_id=?").bind(USER),
  db.prepare("DELETE FROM central_brand_authorizations WHERE user_id=?").bind(USER),
  db.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(USER),
  db.prepare("DELETE FROM identity_users WHERE user_id=?").bind(USER)
 ]);
};
const check=(all,name,condition,details)=>{
 all.push({name,pass:Boolean(condition),details:typeof details==="string"?details:undefined});
};
async function run(db,env){
 const all=[];
 try{
  await cleanup(db);
  const unknown=await send(env);
  check(all,"unknown token denied",unknown.status===401);
  const missingCaller=await send(env,{secret:null});
  check(all,"missing independent caller secret denied",missingCaller.status===401);
  const now=Date.now();
  const sessionHash=await hex(SESSION);
  await db.batch([
   db.prepare("INSERT INTO identity_users(user_id,created_at_ms,updated_at_ms,membership_status) VALUES(?,?,?,'approved')").bind(USER,now-10000,now-10000),
   db.prepare("INSERT INTO central_brand_authorizations(user_id,brand_scope,granted_at_ms,authorization_reference) VALUES(?,'starry',?,'sandbox-fixture-event')").bind(USER,now-10000),
   db.prepare("INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES(?,?,'central',?,?,1)").bind(sessionHash,USER,now-10000,now+600000),
   db.prepare("SELECT user_id FROM identity_users WHERE user_id=?").bind(USER)
  ]);
  const minted=await issueCentralStarryToken({CENTRAL_DB:db,CENTRAL_TOKEN_ISSUER_ENABLED:"true"},SESSION,now);
  check(all,"Central internal issuer mints from live approved session only",minted.ok===true&&/^[A-Za-z0-9_-]{43}$/.test(minted.token||""));
  if(!minted.ok)throw Error("issuer denied legitimate test session: "+minted.error);
  TOKEN=minted.token;
  const ok=await send(env);
  check(all,"approved Starry token returns central-owned identity",ok.status===200&&ok.data?.active===true&&ok.data?.brand_allowed===true&&ok.data?.user_id===USER&&ok.data?.suspended===false);
  const forged=await send(env,{body:JSON.stringify({required_brand:"starry",user_id:"forged"})});
  check(all,"caller-supplied user_id rejected",forged.status===400);
  const changedCaller=await send(env,{secret:"not-the-shared-test-secret"});
  check(all,"wrong caller secret rejected",changedCaller.status===401);
  const wrongBrand=await send(env,{brand:"hglobal"});
  check(all,"wrong invoking brand rejected",wrongBrand.status===401);
  await query(db,"UPDATE central_brand_authorizations SET revoked_at_ms=? WHERE user_id=?",now,USER);
  const revoked=await send(env);
  check(all,"revoked brand grant denied",revoked.status===403);
  await query(db,"UPDATE central_brand_authorizations SET revoked_at_ms=NULL WHERE user_id=?",USER);
  await query(db,"UPDATE identity_users SET auth_version=auth_version+1 WHERE user_id=?",USER);
  const wrongVersion=await send(env);
  check(all,"changed central auth_version revokes issued token",wrongVersion.status===403);
  await query(db,"UPDATE identity_users SET auth_version=1 WHERE user_id=?",USER);
  await query(db,"UPDATE auth_sessions SET revoked_at_ms=? WHERE user_id=?",now,USER);
  const signedOut=await send(env);
  check(all,"parent Central logout revokes derived Starry token",signedOut.status===403);
  await query(db,"UPDATE auth_sessions SET revoked_at_ms=NULL WHERE user_id=?",USER);
  await query(db,"UPDATE identity_users SET auth_version=1,suspended_at_ms=? WHERE user_id=?",now,USER);
  const suspended=await send(env);
  check(all,"suspended Central member denied",suspended.status===403);
  await query(db,"UPDATE identity_users SET suspended_at_ms=NULL,deleted_at_ms=? WHERE user_id=?",now,USER);
  const deleted=await send(env);
  check(all,"deleted Central member denied",deleted.status===403);
 }catch(e){check(all,"fatal",false,String(e).slice(0,250));}
 finally{
  try{await cleanup(db);const r=await first(db,"SELECT COUNT(*) AS n FROM identity_users WHERE user_id=?",USER);check(all,"all synthetic identities removed",r?.n===0)}catch(e){check(all,"synthetic cleanup",false,String(e).slice(0,230));}
 }
 const ok=all.filter(x=>x.pass).length;
 return{run_id:RUN_ID,passed:ok,total:all.length,checks:all,production:false};
}
export default {
 async scheduled(_event,env){
  if(!env?.CENTRAL_SANDBOX?.prepare||!env?.CENTRAL_AUTH_VERIFY?.fetch||!env?.CENTRAL_AUTH_CALLER_SECRET)throw Error("missing isolated binding or test secret");
  const db=env.CENTRAL_SANDBOX;
  await db.prepare("CREATE TABLE IF NOT EXISTS central_auth_e2e_results(run_id TEXT PRIMARY KEY,passed INTEGER NOT NULL,total INTEGER NOT NULL,report TEXT NOT NULL)").run();
  const existing=await first(db,"SELECT run_id FROM central_auth_e2e_results WHERE run_id=?",RUN_ID);
  if(existing)return;
  const report=await run(db,env);
  await db.prepare("INSERT INTO central_auth_e2e_results(run_id,passed,total,report) VALUES(?,?,?,?)").bind(RUN_ID,report.passed,report.total,JSON.stringify(report)).run();
 },
 async fetch(){return new Response("not_found",{status:404})}
};

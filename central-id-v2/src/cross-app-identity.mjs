// Central-owned first-party identity API. Read only the caller's own minimum
// profile; never grant rank, App roles, Starry Battery access or cross-user search.
// Google ID tokens are used ONLY once as nonce-bound login evidence. Apps receive
// a revocable 5-minute CENTRAL opaque access token for subsequent API calls.
import {compatTest} from "./compat.mjs";
const CLIENTS=Object.freeze({
 "hglobal-web":{client_id:"791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com",
  origins:["https://id.hglobal1985.com","https://hglobal1985.com"]},
 "starry-web":{client_id:"661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com",
  origins:["https://starry.phd","https://echo.starry.phd"]}
});
const ROOT="/api/v1/apps/";
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TTL_MS=300000,CHALLENGE_MS=600000;
const enc=new TextEncoder();
const hex=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))),b=>b.toString(16).padStart(2,"0")).join("");
const random=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");};
const client=appId=>Object.hasOwn(CLIENTS,appId)?CLIENTS[appId]:null;
const clientOrigin=(appId,origin)=>Boolean(client(appId)?.origins.includes(origin));
const allOrigins=new Set(Object.values(CLIENTS).flatMap(x=>x.origins));
function reply(request,data,status=200){
 const headers=new Headers({"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",
  "Vary":"Origin","Access-Control-Allow-Credentials":"false"});
 const origin=request.headers.get("Origin");
 if(origin&&allOrigins.has(origin))headers.set("Access-Control-Allow-Origin",origin);
 return new Response(JSON.stringify(data),{status,headers});
}
const unavailable=req=>reply(req,{error:"service_unavailable"},503);
const dbReady=env=>Boolean(env?.CENTRAL_DB?.prepare);
const checkClock=ms=>Number.isSafeInteger(ms)&&ms>0;
async function readJson(req,keys,maxLength){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("Content-Type")||""))return null;
 const declared=req.headers.get("Content-Length");
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxLength))return null;
 try{
  const raw=await req.text();
  if(raw.length>maxLength)return null;
  const x=JSON.parse(raw);
  if(!x||typeof x!=="object"||Array.isArray(x)||
     Object.keys(x).sort().join(",")!==keys.slice().sort().join(","))return null;
  return x;
 }catch{return null;}
}
// Imported legacy principals still depend on the ORIGINAL authority until
// formal cutover. A copied Central row must never bypass legacy suspension.
async function legacyAuthorized(env,userId,googleSubject=null){
 const imported=await env.CENTRAL_DB.prepare(
  "SELECT legacy_user_id FROM compat_legacy_principals WHERE legacy_user_id=? LIMIT 1"
 ).bind(userId).first();
 if(!imported)return true;
 if(!env?.LEGACY_AUTH_DB?.prepare)return false;
 const current=await env.LEGACY_AUTH_DB.prepare(
  "SELECT status FROM users WHERE id=? LIMIT 1"
 ).bind(userId).first();
 if(current?.status!=="active")return false;
 if(!googleSubject)return true;
 const identity=await env.LEGACY_AUTH_DB.prepare(
  "SELECT userId FROM identities WHERE provider='google' AND providerSubject=? AND emailVerified=1 LIMIT 1"
 ).bind(googleSubject).first();
 return identity?.userId===userId;
}
function signedNonce(credential){
 const part=credential.split(".")[1];
 const base64=part.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-part.length%4)%4);
 const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
 const claims=JSON.parse(new TextDecoder().decode(bytes));
 return claims?.nonce;
}
function bearer(request){
 const h=request.headers.get("Authorization")||"";
 return h.startsWith("Bearer ")&&TOKEN.test(h.slice(7))?h.slice(7):null;
}
async function exchange(req,env,now,verifyGoogle){
 const body=await readJson(req,["app_id","credential","nonce"],12000);
 if(!body||typeof body.app_id!=="string"||!clientOrigin(body.app_id,req.headers.get("Origin"))||
   typeof body.credential!=="string"||body.credential.length>10000||
   !JWT.test(body.credential)||!TOKEN.test(body.nonce))
  return reply(req,{error:"invalid_request"},400);
 let proof;
 try{
  proof=await verifyGoogle(body.credential,fetch,client(body.app_id).client_id);
  if(typeof proof?.subject!=="string"||signedNonce(body.credential)!==body.nonce)
   return reply(req,{error:"invalid_identity_proof"},401);
 }catch{return reply(req,{error:"invalid_identity_proof"},401);}
 let row;
 try{
  row=await env.CENTRAL_DB.prepare(
   "UPDATE central_app_login_challenges SET consumed_at_ms=? WHERE nonce_sha256=? AND app_id=? AND request_origin=? AND consumed_at_ms IS NULL AND expires_at_ms>? RETURNING nonce_sha256"
  ).bind(now,await hex(body.nonce),body.app_id,req.headers.get("Origin"),now).first();
 }catch{return unavailable(req);}
 if(!row)return reply(req,{error:"challenge_expired_or_used"},401);
 let identity;
 try{
  identity=await env.CENTRAL_DB.prepare(
   "SELECT u.user_id,u.auth_version,u.suspended_at_ms,u.deleted_at_ms FROM auth_provider_links p JOIN identity_users u ON u.user_id=p.user_id WHERE p.issuer='google' AND p.provider_subject=? LIMIT 1"
  ).bind(proof.subject).first();
 }catch{return unavailable(req);}
 if(!identity?.user_id||identity.suspended_at_ms!==null||identity.deleted_at_ms!==null)
  return reply(req,{error:"central_account_unavailable"},403);
 try{
  if(!(await legacyAuthorized(env,identity.user_id,proof.subject)))
   return reply(req,{error:"central_account_unavailable"},403);
 }catch{return unavailable(req);}
 try{
  const raw=random();
  const issued=await env.CENTRAL_DB.prepare(
   "INSERT INTO central_app_access_tokens(token_sha256,user_id,app_id,source_nonce_sha256,issued_auth_version,issued_at_ms,expires_at_ms) SELECT ?,u.user_id,?,?,u.auth_version,?,? FROM identity_users u WHERE u.user_id=? AND u.suspended_at_ms IS NULL AND u.deleted_at_ms IS NULL RETURNING token_sha256"
  ).bind(await hex(raw),body.app_id,await hex(body.nonce),now,now+TTL_MS,identity.user_id).first();
  if(!issued)return reply(req,{error:"central_account_unavailable"},403);
  return reply(req,{access_token:raw,token_type:"Bearer",expires_in:300,scope:"central.identity.read"});
 }catch{return unavailable(req);}
}
async function statusFor(req,env,now){
 if(!bearer(req))return reply(req,{error:"unauthorized"},401);
 const appId=req.headers.get("X-Central-App");
 if(!client(appId))return reply(req,{error:"unauthorized"},401);
 const origin=req.headers.get("Origin");
 if(origin&&!clientOrigin(appId,origin))return reply(req,{error:"origin_not_allowed"},403);
 let row;
 try{
  row=await env.CENTRAL_DB.prepare(
   "SELECT t.app_id,t.issued_auth_version,t.issued_at_ms,t.expires_at_ms,t.revoked_at_ms,u.user_id,u.auth_version,u.membership_status,u.suspended_at_ms,u.deleted_at_ms,p.display_name FROM central_app_access_tokens t JOIN identity_users u ON u.user_id=t.user_id LEFT JOIN member_profiles p ON p.user_id=u.user_id WHERE t.token_sha256=? AND t.app_id=? LIMIT 1"
  ).bind(await hex(bearer(req)),appId).first();
 }catch{return unavailable(req);}
 if(!row)return reply(req,{error:"unauthorized"},401);
 if(!Number.isSafeInteger(row.issued_at_ms)||row.issued_at_ms>now||
    !Number.isSafeInteger(row.expires_at_ms)||row.expires_at_ms<=now||
    row.expires_at_ms-row.issued_at_ms>TTL_MS||
    row.revoked_at_ms!==null||row.issued_auth_version!==row.auth_version||
    row.suspended_at_ms!==null||row.deleted_at_ms!==null)
  return reply(req,{error:"unauthorized"},401);
 try{
  if(!(await legacyAuthorized(env,row.user_id)))return reply(req,{error:"unauthorized"},401);
 }catch{return unavailable(req);}
 return reply(req,{user_id:row.user_id,display_name:row.display_name||null,
  membership_status:row.membership_status,app_id:appId,
  scope:"central.identity.read",management_authorized:false,battery_authorized:false});
}
async function revoke(req,env,now){
 const raw=bearer(req),appId=req.headers.get("X-Central-App");
 if(!raw||!client(appId))return reply(req,{error:"unauthorized"},401);
 const origin=req.headers.get("Origin");
 if(origin&&!clientOrigin(appId,origin))return reply(req,{error:"origin_not_allowed"},403);
 try{
  const r=await env.CENTRAL_DB.prepare(
   "UPDATE central_app_access_tokens SET revoked_at_ms=? WHERE token_sha256=? AND app_id=? AND revoked_at_ms IS NULL AND expires_at_ms>? RETURNING token_sha256"
  ).bind(now,await hex(raw),appId,now).first();
  if(!r)return reply(req,{error:"unauthorized"},401);
  return reply(req,{revoked:true});
 }catch{return unavailable(req);}
}
// Optional verifyGoogle is test-only dependency injection, never read from req/env.
export async function crossAppRoute(req,env,now=Date.now(),verifyGoogle=compatTest.googleClaims){
 const url=new URL(req.url),path=url.pathname;
 if(!path.startsWith(ROOT))return null;
 if(!checkClock(now))return unavailable(req);
 if(path===ROOT+"status"){
  if(req.method!=="GET")return reply(req,{error:"method_not_allowed"},405);
  return reply(req,{service:"hglobal-central-id",identity_api:"first-party-v1",
   enabled:true,grant_scope:"central.identity.read",token_lifetime_seconds:300,
   app_registration:"allowlist-only",member_database_direct_access:false,
   privileged_scopes_enabled:false,battery_access_enabled:false});
 }
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS"){
  if(!origin||!allOrigins.has(origin))return reply(req,{error:"origin_not_allowed"},403);
  const headers=new Headers({"Access-Control-Allow-Origin":origin,
   "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
   "Access-Control-Allow-Headers":"Authorization, Content-Type, X-Central-App",
   "Access-Control-Max-Age":"300","Cache-Control":"no-store","Vary":"Origin"});
  return new Response(null,{status:204,headers});
 }
 if(origin&&!allOrigins.has(origin))return reply(req,{error:"origin_not_allowed"},403);
 if(!dbReady(env))return unavailable(req);
 if(path===ROOT+"challenge"){
  if(req.method!=="POST")return reply(req,{error:"method_not_allowed"},405);
  const body=await readJson(req,["app_id"],200);
  if(!body||typeof body.app_id!=="string"||!clientOrigin(body.app_id,origin))
   return reply(req,{error:"invalid_request"},400);
  const nonce=random();
  try{
   const r=await env.CENTRAL_DB.prepare(
    "INSERT INTO central_app_login_challenges(nonce_sha256,app_id,request_origin,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)"
   ).bind(await hex(nonce),body.app_id,origin,now,now+CHALLENGE_MS).run();
   if(r?.success!==true)return unavailable(req);
  }catch{return unavailable(req);}
  return reply(req,{nonce,google_client_id:client(body.app_id).client_id,expires_in:600});
 }
 if(path===ROOT+"token"){
  if(req.method!=="POST")return reply(req,{error:"method_not_allowed"},405);
  return exchange(req,env,now,verifyGoogle);
 }
 if(path===ROOT+"me"){
  if(req.method!=="GET")return reply(req,{error:"method_not_allowed"},405);
  return statusFor(req,env,now);
 }
 if(path===ROOT+"revoke"){
  if(req.method!=="POST")return reply(req,{error:"method_not_allowed"},405);
  return revoke(req,env,now);
 }
 return reply(req,{error:"not_found"},404);
}

// Central ID browser authentication. This is separate from the Echo compatibility API.
// Production is fail-closed when OAuth origin / D1 / old account authority are unavailable.
import {compatTest} from "./compat.mjs";
import {loginPage,dashboardPage,portalResponse,scriptResponse} from "./portal.mjs";
import {portalClientCode} from "./portal-script.mjs";
const APP_ORIGIN="https://id.hglobal1985.com";
const PREVIEW_ORIGIN="https://hglobal-central-id-v2-preview.yukidu.workers.dev";
const CLIENT_ID="661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com";
const SESSION_COOKIE="central_id_portal";
const NONCE_COOKIE="central_login_nonce";
const SESSION_TTL=12*60*60*1000;
const NONCE_TTL=10*60*1000;
const RE=/^[A-Za-z0-9_-]{42,48}$/;
const rand=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);let s="";for(const c of b)s+=String.fromCharCode(c);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");};
const err=(error,status=400)=>new Response(JSON.stringify({error}),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const success=(body,headers={})=>new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
const cookie=(request,key)=>{
 const match=(request.headers.get("Cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(key+"="));
 return match?match.substring(key.length+1):"";
};
const hex=compatTest.sha256hex;
function identityDb(env){return env?.CENTRAL_DB&&typeof env.CENTRAL_DB.prepare==="function";}
function originOk(request){const o=request.headers.get("Origin");return o===new URL(request.url).origin&&[APP_ORIGIN,PREVIEW_ORIGIN].includes(o);}
function cookieFlag(key,token,maxAge=0){return key+"="+token+"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age="+maxAge;}
async function legacyValid(env,userId,subject){
 if(!env?.LEGACY_AUTH_DB?.prepare)return false;
 try{
  const u=await env.LEGACY_AUTH_DB.prepare("SELECT status FROM users WHERE id=? LIMIT 1").bind(userId).first();
  if(u?.status!=="active")return false;
  if(!subject)return true;
  const p=await env.LEGACY_AUTH_DB.prepare("SELECT userId FROM identities WHERE provider='google' AND providerSubject=? AND emailVerified=1 LIMIT 1").bind(subject).first();
  return p?.userId===userId;
 }catch{return false;}
}
async function portalUser(request,env){
 if(!identityDb(env))return null;
 const raw=cookie(request,SESSION_COOKIE);
 if(!RE.test(raw))return null;
 const row=await env.CENTRAL_DB.prepare(
  "SELECT u.user_id,u.auth_version,u.membership_status,u.suspended_at_ms,u.deleted_at_ms,s.issued_auth_version,p.display_name,p.contact_email FROM auth_sessions s JOIN identity_users u ON u.user_id=s.user_id JOIN member_profiles p ON p.user_id=u.user_id WHERE s.session_id_hash=? AND s.brand_scope='central' AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? LIMIT 1"
 ).bind(await hex(raw),Date.now()).first();
 if(!row||row.deleted_at_ms!==null||row.suspended_at_ms!==null||row.auth_version!==row.issued_auth_version)return null;
 const legacy=await env.CENTRAL_DB.prepare("SELECT legacy_user_id FROM compat_legacy_principals WHERE legacy_user_id=? LIMIT 1").bind(row.user_id).first();
 if(legacy && !(await legacyValid(env,row.user_id)))return null;
 return {id:row.user_id,displayName:row.display_name,contactEmail:row.contact_email,membership_status:row.membership_status};
}
async function googleLogin(request,env){
 if(!originOk(request))return err("origin_not_allowed",403);
 if(!identityDb(env))return err("database_unavailable",503);
 let payload;
 try{const raw=await request.text();if(raw.length>12000)return err("too_large",413);payload=JSON.parse(raw);}catch{return err("invalid_json");}
 if(payload?.appId!=="central"||payload.termsAccepted!==true)return err("consent_required",400);
 let verified;
 try{verified=await compatTest.googleClaims(payload.credential);}catch{return err("credential_invalid",401);}
 let jwt;
 try{
  const token=payload.credential.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  jwt=JSON.parse(atob(token+"=".repeat((4-token.length%4)%4)));
 }catch{return err("credential_invalid",401);}
 const challenge=cookie(request,NONCE_COOKIE),now=Date.now();
 if(!RE.test(challenge)||typeof jwt.nonce!=="string"||jwt.nonce!==challenge)return err("nonce_invalid",401);
 const consumed=await env.CENTRAL_DB.prepare(
  "UPDATE central_login_challenges SET consumed_at_ms=? WHERE nonce_hash=? AND consumed_at_ms IS NULL AND expires_at_ms>? RETURNING nonce_hash"
 ).bind(now,await hex(challenge),now).first();
 if(!consumed)return err("nonce_expired_or_replayed",401);
 const subject=verified.subject;
 const existing=await env.CENTRAL_DB.prepare("SELECT user_id FROM auth_provider_links WHERE issuer='google' AND provider_subject=? LIMIT 1").bind(subject).first();
 const legacy=await env.CENTRAL_DB.prepare(
  "SELECT c.legacy_user_id,p.display_name FROM compat_google_subjects c JOIN compat_legacy_principals p ON p.legacy_user_id=c.legacy_user_id WHERE c.provider='google' AND c.provider_subject=? LIMIT 1"
 ).bind(subject).first();
 if(existing&&legacy&&existing.user_id!==legacy.legacy_user_id)return err("identity_link_conflict",409);
 if(legacy && !(await legacyValid(env,legacy.legacy_user_id,subject)))return err("legacy_identity_unavailable",403);
 let userId=existing?.user_id||legacy?.legacy_user_id||crypto.randomUUID();
 if(!existing){
   const fromGoogle=typeof jwt.name==="string"?jwt.name.trim().slice(0,90):"";
   const displayName=legacy?.display_name||fromGoogle||"新會員";
   try{
     await env.CENTRAL_DB.batch([
       env.CENTRAL_DB.prepare("INSERT OR IGNORE INTO identity_users(user_id,created_at_ms,updated_at_ms) VALUES(?,?,?)").bind(userId,now,now),
       env.CENTRAL_DB.prepare("INSERT OR IGNORE INTO member_profiles(user_id,display_name,updated_at_ms) VALUES(?,?,?)").bind(userId,displayName,now),
       env.CENTRAL_DB.prepare("INSERT INTO auth_provider_links(link_id,user_id,issuer,provider_subject,linked_at_ms) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),userId,"google",subject,now),
       env.CENTRAL_DB.prepare("INSERT INTO consent_records(consent_event_id,user_id,consent_purpose,policy_version,action,event_at_ms) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,"central_account_creation","2026-10-23-v1","grant",now)
     ]);
   }catch{
     const already=await env.CENTRAL_DB.prepare("SELECT user_id FROM auth_provider_links WHERE issuer='google' AND provider_subject=? LIMIT 1").bind(subject).first();
     if(!already)return err("registration_conflict",409);
     if(legacy && already.user_id!==legacy.legacy_user_id)return err("identity_link_conflict",409);
     userId=already.user_id;
   }
 }
 const u=await env.CENTRAL_DB.prepare("SELECT user_id,membership_status,auth_version,suspended_at_ms,deleted_at_ms FROM identity_users WHERE user_id=? LIMIT 1").bind(userId).first();
 if(!u||u.suspended_at_ms!==null||u.deleted_at_ms!==null)return err("account_unavailable",403);
 const token=rand();
 await env.CENTRAL_DB.prepare(
  "INSERT INTO auth_sessions(session_id_hash,user_id,brand_scope,issued_at_ms,expires_at_ms,issued_auth_version) VALUES(?,?,'central',?,?,?)"
 ).bind(await hex(token),userId,now,now+SESSION_TTL,u.auth_version).run();
 return success({authenticated:true,user:{id:userId},membership_status:u.membership_status,central_approved:u.membership_status==="approved"},{'Set-Cookie':cookieFlag(SESSION_COOKIE,token,Math.floor(SESSION_TTL/1000))});
}
export async function portalRoute(request,env){
 const u=new URL(request.url),path=u.pathname,method=request.method;
 if(!["/login","/dashboard","/portal.js","/api/v1/portal/challenge","/api/v1/portal/google-login","/api/v1/portal/logout","/api/v1/portal/me"].includes(path))return null;
 if(![APP_ORIGIN,PREVIEW_ORIGIN].includes(u.origin))return err("invalid_host",404);
 if(path==="/portal.js"){
  if(method!=="GET")return err("method_not_allowed",405);
  return scriptResponse(portalClientCode);
 }
 if(path==="/login"){
  if(method!=="GET")return err("method_not_allowed",405);
  if(await portalUser(request,env))return Response.redirect(u.origin+"/dashboard",303);
  return portalResponse(loginPage());
 }
 if(path==="/dashboard"){
  if(method!=="GET")return err("method_not_allowed",405);
  const account=await portalUser(request,env);
  return account?portalResponse(dashboardPage(account)):Response.redirect(u.origin+"/login",303);
 }
 if(path==="/api/v1/portal/challenge"){
  if(method!=="GET")return err("method_not_allowed",405);
  if(!identityDb(env))return err("database_unavailable",503);
  const nonce=rand(),now=Date.now();
  await env.CENTRAL_DB.prepare("INSERT INTO central_login_challenges(nonce_hash,created_at_ms,expires_at_ms) VALUES(?,?,?)").bind(await hex(nonce),now,now+NONCE_TTL).run();
  return success({google_client_id:CLIENT_ID,nonce,expires_in:600},{'Set-Cookie':cookieFlag(NONCE_COOKIE,nonce,Math.floor(NONCE_TTL/1000))});
 }
 if(path==="/api/v1/portal/google-login"){
  if(method!=="POST")return err("method_not_allowed",405);
  return googleLogin(request,env);
 }
 if(path==="/api/v1/portal/logout"){
  if(method!=="POST")return err("method_not_allowed",405);
  if(!originOk(request))return err("origin_not_allowed",403);
  const token=cookie(request,SESSION_COOKIE);
  if(RE.test(token)&&identityDb(env))await env.CENTRAL_DB.prepare("UPDATE auth_sessions SET revoked_at_ms=? WHERE session_id_hash=?").bind(Date.now(),await hex(token)).run();
  return success({ok:true},{'Set-Cookie':cookieFlag(SESSION_COOKIE,"",0)});
 }
 if(path==="/api/v1/portal/me"){
  if(method!=="GET")return err("method_not_allowed",405);
  const account=await portalUser(request,env);
  return account?success({authenticated:true,user:account}):err("unauthorized",401);
 }
 return null;
}

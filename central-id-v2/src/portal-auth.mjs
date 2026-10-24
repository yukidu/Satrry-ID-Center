// Central ID browser authentication. This is separate from the Echo compatibility API.
// Production is fail-closed when OAuth origin / D1 / old account authority are unavailable.
import {compatTest} from "./compat.mjs";
import {isValidHglobalCenter} from "./centers.mjs";
import {centerClientCode} from "./center-client.mjs";
import {loginPage,dashboardPage,settingsPage,portalResponse,scriptResponse} from "./portal.mjs";
import {portalClientCode} from "./portal-script.mjs";
const APP_ORIGIN="https://id.hglobal1985.com";
const PREVIEW_ORIGIN="https://hglobal-central-id-v2-preview.yukidu.workers.dev";
// H-Global web portal has an independent Google OAuth client; internal compatibility retains separate settings.
const CLIENT_ID="791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com";
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
  "SELECT u.user_id,u.auth_version,u.membership_status,u.suspended_at_ms,u.deleted_at_ms,s.issued_auth_version,p.display_name,p.contact_email,p.mobile_e164,p.membership_system,p.center_code,p.amway_number,p.location_country,p.location_region,p.location_city,p.birth_date_iso,p.motto,p.record_version,e.display_name AS center_name FROM auth_sessions s JOIN identity_users u ON u.user_id=s.user_id JOIN member_profiles p ON p.user_id=u.user_id LEFT JOIN education_centers e ON e.center_code=p.center_code WHERE s.session_id_hash=? AND s.brand_scope='central' AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? LIMIT 1"
 ).bind(await hex(raw),Date.now()).first();
 if(!row||row.deleted_at_ms!==null||row.suspended_at_ms!==null||row.auth_version!==row.issued_auth_version)return null;
 const legacy=await env.CENTRAL_DB.prepare("SELECT legacy_user_id FROM compat_legacy_principals WHERE legacy_user_id=? LIMIT 1").bind(row.user_id).first();
 if(legacy && !(await legacyValid(env,row.user_id)))return null;
 return {id:row.user_id,displayName:row.display_name,contactEmail:row.contact_email,mobileE164:row.mobile_e164,membershipSystem:row.membership_system,centerCode:row.center_code,centerName:row.center_name,amwayNumber:row.amway_number,locationCountry:row.location_country,locationRegion:row.location_region,locationCity:row.location_city,birthDateIso:row.birth_date_iso,motto:row.motto,recordVersion:row.record_version,membership_status:row.membership_status};
}
async function googleLogin(request,env){
 if(!originOk(request))return err("origin_not_allowed",403);
 if(!identityDb(env))return err("database_unavailable",503);
 let payload;
 try{const raw=await request.text();if(raw.length>12000)return err("too_large",413);payload=JSON.parse(raw);}catch{return err("invalid_json");}
 if(payload?.appId!=="central"||payload.termsAccepted!==true)return err("consent_required",400);
 let verified;
 try{verified=await compatTest.googleClaims(payload.credential,fetch,CLIENT_ID);}catch{return err("credential_invalid",401);}
 let jwt;
 try{
  const token=payload.credential.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  jwt=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token+"=".repeat((4-token.length%4)%4)),c=>c.charCodeAt(0))));
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

// First-stage self-edit: only non-privileged personal text fields; changes never grant membership/rank/role.
// All input is validated server-side and guarded by an authenticated session and record-version CAS.
const PROFILE_FIELDS={
 display_name:{max:50,required:true},
 contact_email:{max:254},
 location_country:{max:90},
 location_region:{max:90},
 location_city:{max:90},
 motto:{max:200}
};
async function updateOwnProfile(request,env){
 if(!originOk(request))return err("origin_not_allowed",403);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return err("unsupported_content_type",415);
 if(!identityDb(env))return err("database_unavailable",503);
 const current=await portalUser(request,env);
 if(!current)return err("unauthorized",401);
 let payload;
 try{const raw=await request.text();if(raw.length>1600)return err("too_large",413);payload=JSON.parse(raw);}catch{return err("invalid_json");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    !Number.isSafeInteger(payload.version)||payload.version<1||
    typeof payload.field!=="string"||!Object.hasOwn(PROFILE_FIELDS,payload.field)||
    typeof payload.value!=="string"||Object.keys(payload).some(k=>!["field","value","version"].includes(k)))return err("invalid_profile_update");
 const rule=PROFILE_FIELDS[payload.field],str=payload.value.trim();
 if(str.length>rule.max||(rule.required&&!str))return err("invalid_profile_value");
 if(payload.field==="contact_email"&&str&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str))return err("invalid_email");
 // Field is an allowlisted SQL identifier from PROFILE_FIELDS, never arbitrary client input.
 const updated=await env.CENTRAL_DB.prepare(
  "UPDATE member_profiles SET "+payload.field+"=?,updated_at_ms=?,record_version=record_version+1 WHERE user_id=? AND record_version=? RETURNING record_version"
 ).bind(str||null,Date.now(),current.id,payload.version).first();
 if(!updated)return err("profile_version_conflict",409);
 return success({saved:true,field:payload.field,version:updated.record_version});
}


// H-Global portal only: system is server-assigned, center is saved immediately without approval.
// Migration 0005 atomically expires old center-scope grants and sessions whenever the center changes.
async function updateHglobalCenter(request,env){
 if(!originOk(request))return err("origin_not_allowed",403);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return err("unsupported_content_type",415);
 if(!identityDb(env))return err("database_unavailable",503);
 const current=await portalUser(request,env);
 if(!current)return err("unauthorized",401);
 let payload;
 try{const raw=await request.text();if(raw.length>250)return err("too_large",413);payload=JSON.parse(raw);}catch{return err("invalid_json");}
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    Object.keys(payload).sort().join(",")!=="centerCode,version"||
    !isValidHglobalCenter(payload.centerCode)||!Number.isSafeInteger(payload.version)||payload.version<1)
    return err("invalid_center_selection",400);
 if(current.recordVersion!==payload.version)return err("profile_version_conflict",409);
 if(current.membershipSystem==="hglobal"&&current.centerCode===payload.centerCode)
    return success({saved:true,center_code:payload.centerCode,version:current.recordVersion,relogin:false});
 let updated;
 try{
  updated=await env.CENTRAL_DB.prepare(
   "UPDATE member_profiles SET membership_system='hglobal',center_code=?,updated_at_ms=?,record_version=record_version+1 "+
   "WHERE user_id=? AND record_version=? AND EXISTS (SELECT 1 FROM education_centers WHERE center_code=? AND is_active=1) RETURNING record_version"
  ).bind(payload.centerCode,Date.now(),current.id,payload.version,payload.centerCode).first();
 }catch{return err("center_storage_unavailable",503);}
 if(!updated)return err("center_unavailable_or_version_conflict",409);
 return success({saved:true,center_code:payload.centerCode,version:updated.record_version,relogin:true});
}

export async function portalRoute(request,env){
 const u=new URL(request.url),path=u.pathname,method=request.method;
 if(!["/login","/dashboard","/me/settings","/portal.js","/center.js","/api/v1/portal/profile","/api/v1/portal/center","/api/v1/portal/challenge","/api/v1/portal/google-login","/api/v1/portal/logout","/api/v1/portal/me"].includes(path))return null;
 if(![APP_ORIGIN,PREVIEW_ORIGIN].includes(u.origin))return err("invalid_host",404);
 if(path==="/center.js"){
  if(method!=="GET")return err("method_not_allowed",405);
  return scriptResponse(centerClientCode);
 }
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
 if(path==="/me/settings"){
  if(method!=="GET")return err("method_not_allowed",405);
  const account=await portalUser(request,env);
  return account?portalResponse(settingsPage(account)):Response.redirect(u.origin+"/login",303);
 }
 if(path==="/api/v1/portal/profile"){
  if(method!=="POST")return err("method_not_allowed",405);
  return updateOwnProfile(request,env);
 }
 if(path==="/api/v1/portal/center"){
  if(method!=="POST")return err("method_not_allowed",405);
  return updateHglobalCenter(request,env);
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
  // Clearing only a browser cookie is not a server-side sign-out. If D1 is down,
  // an existing session could remain valid elsewhere, so never report success.
  if(RE.test(token)){
   if(!identityDb(env))return err("database_unavailable",503);
   try{
    const result=await env.CENTRAL_DB.prepare(
     "UPDATE auth_sessions SET revoked_at_ms=? WHERE session_id_hash=? AND revoked_at_ms IS NULL"
    ).bind(Date.now(),await hex(token)).run();
    if(result?.success!==true)return err("logout_failed",503);
   }catch{return err("logout_failed",503);}
  }
  // No valid session cookie means there is no authenticated token to revoke.
  return success({ok:true},{'Set-Cookie':cookieFlag(SESSION_COOKIE,"",0)});
 }
 if(path==="/api/v1/portal/me"){
  if(method!=="GET")return err("method_not_allowed",405);
  const account=await portalUser(request,env);
  return account?success({authenticated:true,user:account}):err("unauthorized",401);
 }
 return null;
}

// Echo-Starry compatibility gateway, stage 1: Google subject proof + isolated sessions.
// No legacy cookies, rank approvals, battery, privileged membership, or SSO tickets.
const ORIGINS = new Set(["https://starry.phd","https://echo.starry.phd","https://id.starry.phd","https://id.hglobal1985.com"]);
const APPS = new Set(["echostars","starryphd","gostarry","downloadstarry","boxstarry","starry-sync","starry-ai"]);
const COOKIE = "central_id_v2_session";
const CLIENT_ID = "661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com";
const TTL = 12*60*60*1000;
let keyCache = { expires: 0, keys: [] };
const safeHeaders = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow,noarchive","Vary":"Origin"};
function respond(request,body,status=200,extras={}) {
  const h = new Headers({...safeHeaders,...extras});
  const origin=request.headers.get("Origin");
  if(ORIGINS.has(origin)){
    h.set("Access-Control-Allow-Origin",origin);
    h.set("Access-Control-Allow-Credentials","true");
    h.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers","Content-Type, Authorization");
  }
  return new Response(JSON.stringify(body),{status,headers:h});
}
function bytesToBase64Url(bytes) {
  let bin="";for(const n of bytes)bin+=String.fromCharCode(n);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64Url(s) {
  if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>12000)throw Error("token_format");
  const base64=s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4);
  return Uint8Array.from(atob(base64),x=>x.charCodeAt(0));
}
function parseSegment(segment) {
  return JSON.parse(new TextDecoder().decode(fromBase64Url(segment)));
}
async function sha256hex(value) {
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
}
function makeToken() {
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return bytesToBase64Url(bytes);
}
async function googleClaims(jwt, fetcher=fetch, expectedAud=CLIENT_ID) {
  if(typeof jwt!=="string"||jwt.length<100||jwt.length>10000)throw Error("credential_invalid");
  const parts=jwt.split(".");if(parts.length!==3)throw Error("credential_invalid");
  const header=parseSegment(parts[0]),claim=parseSegment(parts[1]);
  if(header.alg!=="RS256"||typeof header.kid!=="string"||header.kid.length>200)throw Error("unsupported_signature");
  const now=Math.floor(Date.now()/1000);
  if(!["https://accounts.google.com","accounts.google.com"].includes(claim.iss) ||
      claim.aud!==expectedAud || (claim.azp!==undefined && claim.azp!==expectedAud) || !Number.isInteger(claim.exp) || claim.exp<=now || claim.exp>now+7200 ||
      !Number.isInteger(claim.iat) || claim.iat>now+60 ||
      typeof claim.sub!=="string" || claim.sub.length<4 || claim.sub.length>255 ||
      claim.email_verified!==true)throw Error("claims_invalid");
  if(Date.now()>keyCache.expires){
    const response=await fetcher("https://www.googleapis.com/oauth2/v3/certs",{headers:{"Accept":"application/json"}});
    if(!response.ok)throw Error("jwks_unavailable");
    const body=await response.json();
    if(!Array.isArray(body.keys))throw Error("jwks_invalid");
    keyCache={keys:body.keys.filter(k=>k.kty==="RSA"&&k.use==="sig"&&k.alg==="RS256"),expires:Date.now()+10*60*1000};
  }
  const jwk=keyCache.keys.find(k=>k.kid===header.kid);
  if(!jwk)throw Error("unknown_key");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const data=new TextEncoder().encode(parts[0]+"."+parts[1]);
  const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,fromBase64Url(parts[2]),data);
  if(!ok)throw Error("invalid_signature");
  return {subject:claim.sub};
}
function tokenFromRequest(request) {
  const bearer=request.headers.get("Authorization")||"";
  if(/^Bearer [A-Za-z0-9_-]{40,80}$/.test(bearer))return bearer.slice(7);
  const cookie=request.headers.get("Cookie")||"";
  const found=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  const token=found?found.slice(COOKIE.length+1):"";
  return /^[A-Za-z0-9_-]{40,80}$/.test(token)?token:"";
}
function dbReady(env){return env&&env.CENTRAL_DB&&typeof env.CENTRAL_DB.prepare==="function";}

/**
 * Interim cutover authority. Read-only against the ORIGINAL Starry identity D1:
 * blocks deleted/suspended members and revoked Echo App access immediately.
 * The migration copy is never trusted for revocation until central v2 owns auth.
 */
function legacyDbReady(env){return env?.LEGACY_AUTH_DB&&typeof env.LEGACY_AUTH_DB.prepare==="function";}
async function liveLegacyMember(env,userId){
  if(!legacyDbReady(env))return false;
  try{
    const u=await env.LEGACY_AUTH_DB.prepare("SELECT status FROM users WHERE id=? LIMIT 1").bind(userId).first();
    return u?.status==="active";
  }catch{return false;}
}
async function liveGoogleIdentity(env,subject,userId){
  if(!legacyDbReady(env))return false;
  try{
    const row=await env.LEGACY_AUTH_DB.prepare(
      "SELECT userId FROM identities WHERE provider='google' AND providerSubject=? AND emailVerified=1 LIMIT 1"
    ).bind(subject).first();
    return row?.userId===userId&&await liveLegacyMember(env,userId);
  }catch{return false;}
}
async function liveEchoPermission(env,userId){
  if(!legacyDbReady(env))return false;
  try{
    const u=await env.LEGACY_AUTH_DB.prepare("SELECT status FROM users WHERE id=? LIMIT 1").bind(userId).first();
    if(u?.status!=="active")return false;
    const m=await env.LEGACY_AUTH_DB.prepare(
      "SELECT status FROM app_memberships WHERE userId=? AND appId='echostars' LIMIT 1"
    ).bind(userId).first();
    return m?.status==="active";
  }catch{return false;}
}

async function sessionOf(request,env) {
  const token=tokenFromRequest(request);
  if(!token||!dbReady(env))return null;
  const hash=await sha256hex(token);
  const row=await env.CENTRAL_DB.prepare(
    "SELECT s.legacy_user_id,u.display_name,u.account_status FROM compat_auth_sessions s JOIN compat_legacy_principals u ON u.legacy_user_id=s.legacy_user_id WHERE s.session_hash=? AND s.revoked_at_ms IS NULL AND s.expires_at_ms>? LIMIT 1"
  ).bind(hash,Date.now()).first();
  if(!row||row.account_status!=="active"||!(await liveLegacyMember(env,row.legacy_user_id)))return null;
  return {id:row.legacy_user_id,name:row.display_name||"",membershipStatus:"legacy_unverified"};
}
const allowedHost = "id.hglobal1985.com";
const previewHost = "hglobal-central-id-v2-preview.yukidu.workers.dev";
export async function compatibility(request,env) {
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!["/api/v1/compat/readiness","/api/google-sync","/api/session","/api/ecosystem/session","/api/v1/me","/api/logout"].includes(path) &&
     !/^\/api\/apps\/[a-z0-9-]+\/ticket$/.test(path) && path!=="/api/v1/compat/tickets/consume" && path!=="/auth/echo/continue")return null;
  if(url.hostname!==allowedHost && url.hostname!==previewHost)return respond(request,{error:"invalid_host"},404);
  if(method==="OPTIONS"){
    if(!ORIGINS.has(request.headers.get("Origin")))return respond(request,{error:"origin_not_allowed"},403);
    return new Response(null,{status:204,headers:respond(request,{}).headers});
  }
  if(path==="/api/v1/compat/readiness"){
    if(method!=="GET")return respond(request,{error:"method_not_allowed"},405);
    const ready=dbReady(env);
    if(!ready)return respond(request,{status:"unavailable",storage:"not_bound",echo_cutover_ready:false},503);
    try{
      if(!legacyDbReady(env))return respond(request,{status:"unavailable",storage:"connected",live_legacy_auth:"not_bound",echo_cutover_ready:false},503);
      const legacySchema=await env.LEGACY_AUTH_DB.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='users' LIMIT 1").first();
      if(legacySchema?.name!=="users")return respond(request,{status:"unavailable",storage:"connected",live_legacy_auth:"schema_missing",echo_cutover_ready:false},503);
      const row=await env.CENTRAL_DB.prepare("SELECT COUNT(*) AS n FROM compat_migration_audit").first();
      return respond(request,{status:"ok",phase:"compatibility_stage_1",storage:"connected",migration_audit_present:Number(row?.n||0)>0,live_legacy_auth:"read_only_live_checked",google_jwt_verification_code_deployed:true,oauth_real_browser_tested:false,session_cookies_cross_site_tested:false,ticket_exchange_enabled:env?.ECHO_TICKETS_ENABLED==="true",echo_cutover_ready:false});
    }catch{return respond(request,{status:"unavailable",storage:"schema_missing",echo_cutover_ready:false},503);}
  }
  if(path==="/api/session"||path==="/api/ecosystem/session"||path==="/api/v1/me"){
    if(method!=="GET")return respond(request,{error:"method_not_allowed"},405);
    if(path==="/api/ecosystem/session" && !ORIGINS.has(request.headers.get("Origin")))return respond(request,{error:"origin_not_allowed"},403);
    const identity=await sessionOf(request,env);
    if(!identity)return path==="/api/v1/me"?respond(request,{authenticated:false,error:"unauthorized"},401):respond(request,{authenticated:false});
    return respond(request,{authenticated:true,user:{id:identity.id,name:identity.name},membership_status:identity.membershipStatus,privileged:false});
  }
  if(path==="/api/google-sync"){
    if(method!=="POST")return respond(request,{error:"method_not_allowed"},405);
    if(!ORIGINS.has(request.headers.get("Origin")))return respond(request,{error:"origin_not_allowed"},403);
    if(!dbReady(env))return respond(request,{error:"service_unavailable"},503);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return respond(request,{error:"unsupported_content_type"},415);
    if(Number(request.headers.get("Content-Length")||"0")>12000)return respond(request,{error:"payload_too_large"},413);
    let payload;try{const raw=await request.text();if(raw.length>12000)return respond(request,{error:"payload_too_large"},413);payload=JSON.parse(raw);}catch{return respond(request,{error:"invalid_json"},400);}
    if(!APPS.has(payload?.appId))return respond(request,{error:"invalid_app"},400);
    let claims;try{claims=await googleClaims(payload?.credential)}catch{return respond(request,{error:"credential_invalid"},401);}
    const link=await env.CENTRAL_DB.prepare(
      "SELECT p.legacy_user_id,p.display_name,p.account_status FROM compat_google_subjects g JOIN compat_legacy_principals p ON p.legacy_user_id=g.legacy_user_id WHERE g.provider='google' AND g.provider_subject=? LIMIT 1"
    ).bind(claims.subject).first();
    if(!link||link.account_status!=="active")return respond(request,{error:"legacy_identity_not_claimable",registration_enabled:false},403);
    if(!(await liveGoogleIdentity(env,claims.subject,link.legacy_user_id)))return respond(request,{error:"legacy_identity_revoked_or_unavailable",registration_enabled:false},403);
    const token=makeToken(),now=Date.now();
    const hash=await sha256hex(token);
    await env.CENTRAL_DB.prepare("INSERT INTO compat_auth_sessions(session_hash,legacy_user_id,origin_app,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?)")
      .bind(hash,link.legacy_user_id,payload.appId,now,now+TTL).run();
    let continueUrl=null;
    if(env?.ECHO_TICKETS_ENABLED==="true" && payload.appId==="echostars"){
      const bridge=makeToken();
      await env.CENTRAL_DB.prepare("INSERT INTO compat_auth_tickets(code_hash,legacy_user_id,app_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)")
        .bind(await sha256hex(bridge),link.legacy_user_id,"echo_login_bridge",now,now+120000).run();
      continueUrl=new URL("/auth/echo/continue?code="+encodeURIComponent(bridge),request.url).toString();
    }
    return respond(request,{success:true,authenticated:true,user:{id:link.legacy_user_id,name:link.display_name||""},membership_status:"legacy_unverified",approved:false,echo_cutover_ready:false,continueUrl},200,{"Set-Cookie":COOKIE+"="+token+"; Path=/; HttpOnly; Secure; SameSite=None; Max-Age="+Math.floor(TTL/1000)});
  }
  if(path==="/auth/echo/continue"){
    if(env?.ECHO_TICKETS_ENABLED!=="true")return respond(request,{error:"ticket_exchange_not_ready"},503);
    if(method!=="GET")return respond(request,{error:"method_not_allowed"},405);
    if(!dbReady(env))return respond(request,{error:"service_unavailable"},503);
    const code=url.searchParams.get("code");
    if(!code||!/^[A-Za-z0-9_-]{42,48}$/.test(code))return respond(request,{error:"invalid_bridge"},401);
    const now=Date.now(),hash=await sha256hex(code);
    const used=await env.CENTRAL_DB.prepare("UPDATE compat_auth_tickets SET consumed_at_ms=? WHERE code_hash=? AND app_id='echo_login_bridge' AND consumed_at_ms IS NULL AND expires_at_ms>? RETURNING legacy_user_id").bind(now,hash,now).first();
    if(!used)return respond(request,{error:"bridge_expired_or_used"},401);
    const principal=await env.CENTRAL_DB.prepare("SELECT p.account_status,a.legacy_status FROM compat_legacy_principals p JOIN compat_legacy_app_access a ON p.legacy_user_id=a.legacy_user_id AND a.app_id='echostars' WHERE p.legacy_user_id=? LIMIT 1").bind(used.legacy_user_id).first();
    if(!principal||principal.account_status!=="active"||principal.legacy_status!=="active")return respond(request,{error:"echo_access_not_active"},403);
    if(!(await liveEchoPermission(env,used.legacy_user_id)))return respond(request,{error:"echo_live_access_revoked_or_unavailable"},403);
    const token=makeToken(),ticket=makeToken();
    await env.CENTRAL_DB.batch([
      env.CENTRAL_DB.prepare("INSERT INTO compat_auth_sessions(session_hash,legacy_user_id,origin_app,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?)").bind(await sha256hex(token),used.legacy_user_id,"echostars",now,now+TTL),
      env.CENTRAL_DB.prepare("INSERT INTO compat_auth_tickets(code_hash,legacy_user_id,app_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)").bind(await sha256hex(ticket),used.legacy_user_id,"echostars",now,now+120000)
    ]);
    const headers=new Headers({"Location":"https://echo.starry.phd/auth/callback?code="+encodeURIComponent(ticket),"Set-Cookie":COOKIE+"="+token+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+Math.floor(TTL/1000),"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow,noarchive","X-Content-Type-Options":"nosniff"});
    return new Response(null,{status:303,headers});
  }
  if(path==="/api/logout"){
    if(method!=="POST")return respond(request,{error:"method_not_allowed"},405);
    if(!ORIGINS.has(request.headers.get("Origin")))return respond(request,{error:"origin_not_allowed"},403);
    const token=tokenFromRequest(request);
    if(token&&dbReady(env))await env.CENTRAL_DB.prepare("UPDATE compat_auth_sessions SET revoked_at_ms=? WHERE session_hash=?").bind(Date.now(),await sha256hex(token)).run();
    return respond(request,{success:true},200,{"Set-Cookie":COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0"});
  }
  if(path==="/api/apps/echostars/ticket"){
    if(env?.ECHO_TICKETS_ENABLED!=="true")return respond(request,{error:"ticket_exchange_not_ready"},503);
    if(method!=="POST")return respond(request,{error:"method_not_allowed"},405);
    if(!ORIGINS.has(request.headers.get("Origin")))return respond(request,{error:"origin_not_allowed"},403);
    if(!dbReady(env))return respond(request,{error:"service_unavailable"},503);
    const identity=await sessionOf(request,env);
    if(!identity)return respond(request,{authenticated:false,error:"unauthorized"},401);
    const access=await env.CENTRAL_DB.prepare("SELECT legacy_status FROM compat_legacy_app_access WHERE legacy_user_id=? AND app_id='echostars' LIMIT 1").bind(identity.id).first();
    if(!access||access.legacy_status!=="active")return respond(request,{authenticated:false,error:"echo_access_not_active"},403);
    if(!(await liveEchoPermission(env,identity.id)))return respond(request,{authenticated:false,error:"echo_live_access_revoked_or_unavailable"},403);
    const now=Date.now(),code=makeToken(),codeHash=await sha256hex(code);
    await env.CENTRAL_DB.prepare("INSERT INTO compat_auth_tickets(code_hash,legacy_user_id,app_id,issued_at_ms,expires_at_ms) VALUES(?,?,?,?,?)").bind(codeHash,identity.id,"echostars",now,now+120000).run();
    return respond(request,{authenticated:true,code,redirect:"https://echo.starry.phd/auth/callback?code="+encodeURIComponent(code),expires_in:120,scope:"legacy_echo_only"},200);
  }
  if(path==="/api/v1/compat/tickets/consume"){
    if(env?.ECHO_TICKETS_ENABLED!=="true")return respond(request,{error:"ticket_exchange_not_ready"},503);
    if(method!=="POST")return respond(request,{error:"method_not_allowed"},405);
    const origin=request.headers.get("Origin");
    if(origin && !ORIGINS.has(origin))return respond(request,{error:"origin_not_allowed"},403);
    if(!dbReady(env))return respond(request,{error:"service_unavailable"},503);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type")||""))return respond(request,{error:"unsupported_content_type"},415);
    if(Number(request.headers.get("Content-Length")||0)>1500)return respond(request,{error:"payload_too_large"},413);
    let body;try{const raw=await request.text();if(raw.length>1500)return respond(request,{error:"payload_too_large"},413);body=JSON.parse(raw);}catch{return respond(request,{error:"invalid_json"},400);}
    if(body?.appId!=="echostars"||typeof body?.code!=="string"||!/^[A-Za-z0-9_-]{42,48}$/.test(body.code))return respond(request,{error:"invalid_ticket"},401);
    const hash=await sha256hex(body.code),now=Date.now();
    const row=await env.CENTRAL_DB.prepare("UPDATE compat_auth_tickets SET consumed_at_ms=? WHERE code_hash=? AND app_id='echostars' AND consumed_at_ms IS NULL AND expires_at_ms>? RETURNING legacy_user_id").bind(now,hash,now).first();
    if(!row)return respond(request,{authenticated:false,error:"ticket_expired_or_used"},401);
    const principal=await env.CENTRAL_DB.prepare("SELECT p.legacy_user_id,p.display_name,p.account_status,a.legacy_status FROM compat_legacy_principals p JOIN compat_legacy_app_access a ON a.legacy_user_id=p.legacy_user_id AND a.app_id='echostars' WHERE p.legacy_user_id=? LIMIT 1").bind(row.legacy_user_id).first();
    if(!principal||principal.account_status!=="active"||principal.legacy_status!=="active")return respond(request,{authenticated:false,error:"echo_access_not_active"},403);
    if(!(await liveEchoPermission(env,principal.legacy_user_id)))return respond(request,{authenticated:false,error:"echo_live_access_revoked_or_unavailable"},403);
    const echoLink=await env.CENTRAL_DB.prepare("SELECT echo_local_user_id FROM compat_echo_legacy_links WHERE legacy_user_id=? LIMIT 1").bind(principal.legacy_user_id).first();
    return respond(request,{authenticated:true,starryUserId:principal.legacy_user_id,echoLegacyUserId:echoLink?.echo_local_user_id||null,user:{id:principal.legacy_user_id,name:principal.display_name||""},membership_status:"legacy_unverified",scope:"legacy_echo_only"});
  }
  if(/^\/api\/apps\/[a-z0-9-]+\/ticket$/.test(path))return respond(request,{error:"app_not_enabled"},503);
  return null;
}
export const compatTest = {googleClaims,sha256hex,tokenFromRequest};

// CENTRAL-OWNED issuance core; NOT a Worker fetch endpoint or public API.
// A trusted Central portal/controller must authenticate CSRF and intended App
// before calling. No user_id, Email, or authorization state is accepted from caller.
// Fail closed by default until Central OAuth/brand-grant workflow is approved.
const utf8=new TextEncoder();
const SESSION=/^[A-Za-z0-9_-]{43}$/;
const hex=async raw=>Array.from(
 new Uint8Array(await crypto.subtle.digest("SHA-256",utf8.encode(raw))),
 b=>b.toString(16).padStart(2,"0")).join("");
const randToken=()=>{
 const buf=new Uint8Array(32);
 crypto.getRandomValues(buf);
 return btoa(String.fromCharCode(...buf))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
export const DEFAULT_TTL_MS=5*60*1000;

// The conditional INSERT SELECT runs in one SQLite statement so a session
// revoked or an approval removed before the issuance write cannot win a
// read-then-write race. No cross-App or Battery DB access is needed.
const ISSUE_SQL=`
INSERT INTO central_service_access_tokens(
 token_sha256,user_id,brand_scope,audience,issued_auth_version,
 issued_at_ms,expires_at_ms,issuer_reference,source_session_hash)
SELECT ?,u.user_id,'starry','starry-battery',u.auth_version,
       ?, MIN(?,s.expires_at_ms),'central-session-bound-v1',s.session_id_hash
FROM auth_sessions s
JOIN identity_users u ON u.user_id=s.user_id
JOIN central_brand_authorizations g ON g.user_id=s.user_id AND g.brand_scope='starry'
WHERE s.session_id_hash=? AND s.brand_scope='central'
 AND s.revoked_at_ms IS NULL AND s.issued_auth_version=u.auth_version
 AND s.issued_at_ms<=? AND s.expires_at_ms>?
 AND u.membership_status='approved'
 AND u.suspended_at_ms IS NULL AND u.deleted_at_ms IS NULL
 AND g.revoked_at_ms IS NULL AND g.granted_at_ms<=?
RETURNING user_id,expires_at_ms`;

// Internal-only function: the caller MUST have a verified central session
// cookie from origin-checked CSRF-protected Central UI.
// This function validates the cookie in CENTRAL D1 again; no caller-supplied
// principal/claims can override the DB's user identity or authorization.
export async function issueCentralStarryToken(env,rawSession,nowMs=Date.now()){
 if(env?.CENTRAL_TOKEN_ISSUER_ENABLED!=="true"||!env?.CENTRAL_DB?.prepare)
  return {ok:false,error:"issuer_unavailable"};
 if(typeof rawSession!=="string"||!SESSION.test(rawSession))
  return {ok:false,error:"invalid_session"};
 if(!Number.isSafeInteger(nowMs)||nowMs<=0)
  return {ok:false,error:"invalid_clock"};
 try{
  const token=randToken();
  const hash=await hex(token),sessionHash=await hex(rawSession);
  const row=await env.CENTRAL_DB.prepare(ISSUE_SQL).bind(
   hash,nowMs,nowMs+DEFAULT_TTL_MS,sessionHash,nowMs,nowMs,nowMs
  ).first();
  if(!row)return {ok:false,error:"authorization_required"};
  // Token is returned exactly once. Never log, store, or include it in URLs.
  return {ok:true,token,expires_at_ms:row.expires_at_ms};
 }catch{
  return {ok:false,error:"issuer_unavailable"};
 }
}

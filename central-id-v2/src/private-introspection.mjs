// CENTRAL ID-owned private cross-service identity verification.
// NEVER attach a public workers.dev route or custom domain to this Worker.
// Starry Battery owns the caller Gateway/Engine and must review the cross-worker
// credential contract before enabling any live binding.
// This component does not issue bearer tokens or write to Central D1.
const RESPONSE_HEADERS={
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store",
 "X-Content-Type-Options":"nosniff"
};
const reply=(payload,status)=>new Response(JSON.stringify(payload),{status,headers:RESPONSE_HEADERS});
const SECRET_HEADER="X-Central-Service-Auth";
const TOKEN=/^[A-Za-z0-9_-]{43,256}$/;
const USER_ID=/^[A-Za-z0-9_-]{6,128}$/;
const utf8=new TextEncoder();
const constantTimeEqual=(a,b)=>{
 if(typeof a!=="string"||typeof b!=="string"||a.length>512||b.length>512)return false;
 const x=utf8.encode(a),y=utf8.encode(b);
 let diff=x.length^y.length;
 for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
 return diff===0;
};
const sha256Hex=async value=>{
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",utf8.encode(value)));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
};
const statement=`
SELECT t.user_id, t.brand_scope, t.audience, t.expires_at_ms,
       t.issued_auth_version, t.revoked_at_ms, u.auth_version,
       u.membership_status, u.suspended_at_ms, u.deleted_at_ms,
       g.granted_at_ms AS brand_granted_at_ms, g.revoked_at_ms AS brand_revoked_at_ms,
       t.issued_at_ms, s.issued_at_ms AS parent_issued_at_ms,
       s.expires_at_ms AS parent_expires_at_ms, s.revoked_at_ms AS parent_revoked_at_ms,
       s.brand_scope AS parent_brand_scope, s.issued_auth_version AS parent_auth_version
FROM central_service_access_tokens t
JOIN identity_users u ON u.user_id=t.user_id
JOIN central_brand_authorizations g ON g.user_id=t.user_id AND g.brand_scope=t.brand_scope
JOIN auth_sessions s ON s.session_id_hash=t.source_session_hash AND s.user_id=t.user_id
WHERE t.token_sha256=? AND t.brand_scope='starry' AND t.audience='starry-battery'
LIMIT 1`;

// No identity assertion (user_id/email/brand) from the caller request is trusted.
// All grants, session version and suspension/deletion checks originate in CENTRAL D1.
export async function introspect(request,env,nowMs=Date.now()){
 const u=new URL(request.url);
 if(u.pathname!=="/v1/introspect")return reply({error:"not_found"},404);
 if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
 const callerSecret=env?.CENTRAL_AUTH_CALLER_SECRET;
 if(typeof callerSecret!=="string"||callerSecret.length<32||!env?.CENTRAL_DB?.prepare)
  return reply({error:"dependency_unavailable"},503);
 if(!constantTimeEqual(request.headers.get(SECRET_HEADER)||"",callerSecret))
  return reply({error:"unauthorized"},401);
 if(request.headers.get("X-Battery-Caller")!=="starry")
  return reply({error:"unauthorized"},401);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type")||""))
  return reply({error:"unsupported_content_type"},415);
 const bearer=request.headers.get("Authorization")||"";
 if(!bearer.startsWith("Bearer ")||!TOKEN.test(bearer.slice(7)))
  return reply({error:"unauthorized"},401);
 const declared=Number(request.headers.get("Content-Length")||0);
 if(!Number.isSafeInteger(declared)||declared<0||declared>160)return reply({error:"invalid_payload"},400);
 let body;
 try{
  const raw=await request.text();
  if(raw.length>160)return reply({error:"invalid_payload"},400);
  body=JSON.parse(raw);
 }catch{return reply({error:"invalid_payload"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).sort().join(",")!=="required_brand"||body.required_brand!=="starry")
  return reply({error:"invalid_payload"},400);
 let data;
 try{
  data=await env.CENTRAL_DB.prepare(statement).bind(await sha256Hex(bearer.slice(7))).first();
 }catch{return reply({error:"dependency_unavailable"},503);}
 if(!data||!USER_ID.test(data.user_id||""))return reply({error:"unauthorized"},401);
 if(data.brand_scope!=="starry"||data.audience!=="starry-battery"||
    data.revoked_at_ms!==null||data.brand_revoked_at_ms!==null||
    data.parent_revoked_at_ms!==null||data.parent_brand_scope!=="central"||
    !Number.isSafeInteger(data.issued_at_ms)||data.issued_at_ms<=0||
    !Number.isSafeInteger(data.brand_granted_at_ms)||data.brand_granted_at_ms>data.issued_at_ms||
    !Number.isSafeInteger(data.parent_issued_at_ms)||data.parent_issued_at_ms>data.issued_at_ms||
    !Number.isSafeInteger(data.parent_expires_at_ms)||data.parent_expires_at_ms<=nowMs||
    !Number.isSafeInteger(data.expires_at_ms)||data.expires_at_ms<=nowMs||data.expires_at_ms>data.parent_expires_at_ms||
    !Number.isSafeInteger(data.issued_auth_version)||data.parent_auth_version!==data.issued_auth_version||
    data.issued_auth_version!==data.auth_version||
    data.suspended_at_ms!==null||data.deleted_at_ms!==null||
    data.membership_status!=="approved"){
  return reply({error:"forbidden"},403);
 }
 return reply({active:true,brand_allowed:true,user_id:data.user_id,suspended:false},200);
}
export default {fetch(request,env){return introspect(request,env);}};

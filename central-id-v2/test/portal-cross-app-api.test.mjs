import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {crossAppRoute} from "../src/cross-app-identity.mjs";
import {demoRoute} from "../src/cross-app-demo.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin="https://id.hglobal1985.com";
const root="https://id.hglobal1985.com/api/v1/apps/";
const now=Date.now();
const make=(p,{method="GET",originHeader=origin,body,headers={}}={})=>new Request(root+p,{
 method,headers:{...(originHeader?{Origin:originHeader}:{}),...(body?{"Content-Type":"application/json"}:{}),...headers},
 ...(body?{body:JSON.stringify(body)}:{})
});
const jwt=nonce=>"e30."+Buffer.from(JSON.stringify({nonce})).toString("base64url")+".sig";
function sandbox(){
 const challenges=new Map(),tokens=new Map(),events=[],legacy={imported:false};
 const user={user_id:"central-user-abcd1234",auth_version:1,membership_status:"approved",
  suspended_at_ms:null,deleted_at_ms:null,display_name:"測試會員"};
 const db={prepare(sql){
  return{bind(...args){return{
   async run(){
    events.push({sql,args});
    if(sql.includes("INSERT INTO central_app_login_challenges")){
     const [hash,app,origin,t,expires]=args;
     challenges.set(hash,{hash,app,origin,issued:t,expires,consumed:null});
     return{success:true};
    }
    throw Error("unexpected run "+sql);
   },
   async first(){
    events.push({sql,args});
    if(sql.includes("UPDATE central_app_login_challenges")){
     const [time,hash,app,origin,current]=args;
     const x=challenges.get(hash);
     if(!x||x.app!==app||x.origin!==origin||x.consumed!==null||x.expires<=current)return null;
     x.consumed=time;return{nonce_sha256:hash};
    }
    if(sql.includes("SELECT legacy_user_id FROM compat_legacy_principals")){
     return legacy.imported?{legacy_user_id:user.user_id}:null;
    }
    if(sql.includes("FROM auth_provider_links")){
     return args[0]==="google-test-sub"?user:null;
    }
    if(sql.includes("INSERT INTO central_app_access_tokens")){
     const [hash,app,nonce,t,expires,id]=args;
     if(id!==user.user_id||user.suspended_at_ms!==null||user.deleted_at_ms!==null)return null;
     tokens.set(hash,{hash,app,nonce,issued:t,expires,user_id:id,version:user.auth_version,revoked:null});
     return{token_sha256:hash};
    }
    if(sql.includes("FROM central_app_access_tokens t")){
     const [hash,app]=args;
     const token=tokens.get(hash);
     if(!token||token.app!==app)return null;
     return{app_id:token.app,issued_auth_version:token.version,issued_at_ms:token.issued,
      expires_at_ms:token.expires,revoked_at_ms:token.revoked,...user};
    }
    if(sql.includes("UPDATE central_app_access_tokens SET revoked_at_ms")){
     const [t,hash,app,current]=args;
     const v=tokens.get(hash);
     if(!v||v.app!==app||v.revoked!==null||v.expires<=current)return null;
     v.revoked=t;return{token_sha256:hash};
    }
    throw Error("unexpected first "+sql);
   }
  }}}
 }};
 return{CENTRAL_DB:db,user,challenges,tokens,events,legacy};
}
const verified=async (_token,_fetch,audience)=>{
 assert.equal(audience,"791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com");
 return{subject:"google-test-sub"};
};
test("public API status never claims privilege or direct D1 access",async()=>{
 const r=await crossAppRoute(make("status"),{},now);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.enabled,true);
 assert.equal(data.member_database_direct_access,false);
 assert.equal(data.privileged_scopes_enabled,false);
 assert.equal(data.battery_access_enabled,false);
 assert.equal(r.headers.get("Cache-Control"),"no-store");
});
test("anonymous and unknown origins cannot obtain membership data",async()=>{
 assert.equal((await crossAppRoute(make("me"),sandbox(),now)).status,401);
 const evil=await crossAppRoute(make("challenge",{method:"POST",originHeader:"https://evil.example",body:{app_id:"hglobal-web"}}),sandbox(),now);
 assert.equal(evil.status,403);
 assert.equal(evil.headers.get("Access-Control-Allow-Origin"),null);
 const other=await crossAppRoute(make("challenge",{method:"POST",originHeader:"https://starry.phd",body:{app_id:"hglobal-web"}}),sandbox(),now);
 assert.equal(other.status,400);
});
test("one-time signed Google nonce exchanges for 5 minute CENTRAL token, then only own minimum profile",async()=>{
 const env=sandbox();
 const start=await crossAppRoute(make("challenge",{method:"POST",body:{app_id:"hglobal-web"}}),env,now);
 assert.equal(start.status,200);
 const {nonce,google_client_id}=await start.json();
 assert.match(nonce,/^[A-Za-z0-9_-]{43}$/);
 assert.match(google_client_id,/apps.googleusercontent.com$/);
 const response=await crossAppRoute(make("token",{method:"POST",body:{app_id:"hglobal-web",nonce,credential:jwt(nonce)}}),env,now,verified);
 assert.equal(response.status,200);
 const issued=await response.json();
 assert.match(issued.access_token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(issued.expires_in,300);
 assert.equal(issued.scope,"central.identity.read");
 assert.equal(env.tokens.size,1);
 assert.equal(env.tokens.has(issued.access_token),false,"D1 must store only a SHA-256 hash");
 const headers={Authorization:"Bearer "+issued.access_token,"X-Central-App":"hglobal-web"};
 const me=await crossAppRoute(make("me",{headers,originHeader:null}),env,now);
 assert.equal(me.status,200);
 const identity=await me.json();
 assert.equal(identity.user_id,env.user.user_id);
 assert.equal(identity.display_name,"測試會員");
 assert.equal(identity.membership_status,"approved");
 assert.equal(identity.battery_authorized,false);
 assert.equal(identity.management_authorized,false);
 for(const key of ["contact_email","mobile_e164","amway_number","role","other_users"])
  assert.equal(Object.hasOwn(identity,key),false,key);
 const replay=await crossAppRoute(make("token",{method:"POST",body:{app_id:"hglobal-web",nonce,credential:jwt(nonce)}}),env,now,verified);
 assert.equal(replay.status,401,"single-use proof cannot mint two tokens");
 env.legacy.imported=true;
 assert.equal((await crossAppRoute(make("me",{headers}),env,now)).status,401,
  "legacy imported accounts without live source fail closed");
 env.legacy.imported=false;
 env.user.auth_version++;
 assert.equal((await crossAppRoute(make("me",{headers}),env,now)).status,401,"auth_version revokes existing tokens");
 env.user.auth_version--;
 env.user.suspended_at_ms=now;
 assert.equal((await crossAppRoute(make("me",{headers}),env,now)).status,401,"suspension denies");
 env.user.suspended_at_ms=null;
 const revoke=await crossAppRoute(make("revoke",{method:"POST",headers}),env,now);
 assert.equal(revoke.status,200);
 assert.deepEqual(await revoke.json(),{revoked:true});
 assert.equal((await crossAppRoute(make("me",{headers}),env,now)).status,401,"revoked token denied");
});
test("forged nonce, unexpected fields and missing D1 always fail closed",async()=>{
 const env=sandbox();
 const c=await crossAppRoute(make("challenge",{method:"POST",body:{app_id:"hglobal-web"}}),env,now);
 const {nonce}=await c.json();
 const bad=await crossAppRoute(make("token",{method:"POST",body:{app_id:"hglobal-web",nonce,credential:jwt("B".repeat(43))}}),env,now,verified);
 assert.equal(bad.status,401);
 const extra=await crossAppRoute(make("token",{method:"POST",body:{app_id:"hglobal-web",nonce,credential:jwt(nonce),user_id:"admin"}}),env,now,verified);
 assert.equal(extra.status,400);
 const missing=await crossAppRoute(make("challenge",{method:"POST",body:{app_id:"hglobal-web"}}),{},now);
 assert.equal(missing.status,503);
 const invalidProof=await crossAppRoute(make("token",{method:"POST",body:{app_id:"hglobal-web",nonce,credential:jwt(nonce)}}),env,now,async()=>{throw Error("bad signature");});
 assert.equal(invalidProof.status,401);
});
test("browser CORS is origin allowlisted and demo never displays bearer credential",async()=>{
 const ok=await crossAppRoute(make("me",{method:"OPTIONS"}),{},now);
 assert.equal(ok.status,204);
 assert.equal(ok.headers.get("Access-Control-Allow-Origin"),origin);
 const forbidden=await crossAppRoute(make("me",{method:"OPTIONS",originHeader:"https://attacker.com"}),{},now);
 assert.equal(forbidden.status,403);
 const page=demoRoute(new Request("https://id.hglobal1985.com/apps/api-test"));
 assert.equal(page.status,200);
 assert.match(await page.text(),/中央會員 API｜正式自測/);
 const script=demoRoute(new Request("https://id.hglobal1985.com/apps/api-test.js"));
 const source=await script.text();
 assert.match(source,/central.identity|\/api\/v1\/apps\/me/);
 assert.match(source,/\/api\/v1\/apps\/revoke/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});

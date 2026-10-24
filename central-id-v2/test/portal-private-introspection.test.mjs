import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {introspect} from "../src/private-introspection.mjs";
import {issueCentralStarryToken,DEFAULT_TTL_MS} from "../src/private-token-issuer.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const token="A".repeat(43);
const secret="S".repeat(43);
const now=2000000;
const url="https://central-auth.internal/v1/introspect";
const payload=JSON.stringify({required_brand:"starry"});
const make=(options={})=>new Request(options.url||url,{
 method:options.method||"POST",
 headers:{
  Authorization:"Bearer "+(options.token??token),
  "X-Battery-Caller":options.brand??"starry",
  "X-Central-Service-Auth":options.secret??secret,
  "Content-Type":"application/json",
  ...options.headers
 },
 body:(options.method||"POST")==="POST"?(options.payload??payload):undefined
});
const row=(changes={})=>({
 user_id:"central-user-12345",
 brand_scope:"starry",audience:"starry-battery",
 expires_at_ms:now+30000,issued_auth_version:2,
 revoked_at_ms:null,auth_version:2,
 membership_status:"approved",suspended_at_ms:null,deleted_at_ms:null,
 brand_granted_at_ms:1000,brand_revoked_at_ms:null,
 issued_at_ms:now-1000,parent_issued_at_ms:1000,parent_expires_at_ms:now+600000,
 parent_revoked_at_ms:null,parent_brand_scope:"central",parent_auth_version:2,...changes
});
const mockDb=(result=row())=>{
 const history=[];
 return {
  history,
  prepare(sql){
   assert.match(sql,/FROM central_service_access_tokens/);
   assert.match(sql,/JOIN identity_users/);
   assert.match(sql,/JOIN central_brand_authorizations/);
   assert.match(sql,/JOIN auth_sessions/);
   return{bind(hash){history.push(hash);return {async first(){return result}}}};
  }
 };
};
const env=(db=mockDb())=>({CENTRAL_DB:db,CENTRAL_AUTH_CALLER_SECRET:secret});
test("private Central Auth returns exact minimal response for approved starry scope",async()=>{
 const db=mockDb(),res=await introspect(make(),env(db),now);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{active:true,brand_allowed:true,user_id:"central-user-12345",suspended:false});
 assert.match(db.history[0],/^[0-9a-f]{64}$/);
 assert.equal(res.headers.get("Cache-Control"),"no-store");
 assert.equal(res.headers.get("Access-Control-Allow-Origin"),null);
});
test("missing binding/secret, forged caller, invalid brand or invalid method all fail closed",async()=>{
 for(const e of [{},{CENTRAL_DB:mockDb()},{CENTRAL_AUTH_CALLER_SECRET:secret}]){
  const r=await introspect(make(),e,now);assert.equal(r.status,503);
 }
 for(const overrides of [{secret:"X".repeat(43)},{brand:"hglobal"}]){
  const r=await introspect(make(overrides),env(),now);assert.equal(r.status,401);
 }
 assert.equal((await introspect(make({method:"GET"}),env(),now)).status,405);
 assert.equal((await introspect(make({url:"https://central-auth.internal/public"}),env(),now)).status,404);
});
test("only exact Starry JSON payload and opaque Central access token are allowed",async()=>{
 for(const value of [
  JSON.stringify({required_brand:"hglobal"}),
  JSON.stringify({required_brand:"starry",user_id:"attacker"}),
  JSON.stringify({required_brand:"starry",active:true}),
  JSON.stringify({required_brand:"starry",email:"someone@example.com"}),
  "{bad",JSON.stringify(["starry"])
 ]){
  const r=await introspect(make({payload:value}),env(),now);
  assert.equal(r.status,400,value);
 }
 for(const invalid of ["eyJhbGciOiJSUzI1NiJ9.x.y","cookie-session","short"]){
  const r=await introspect(make({token:invalid}),env(),now);
  assert.equal(r.status,401);
 }
});
test("deleted, suspended, revoked, expired, changed auth_version and brand revoked all deny",async()=>{
 const bad=[
  {suspended_at_ms:5},{deleted_at_ms:5},{revoked_at_ms:3},
  {brand_revoked_at_ms:2},{expires_at_ms:now},
  {issued_auth_version:1},{auth_version:3},
  {membership_status:"pending"},
  {parent_revoked_at_ms:now-2},
  {parent_brand_scope:"starry"},
  {parent_expires_at_ms:now},
  {parent_auth_version:3},
  {parent_issued_at_ms:now+5},
  {issued_at_ms:now+1},
  {parent_expires_at_ms:now+5},
  {brand_granted_at_ms:now+1},
  {expires_at_ms:now+900001},
  {brand_granted_at_ms:now+5},
  {brand_scope:"hglobal"},{audience:"another-app"},
  {user_id:""}
 ];
 for(const reason of bad){
  const r=await introspect(make(),env(mockDb(row(reason))),now);
  assert.notEqual(r.status,200,JSON.stringify(reason));
 }
 assert.equal((await introspect(make(),env(mockDb(null)),now)).status,401);
});
test("untrusted clock input always fails closed",async()=>{
 for(const clock of [NaN,Infinity,-1,0,1.5]){
  const r=await introspect(make(),env(mockDb(row())),clock);
  assert.notEqual(r.status,200);
 }
});
test("central D1 error returns dependency-unavailable not cached allow",async()=>{
 const broken={prepare(){throw Error("D1 is disconnected")}};
 const r=await introspect(make(),env(broken),now);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:"dependency_unavailable"});
});


test("Central issuer defaults OFF; never trusts caller-provided identity",async()=>{
 assert.deepEqual(await issueCentralStarryToken({},"S".repeat(43),now),{ok:false,error:"issuer_unavailable"});
 assert.deepEqual(await issueCentralStarryToken({CENTRAL_TOKEN_ISSUER_ENABLED:"true",CENTRAL_DB:{prepare(){throw Error("should not access db")}}},"bad",now),
  {ok:false,error:"invalid_session"});
});
test("Central issuer rechecks live session and Starry brand grant in one atomic INSERT SELECT",async()=>{
 let count=0,captured=null,sql="";
 const db={prepare(q){sql=q;return{bind(...args){captured=args;return{async first(){count++;return{user_id:"central-user-12345",expires_at_ms:now+60000};}}}}}};
 const issued=await issueCentralStarryToken({CENTRAL_DB:db,CENTRAL_TOKEN_ISSUER_ENABLED:"true"},"S".repeat(43),now);
 assert.equal(issued.ok,true);
 assert.match(issued.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(issued.expires_at_ms,now+60000);
 assert.equal(count,1);
 assert.equal(captured.length,7);
 for(const i of [0,3]) assert.match(captured[i],/^[a-f0-9]{64}$/);
 assert.equal(captured[1],now);
 assert.equal(captured[2],now+DEFAULT_TTL_MS);
 assert.match(sql,/INSERT INTO central_service_access_tokens/);
 assert.match(sql,/FROM auth_sessions s/);
 assert.match(sql,/s\.revoked_at_ms IS NULL/);
 assert.match(sql,/s\.issued_auth_version=u\.auth_version/);
 assert.match(sql,/u\.membership_status='approved'/);
 assert.match(sql,/g\.revoked_at_ms IS NULL/);
 assert.match(sql,/RETURNING user_id,expires_at_ms/);
 assert.equal(JSON.stringify(issued).includes("user_id"),false);
});
test("Central issuer cannot return a token on revoked session, D1 outage, or no eligible row",async()=>{
 const denied={prepare(){return{bind(){return{async first(){return null;}}}}}};
 const offline={prepare(){throw Error("D1 unavailable")}};
 for(const [db,error] of [[denied,"authorization_required"],[offline,"issuer_unavailable"]]){
  const answer=await issueCentralStarryToken({CENTRAL_DB:db,CENTRAL_TOKEN_ISSUER_ENABLED:"true"},"S".repeat(43),now);
  assert.deepEqual(answer,{ok:false,error});
 }
});

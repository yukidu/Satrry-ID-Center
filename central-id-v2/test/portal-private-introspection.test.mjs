import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {introspect} from "../src/private-introspection.mjs";
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
 brand_granted_at_ms:1000,brand_revoked_at_ms:null,...changes
});
const mockDb=(result=row())=>{
 const history=[];
 return {
  history,
  prepare(sql){
   assert.match(sql,/FROM central_service_access_tokens/);
   assert.match(sql,/JOIN identity_users/);
   assert.match(sql,/JOIN central_brand_authorizations/);
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
  {brand_scope:"hglobal"},{audience:"another-app"},
  {user_id:""}
 ];
 for(const reason of bad){
  const r=await introspect(make(),env(mockDb(row(reason))),now);
  assert.notEqual(r.status,200,JSON.stringify(reason));
 }
 assert.equal((await introspect(make(),env(mockDb(null)),now)).status,401);
});
test("central D1 error returns dependency-unavailable not cached allow",async()=>{
 const broken={prepare(){throw Error("D1 is disconnected")}};
 const r=await introspect(make(),env(broken),now);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{error:"dependency_unavailable"});
});

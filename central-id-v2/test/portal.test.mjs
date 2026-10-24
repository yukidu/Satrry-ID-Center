import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import app from "../src/index.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base="https://id.hglobal1985.com";
const req=(p,options={})=>new Request(base+p,options);
test("central homepage presents real login entry and private dashboard redirects anonymous",async()=>{
 const page=await app.fetch(req("/"));
 assert.equal(page.status,200);
 const h=await page.text();
 assert.match(h,/href="\/login">Google 會員登入/);
 const login=await app.fetch(req("/login"));
 assert.equal(login.status,200);
 const loginHtml=await login.text();
 assert.match(loginHtml,/id="google-button"/);
 assert.doesNotMatch(loginHtml,/starry|繁星|echo|id\.starry\.phd/i);
 assert.match(login.headers.get("Content-Security-Policy"),/accounts.google.com\/gsi\/client/);
 const dashboard=await app.fetch(req("/dashboard"));
 assert.equal(dashboard.status,303);
 assert.equal(dashboard.headers.get("Location"),base+"/login");
 const settings=await app.fetch(req("/me/settings"));
 assert.equal(settings.status,303);
 assert.equal(settings.headers.get("Location"),base+"/login");
 const anon=await app.fetch(req("/api/v1/portal/me"));
 assert.equal(anon.status,401);
});
test("portal login requires real Google JWT and same-origin POST",async()=>{
 const r=await app.fetch(req("/api/v1/portal/google-login",{
  method:"POST",headers:{"Origin":base,"Content-Type":"application/json"},
  body:JSON.stringify({appId:"central",termsAccepted:true,credential:"fake.jwt.token"})
 }),{CENTRAL_DB:{prepare(){throw Error("must not query for forged JWT");}}});
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,"credential_invalid");
 const evil=await app.fetch(req("/api/v1/portal/google-login",{
  method:"POST",headers:{"Origin":"https://evil.example","Content-Type":"application/json"},
  body:JSON.stringify({appId:"central",termsAccepted:true,credential:"fake.jwt.token"})
 }));
 assert.equal(evil.status,403);
});
test("challenge cookie is random, secure, HttpOnly, SameSite Lax",async()=>{
 let count=0;
 const env={CENTRAL_DB:{prepare(sql){
   assert.match(sql,/INSERT INTO central_login_challenges/);
   return {bind(...args){
     assert.equal(args.length,3);
     assert.ok(args[2]>args[1]);
     return {run:async()=>{count++;return {success:true}}};
   }};
 }}};
 const a=await app.fetch(req("/api/v1/portal/challenge"),env);
 assert.equal(a.status,200);
 const data=await a.json();
 assert.equal(data.nonce.length,43);
 assert.equal(data.google_client_id,"791614645185-vbaqqbnr463r1vi4ga41uh73s7eg0gv5.apps.googleusercontent.com");
 assert.notEqual(data.google_client_id,"661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com");
 assert.match(a.headers.get("Set-Cookie"),/HttpOnly; Secure; SameSite=Lax/);
 const b=await app.fetch(req("/api/v1/portal/challenge"),env);
 assert.notEqual((await b.json()).nonce,data.nonce);
 assert.equal(count,2);
});
test("invalid login attempt cannot create member session or receive admin privileges",async()=>{
 const bad=await app.fetch(req("/api/v1/portal/google-login",{
 method:"POST",headers:{"Origin":base,"Content-Type":"application/json"},
 body:JSON.stringify({appId:"central",termsAccepted:false,credential:"fake.jwt.token"})
 }),{CENTRAL_DB:{prepare(){throw Error("unexpected DB")}}});
 assert.equal(bad.status,400);
 assert.equal((await bad.json()).error,"consent_required");
});

test("profile writes are authenticated, same-origin and allowlisted",async()=>{
 const unauth=await app.fetch(req("/api/v1/portal/profile",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({field:"display_name",value:"someone",version:1})}));
 assert.equal(unauth.status,503); // Missing D1 is fail closed.
 const wrongOrigin=await app.fetch(req("/api/v1/portal/profile",{method:"POST",headers:{Origin:"https://attacker.example","Content-Type":"application/json"},body:"{}"}));
 assert.equal(wrongOrigin.status,403);
});

test("logout cannot claim success when a central session was not revoked server-side",async()=>{
 const validCookie="central_id_portal="+"A".repeat(43);
 const make=()=>req("/api/v1/portal/logout",{method:"POST",headers:{Origin:base,Cookie:validCookie}});
 const unavailable=await app.fetch(make());
 assert.equal(unavailable.status,503);
 assert.equal((await unavailable.json()).error,"database_unavailable");
 assert.equal(unavailable.headers.get("Set-Cookie"),null);
 const networkFailure=await app.fetch(make(),{CENTRAL_DB:{prepare(){throw Error("isolated D1 unavailable");}}});
 assert.equal(networkFailure.status,503);
 assert.equal((await networkFailure.json()).error,"logout_failed");
 assert.equal(networkFailure.headers.get("Set-Cookie"),null);
 let writes=0;
 const rejected=await app.fetch(make(),{CENTRAL_DB:{prepare(sql){
  assert.match(sql,/UPDATE auth_sessions SET revoked_at_ms/);
  assert.match(sql,/revoked_at_ms IS NULL/);
  return {
   bind(_time,hash){
    assert.match(hash,/^[a-f0-9]{64}$/);
    return {async run(){writes++;return {success:false};}};
   }
  };
 }}});
 assert.equal(rejected.status,503);
 assert.equal((await rejected.json()).error,"logout_failed");
 assert.equal(writes,1);
});
test("confirmed logout revokes the central session and clears browser cookie",async()=>{
 const validCookie="central_id_portal="+"A".repeat(43);
 let revoked=false;
 const env={CENTRAL_DB:{prepare(sql){
  assert.match(sql,/UPDATE auth_sessions/);
  return{bind(_when,_hash){return{run:async()=>{revoked=true;return{success:true,meta:{changes:1}}}}}};
 }}};
 const res=await app.fetch(req("/api/v1/portal/logout",{method:"POST",headers:{Origin:base,Cookie:validCookie}}),env);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{ok:true});
 assert.equal(revoked,true);
 assert.match(res.headers.get("Set-Cookie"),/central_id_portal=;.*Max-Age=0/);
 const alreadyAbsent=await app.fetch(req("/api/v1/portal/logout",{method:"POST",headers:{Origin:base}}));
 assert.equal(alreadyAbsent.status,200);
 assert.match(alreadyAbsent.headers.get("Set-Cookie"),/Max-Age=0/);
});

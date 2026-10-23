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
 assert.match(await login.text(),/id="google-button"/);
 assert.match(login.headers.get("Content-Security-Policy"),/accounts.google.com\/gsi\/client/);
 const dashboard=await app.fetch(req("/dashboard"));
 assert.equal(dashboard.status,303);
 assert.equal(dashboard.headers.get("Location"),base+"/login");
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
 assert.match(data.google_client_id,/apps.googleusercontent.com$/);
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

test("explicit invalid central client configuration fails closed before database writes",async()=>{
 for(const value of ["",null,"attacker",42]){
  const env={HGLOBAL_GOOGLE_CLIENT_ID:value,CENTRAL_DB:{prepare(){throw Error("no writes");}}};
  const r=await app.fetch(req("/api/v1/portal/challenge"),env);
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,"oauth_configuration_invalid");
 }
});

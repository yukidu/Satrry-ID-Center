import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import app from "../src/index.mjs";
import {compatTest} from "../src/compat.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base="https://id.hglobal1985.com";
const request=(path,options={})=>new Request(base+path,options);
test("anonymous Echo session never leaks cloned member data",async()=>{
  for(const url of ["/api/session","/api/ecosystem/session"]){
    const headers=url.endsWith("ecosystem/session")?{"Origin":"https://echo.starry.phd"}:{};
    const res=await app.fetch(request(url,{headers}));
    assert.equal(res.status,200);
    assert.deepEqual(await res.json(),{authenticated:false});
  }
  const me=await app.fetch(request("/api/v1/me"));
  assert.equal(me.status,401);
  assert.equal((await me.json()).error,"unauthorized");
});
test("untrusted origins and unsafe ticket issuance fail closed",async()=>{
  let res=await app.fetch(request("/api/google-sync",{method:"POST",headers:{"Origin":"https://evil.example","Content-Type":"application/json"},body:'{"credential":"x","appId":"echostars"}'}));
  assert.equal(res.status,403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"),null);
  res=await app.fetch(request("/api/apps/echostars/ticket",{method:"POST",headers:{"Origin":"https://echo.starry.phd"}}));
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,"service_unavailable");
  res=await app.fetch(request("/api/v1/compat/readiness"));
  assert.equal(res.status,503);
  assert.equal((await res.json()).echo_cutover_ready,false);
});
test("CORS only approves allowlisted Echo origin and status never implies cutover",async()=>{
  const r=await app.fetch(request("/api/google-sync",{method:"OPTIONS",headers:{"Origin":"https://echo.starry.phd"}}));
  assert.equal(r.status,204);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"),"https://echo.starry.phd");
  const denied=await app.fetch(request("/api/google-sync",{method:"OPTIONS",headers:{"Origin":"https://fake.starry.phd.attacker.com"}}));
  assert.equal(denied.status,403);
});
test("Google JWT accepts only authentic RS256 and exact audience",async()=>{
  const pair=await webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
  const jwk=await webcrypto.subtle.exportKey("jwk",pair.publicKey);
  Object.assign(jwk,{kid:"test-key-1",use:"sig",alg:"RS256"});
  const enc=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
  const now=Math.floor(Date.now()/1000);
  const header=enc({alg:"RS256",kid:jwk.kid,typ:"JWT"});
  const claims={iss:"https://accounts.google.com",aud:"661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com",sub:"google-test-sub-123",email_verified:true,iat:now-10,exp:now+1000};
  async function token(payload){
    const parts=header+"."+enc(payload);
    const signature=await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(parts));
    return parts+"."+Buffer.from(signature).toString("base64url");
  }
  const fetcher=async()=>({ok:true,json:async()=>({keys:[jwk]})});
  const valid=await compatTest.googleClaims(await token(claims),fetcher);
  assert.equal(valid.subject,claims.sub);
  await assert.rejects(compatTest.googleClaims(await token({...claims,aud:"attacker-app"}),fetcher),/claims_invalid/);
  await assert.rejects(compatTest.googleClaims(await token({...claims,email_verified:false}),fetcher),/claims_invalid/);
  await assert.rejects(compatTest.googleClaims(await token({...claims,exp:now-10}),fetcher),/claims_invalid/);
  const forged=await token({...claims,sub:"forged"});
  const bad=forged.slice(0,-15)+"A".repeat(15);
  await assert.rejects(compatTest.googleClaims(bad,fetcher),/invalid_signature/);
});
test("old cookie is never a new-site login credential",async()=>{
  assert.equal(compatTest.tokenFromRequest(request("/",{headers:{"Cookie":"starry_id_session="+"s".repeat(43)}})),"");
  assert.equal(compatTest.tokenFromRequest(request("/",{headers:{"Cookie":"central_id_v2_session="+"z".repeat(43)}})),"z".repeat(43));
});

import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import gateway from "../battery/worker.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const base="https://battery-starry.internal", token="s".repeat(40);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const auth=(headers={})=>new Request(base+"/v1/battery/wallet",{headers:{"X-Battery-App-Id":"starry_echo","Authorization":"Bearer "+token,"X-Central-Access-Token":"verified-user-token",...headers}});
function makeEnv(expectedHash,scopes="balance:read",quotaAllowed=true){
 let count=0;
 return {get calls(){return count;},
  BATTERY_DB:{prepare(sql){return{bind(...args){return{async first(){
    count++;
    if(sql.includes("battery_app_clients"))return args[0]==="starry_echo"&&args[1]===expectedHash?{app_id:"starry_echo",scopes}:null;
    if(sql.includes("battery_app_rate_limits"))return quotaAllowed?{request_count:1}:null;
    if(sql.includes("battery_wallets"))return {available_units:15,reserved_units:5,version:4};
    throw Error("unexpected SQL");
  }}}}}},
  CENTRAL_AUTH_VERIFY:{async fetch(r){assert.equal(r.headers.get("X-Battery-Caller"),"starry");return new Response(JSON.stringify({active:true,brand_allowed:true,user_id:"user_123",suspended:false}),{status:200})}}
 };
}
test("all private routes are closed without central verifier or registered app",async()=>{
 const r=await gateway.fetch(auth(),{});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"dependency_unavailable");
});
test("valid registered Starry app can read only verified user's balance",async()=>{
 const env=makeEnv(await hash(token));
 const response=await gateway.fetch(auth(),env);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{available_units:15,reserved_units:5,version:4});
});
test("forged app token or missing scope cannot reach member wallet",async()=>{
 const env=makeEnv(await hash("different"),"balance:read");
 const wrong=await gateway.fetch(auth(),env);
 assert.equal(wrong.status,403);
 const restricted=makeEnv(await hash(token),"ledger:read");
 const noScope=await gateway.fetch(auth(),restricted);
 assert.equal(noScope.status,403);
 assert.equal(restricted.calls,1);
});
test("write operations never run without engine binding",async()=>{
 const env=makeEnv(await hash(token),"usage:reserve");
 const r=await gateway.fetch(new Request(base+"/v1/battery/reserve",{
 method:"POST",headers:{"X-Battery-App-Id":"starry_echo","Authorization":"Bearer "+token,"X-Central-Access-Token":"verified-user-token","Content-Type":"application/json"},
 body:JSON.stringify({operation_id:"operation123",quantity:4})
 }),env);
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"battery_engine_not_ready");
});

test("per-App quota rejects with HTTP 429 before contacting central identity",async()=>{
 const env=makeEnv(await hash(token),"balance:read",false);
 const response=await gateway.fetch(auth(),env);
 assert.equal(response.status,429);
 assert.equal((await response.json()).error,"rate_limit_exceeded");
 assert.equal(env.calls,2);
});
test("caller cannot forge user identity in reserve payload",async()=>{
 const env=makeEnv(await hash(token),"usage:reserve");
 env.BATTERY_ENGINE={async fetch(){throw Error("must not be called")}};
 env.BATTERY_ENGINE_SECRET="test-private-engine-key-".repeat(2);
 const response=await gateway.fetch(new Request(base+"/v1/battery/reserve",{
  method:"POST",
  headers:{"X-Battery-App-Id":"starry_echo","Authorization":"Bearer "+token,"X-Central-Access-Token":"verified-user-token","Content-Type":"application/json"},
  body:JSON.stringify({operation_id:"operation123",quantity:2,user_id:"victim-user"})
 }),env);
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,"invalid_operation");
});

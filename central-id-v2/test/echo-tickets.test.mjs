import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import app from "../src/index.mjs";
import {compatTest} from "../src/compat.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const token="z".repeat(43), base="https://id.hglobal1985.com";
function fixture(){
  const sessions=new Map(),tickets=new Map();
  let allowEcho=true;
  const db={
    prepare(sql){
      return {
        bind(...args){
          return {
            async first(){
              if(sql.includes("FROM compat_auth_sessions s")){
                const row=sessions.get(args[0]);return row&&row.expiresAt>Date.now() ? {legacy_user_id:"fake-user",display_name:"測試用戶",account_status:"active"}:null;
              }
              if(sql.includes("FROM compat_legacy_app_access WHERE"))return allowEcho?{legacy_status:"active"}:null;
              if(sql.includes("UPDATE compat_auth_tickets SET consumed_at_ms")){
                const row=tickets.get(args[1]);
                if(!row||row.used||row.expiresAt<=args[2])return null;
                row.used=true;return {legacy_user_id:"fake-user"};
              }
              if(sql.includes("FROM compat_echo_legacy_links"))return {echo_local_user_id:"echo-test-id"};
              if(sql.includes("FROM compat_legacy_principals p JOIN"))return {legacy_user_id:"fake-user",display_name:"測試用戶",account_status:"active",legacy_status:allowEcho?"active":"blocked"};
              if(sql.includes("COUNT(*) AS n FROM compat_migration_audit"))return {n:1};
              return null;
            },
            async run(){
              if(sql.includes("INSERT INTO compat_auth_tickets"))tickets.set(args[0],{used:false,expiresAt:args[4]});
              return {success:true};
            }
          };
        },
        async first(){return {n:1};}
      };
    }
  };
  return {db,sessions,tickets,revoke:()=>{allowEcho=false}};
}
const req=(path,method,body,headers={})=>new Request(base+path,{method,headers:{"Origin":"https://echo.starry.phd","Content-Type":"application/json","Cookie":"central_id_v2_session="+token,...headers},body:body===undefined?undefined:JSON.stringify(body)});
test("Echo ticket is short-lived, tied to app, and single-use",async()=>{
  const env=fixture();
  env.sessions.set(await compatTest.sha256hex(token),{expiresAt:Date.now()+500000});
  const first=await app.fetch(req("/api/apps/echostars/ticket","POST",{}),{CENTRAL_DB:env.db});
  assert.equal(first.status,200);
  const issued=await first.json();
  assert.equal(issued.authenticated,true);
  assert.equal(issued.scope,"legacy_echo_only");
  assert.equal(issued.expires_in,120);
  assert.ok(issued.redirect.startsWith("https://echo.starry.phd/auth/callback?code="));
  const consume=()=>app.fetch(req("/api/v1/compat/tickets/consume","POST",{code:issued.code,appId:"echostars"}),{CENTRAL_DB:env.db});
  const accepted=await consume();
  assert.equal(accepted.status,200);
  const data=await accepted.json();
  assert.equal(data.starryUserId,"fake-user");
  assert.equal(data.echoLegacyUserId,"echo-test-id");
  assert.equal(data.membership_status,"legacy_unverified");
  assert.equal((await consume()).status,401);
});
test("expired ticket and denied app access cannot issue reusable privileges",async()=>{
  const env=fixture();
  env.sessions.set(await compatTest.sha256hex(token),{expiresAt:Date.now()+500000});
  let res=await app.fetch(req("/api/apps/echostars/ticket","POST",{}),{CENTRAL_DB:env.db});
  const data=await res.json();
  const hash=await compatTest.sha256hex(data.code);
  env.tickets.get(hash).expiresAt=Date.now()-1;
  res=await app.fetch(req("/api/v1/compat/tickets/consume","POST",{code:data.code,appId:"echostars"}),{CENTRAL_DB:env.db});
  assert.equal(res.status,401);
  env.revoke();
  res=await app.fetch(req("/api/apps/echostars/ticket","POST",{}),{CENTRAL_DB:env.db});
  assert.equal(res.status,403);
});
test("ticket redemption refuses mismatched app ID and third-party browser origin",async()=>{
  const env=fixture();
  const x=await app.fetch(req("/api/v1/compat/tickets/consume","POST",{code:"A".repeat(43),appId:"gostarry"}),{CENTRAL_DB:env.db});
  assert.equal(x.status,401);
  const y=await app.fetch(req("/api/v1/compat/tickets/consume","POST",{code:"A".repeat(43),appId:"echostars"},{"Origin":"https://phishing.example"}),{CENTRAL_DB:env.db});
  assert.equal(y.status,403);
});

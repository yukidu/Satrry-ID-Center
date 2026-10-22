import test from "node:test";
import assert from "node:assert/strict";
import {redeemCentralEchoTicket} from "../echo-adapter/echo-central-ticket-client.mjs";

const code="A".repeat(43);
const success={
  authenticated:true,scope:"legacy_echo_only",membership_status:"legacy_unverified",
  starryUserId:"central-test-id",echoLegacyUserId:"echo-local-test-id"
};
test("server adapter securely accepts exact Echo ticket contract and uses fixed URL",async()=>{
  let called=false;
  const fetcher=async(url,init)=>{
    called=true;
    assert.equal(url,"https://id.hglobal1985.com/api/v1/compat/tickets/consume");
    assert.equal(init.method,"POST");
    assert.equal(init.redirect,"error");
    assert.equal(init.cache,"no-store");
    assert.equal(init.headers["Content-Type"],"application/json");
    assert.deepEqual(JSON.parse(init.body),{appId:"echostars",code});
    return new Response(JSON.stringify(success),{status:200});
  };
  const out=await redeemCentralEchoTicket(code,{fetcher});
  assert.equal(called,true);
  assert.deepEqual(out,{ok:true,status:200,centralUserId:"central-test-id",echoLegacyUserId:"echo-local-test-id",scope:"legacy_echo_only"});
});
test("invalid code does not call network and SSRF base is rejected",async()=>{
  const noCall=async()=>{throw Error("must_not_fetch")};
  assert.equal((await redeemCentralEchoTicket("invalid",{fetcher:noCall})).status,401);
  assert.equal((await redeemCentralEchoTicket(code,{fetcher:noCall,base:"https://attack.test"})).error,"central_origin_untrusted");
});
test("mismatched scope, private data or missing identifiers is not accepted",async()=>{
  for(const payload of [{...success,scope:"admin"},{...success,authenticated:false},{...success,starryUserId:null},{...success,membership_status:"approved"},{...success,echoLegacyUserId:{id:"x"}}]){
    const r=await redeemCentralEchoTicket(code,{fetcher:async()=>new Response(JSON.stringify(payload),{status:200})});
    assert.equal(r.status,502);
    assert.equal(r.ok,false);
  }
});
test("revoked / expired tickets and transient failures are not treated as valid auth",async()=>{
 for(const status of [400,401,403,503]){
   const r=await redeemCentralEchoTicket(code,{fetcher:async()=>new Response("{}",{status})});
   assert.equal(r.ok,false);
   assert.equal(r.status,[400,401,403].includes(status)?status:503);
 }
 const net=await redeemCentralEchoTicket(code,{fetcher:async()=>{throw Error("offline")}});
 assert.equal(net.status,503);
 const malformed=await redeemCentralEchoTicket(code,{fetcher:async()=>new Response("bad-json",{status:200})});
 assert.equal(malformed.status,502);
});

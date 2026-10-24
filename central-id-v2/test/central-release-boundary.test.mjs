import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const base=new URL("../release/",import.meta.url);
const cfg=JSON.parse(await readFile(new URL("central-targets.json",base),"utf8"));
const yaml=await readFile(new URL("../../.github/workflows/central-id-v2.yml",import.meta.url),"utf8");
const compatSmoke=await readFile(new URL("../../.github/workflows/central-id-v2-compat-preview-smoke.yml",import.meta.url),"utf8");

test("central production/preview targets are distinct from Battery sandbox",()=>{
 assert.equal(cfg.production.worker,"hglobal-central-id-v2");
 assert.equal(cfg.preview.worker,"hglobal-central-id-v2-preview");
 assert.notEqual(cfg.production.d1_id,cfg.preview.d1_id);
 assert.ok(!cfg.production.worker.startsWith("starry-battery-"));
 for(const banned of cfg.forbidden.d1_ids){
  assert.notEqual(cfg.production.d1_id,banned);
  assert.notEqual(cfg.preview.d1_id,banned);
 }
 assert.equal(cfg.production.github_environment,"production-central-id");
 assert.equal(cfg.production.concurrency_group,"production-central-id");
 assert.equal(cfg.production_ready_automated,false);
});

test("central CI never reads Battery-owned test files or uses catch-all path triggers",()=>{
 assert.doesNotMatch(yaml,/central-id-v2\/\*\*/);
 assert.doesNotMatch(yaml,/node --test central-id-v2\/test\/\*\.test\.mjs/);
 assert.doesNotMatch(yaml,/node --test .*battery/i);
 assert.match(yaml,/central-id-v2\/src\/\*\*/);
 assert.match(yaml,/central-id-v2\/test\/portal\*\.test\.mjs/);
 assert.match(yaml,/central-id-v2\/test\/central-release-boundary\.test\.mjs/);
});

test("migration source and legacy auth DB must not be treated as owned writable central D1",()=>{
 assert.notEqual(cfg.production.d1_id,cfg.production.legacy_d1_id);
 assert.equal(cfg.production.legacy_binding,"LEGACY_AUTH_DB");
 assert.equal(cfg.branch_policy.never_merge_mixed_pr_directly,true);
 assert.equal(cfg.branch_policy.legacy_mixed_pr,34);
});

test("Central PR CI rejects changes that mix in Battery code or legacy shared acceptance",()=>{
 assert.ok(yaml.includes("Ensure Central PR does not include Battery-owned files"));
 assert.ok(yaml.includes("central-id-v2/battery/"));
 assert.ok(yaml.includes("central-id-v2/acceptance/"));
 assert.ok(yaml.includes("git diff --name-only"));
 assert.ok(yaml.includes("fetch-depth: 0"));
});
test("Central preview smoke does not trigger for Battery-only changes",()=>{
 assert.ok(!compatSmoke.includes('"central-id-v2/**"'));
 assert.ok(compatSmoke.includes('"central-id-v2/src/**"'));
 assert.ok(compatSmoke.includes('"central-id-v2/migrations/**"'));
});


test("Central Cloudflare preflight performs GET-only and verifies exact Preview target",async()=>{
 const {verifyCentralTarget}=await import("../release/verify-central-cloudflare.mjs");
 const calls=[];
 const mocked=async(url,options)=>{
  calls.push({url,method:options.method});
  let result;
  if(url.endsWith("/settings"))result={bindings:[
   {type:"d1",name:"CENTRAL_DB",id:cfg.preview.d1_id},
   {type:"d1",name:"LEGACY_AUTH_DB",id:cfg.preview.d1_id}
  ]};
  else if(url.includes("/d1/database/"))result={uuid:cfg.preview.d1_id,name:"central-id-preview"};
  else if(url.endsWith("/deployments"))result={deployments:[{versions:[{version_id:"central-preview-version"}]}]};
  else throw Error("unexpected external request");
  return {ok:true,status:200,json:async()=>({success:true,result})};
 };
 const actual=await verifyCentralTarget({target:"preview",accountId:"f".repeat(32),token:"central-token-for-mocked-unit-test",request:mocked});
 assert.equal(actual.worker,"hglobal-central-id-v2-preview");
 assert.equal(actual.only_read_operations,true);
 assert.equal(actual.rollback_source_available,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(c=>c.method==="GET"));
 assert.ok(calls.every(c=>!c.url.includes("/starry-battery")));
});
test("Central preflight rejects Battery D1, foreign service and missing credentials",async()=>{
 const {verifyCentralTarget}=await import("../release/verify-central-cloudflare.mjs");
 const common={target:"production",accountId:"f".repeat(32),token:"central-mocked-token"};
 const respond=bindings=>async(url)=>({ok:true,status:200,json:async()=>({success:true,result:url.endsWith("/settings")?{bindings}:url.includes("/d1/database/")?{uuid:cfg.production.d1_id}: {deployments:[{versions:[{version_id:"safe"}]}]}})});
 const good=[
  {name:"CENTRAL_DB",type:"d1",id:cfg.production.d1_id},
  {name:"LEGACY_AUTH_DB",type:"d1",id:cfg.production.legacy_d1_id}
 ];
 await assert.rejects(verifyCentralTarget({...common,request:respond([{name:"CENTRAL_DB",type:"d1",id:cfg.forbidden.d1_ids[0]},good[1]])}),/wrong_central_d1_target/);
 await assert.rejects(verifyCentralTarget({...common,request:respond([...good,{type:"service",name:"NOT_ALLOWED",service:"starry-battery-engine-preview"}])}),/battery_binding_found/);
 await assert.rejects(verifyCentralTarget({...common,token:"",request:respond(good)}),/central_api_token_unavailable/);
});

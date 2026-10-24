import test from "node:test";
import assert from "node:assert/strict";
import {auditCentralCenterMigration} from "../release/verify-central-center-migration.mjs";
const db="ca08ee86-7b39-46fe-a578-611d1bee312c";
const config={
 production:{d1_id:db},
 preview:{d1_id:"bf911410-580f-4b5a-975c-28f77285fabb"},
 forbidden:{d1_ids:["4695a956-64c1-4635-b559-74e6298919d9"]}
};
const types={
 identity_users:"CREATE TABLE identity_users (user_id TEXT PRIMARY KEY,auth_version INTEGER,membership_status TEXT,suspended_at_ms INTEGER,deleted_at_ms INTEGER)",
 member_profiles:"CREATE TABLE member_profiles (user_id TEXT PRIMARY KEY,membership_system TEXT,center_code TEXT,record_version INTEGER)",
 auth_sessions:"CREATE TABLE auth_sessions (session_id_hash TEXT PRIMARY KEY,brand_scope TEXT,revoked_at_ms INTEGER,issued_auth_version INTEGER)",
 education_centers:"CREATE TABLE education_centers (center_code TEXT PRIMARY KEY,display_name TEXT,is_active INTEGER)"
};
const entries=Object.entries(types).map(([name,sql])=>({name,type:"table",sql}));
const make=(rows=entries,{centers=0,sessions=2}={})=>{
 const calls=[];
 const request=async(url,options)=>{
  assert.match(url,/\/d1\/database\//);
  assert.equal(options.method,"POST");
  assert.ok(!url.includes(config.forbidden.d1_ids[0]));
  const {sql,params}=JSON.parse(options.body);
  assert.ok(sql.startsWith("SELECT "));
  assert.doesNotMatch(sql,/DELETE|UPDATE|INSERT|DROP|ALTER|PRAGMA/);
  calls.push({sql,params});
  let results;
  if(sql.includes("sqlite_master"))results=rows;
  else if(sql.includes("education_centers"))results=[{count:centers}];
  else results=[{count:sessions}];
  return {ok:true,status:200,json:async()=>({success:true,result:[{success:true,results}]})};
 };
 return {request,calls};
};
const opts={target:"production",accountId:"f".repeat(32),token:"central-read-only-unit-test-token",nowMs:1700000000000,configOverride:config};

test("central migration preflight uses three read-only D1 queries and cannot authorize Production",async()=>{
 const {request,calls}=make();
 const result=await auditCentralCenterMigration({...opts,request});
 assert.equal(result.baselineCompatible,true);
 assert.equal(result.productionMigrationAuthorized,false);
 assert.equal(result.existingCenters,0);
 assert.equal(result.impactsActiveSessions,true);
 assert.equal(calls.length,3);
 assert.equal(calls[2].params[0],opts.nowMs);
 assert.ok(result.queries.every(x=>x.readOnly));
});

test("partial old center migration or existing centers fail-closed",async()=>{
 const {request}=make([...entries,{name:"admin_role_grants",type:"table",sql:"CREATE TABLE admin_role_grants(...)"}]);
 const result=await auditCentralCenterMigration({...opts,request});
 assert.equal(result.baselineCompatible,false);
 assert.match(result.errors.join(","),/already_or_partly_migrated/);
 const c=make(entries,{centers:30});
 const updated=await auditCentralCenterMigration({...opts,request:c.request});
 assert.equal(updated.baselineCompatible,false);
 assert.match(updated.errors.join(","),/center_seed_requires_reconciliation/);
});

test("stale baseline DDL triggers and missing table are blocked",async()=>{
 const altered=entries.filter(x=>x.name!=="auth_sessions");
 const broken=make(altered);
 const result=await auditCentralCenterMigration({...opts,request:broken.request});
 assert.equal(result.baselineCompatible,false);
 assert.match(result.errors.join(","),/missing_baseline_table:auth_sessions/);
 const withTrigger=make([...entries,{name:"trg_hglobal_affiliation_change",type:"trigger",sql:"CREATE TRIGGER ..."}]);
 const y=await auditCentralCenterMigration({...opts,request:withTrigger.request});
 assert.equal(y.baselineCompatible,false);
});

test("wrong target, token, or battery D1 must be rejected before any API call",async()=>{
 let n=0;
 const request=async()=>{n++;throw Error("must not read")};
 for(const altered of [
  {target:"battery"},{token:""},{accountId:"wrong"},
  {configOverride:{...config,production:{d1_id:config.forbidden.d1_ids[0]}}}
 ]){
  await assert.rejects(auditCentralCenterMigration({...opts,request,...altered}));
 }
 assert.equal(n,0);
});

test("D1 server failure is not treated as an empty schema",async()=>{
 const request=async()=>({ok:true,status:200,json:async()=>({success:true,result:[{success:false,results:[]}]})});
 await assert.rejects(auditCentralCenterMigration({...opts,request}),/d1_incomplete_read/);
});

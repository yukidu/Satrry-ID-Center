import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import app from "../src/index.mjs";
import {settingsPage,dashboardPage} from "../src/portal.mjs";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin="https://id.hglobal1985.com",token="A".repeat(43);
const fakeDb=()=>({
 prepare(sql){
  return {bind(...args){
   return {async first(){
    if(sql.includes("FROM auth_sessions s JOIN identity_users u"))return {
      user_id:"user-1",auth_version:1,issued_auth_version:1,
      membership_status:"pending",suspended_at_ms:null,deleted_at_ms:null,
      record_version:1,membership_system:"none",center_code:null,display_name:"測試"
    };
    if(sql.includes("FROM compat_legacy_principals"))return null;
    if(sql.startsWith("UPDATE member_profiles SET membership_system='hglobal'")){
      if(args[0]!=="EC-003"||args[3]!==1)return null;
      return {record_version:2};
    }
    throw Error("unexpected query: "+sql);
   }};
  }};
 }
});
const post=(json,originHeader=origin)=>new Request(origin+"/api/v1/portal/center",{
 method:"POST",headers:{"Origin":originHeader,"Content-Type":"application/json","Cookie":"central_id_portal="+token},
 body:JSON.stringify(json)
});
test("H-Global center endpoint accepts only official selected center with CAS",async()=>{
 const db=fakeDb();
 const response=await app.fetch(post({centerCode:"EC-003",version:1}),{CENTRAL_DB:db});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{saved:true,center_code:"EC-003",version:2,relogin:true});
});
test("H-Global center edits reject forged systems and invalid centers",async()=>{
 const db=fakeDb();
 for(const c of ["EC-001","EC-002","EC-033","NOT-CENTER"]){
  const r=await app.fetch(post({centerCode:c,version:1}),{CENTRAL_DB:db});
  assert.equal(r.status,400);
 }
 const fake=await app.fetch(post({centerCode:"EC-003",version:1,membershipSystem:"other"}),{CENTRAL_DB:db});
 assert.equal(fake.status,400);
 const old=await app.fetch(post({centerCode:"EC-003",version:2}),{CENTRAL_DB:db});
 assert.equal(old.status,409);
 const other=await app.fetch(post({centerCode:"EC-003",version:1},"https://attacker.invalid"),{CENTRAL_DB:db});
 assert.equal(other.status,403);
});
test("H-Global editor hides system and shows center choice",()=>{
 const user={id:"test",displayName:"測試",recordVersion:1,membershipSystem:"none",centerCode:null};
 const html=settingsPage(user);
 assert.match(html,/id="center-code"/);
 assert.match(html,/飛登/);
 assert.match(html,/其他/);
 assert.doesNotMatch(html,/data-profile-field="membership_system"/);
 assert.doesNotMatch(dashboardPage(user),/所屬系統/);
});

import test from "node:test";
import assert from "node:assert/strict";
import acceptance from "../acceptance/worker.mjs";
const makeReq=(path="/",method="GET")=>new Request("https://test.invalid"+path,{method});
test("acceptance page is explicit sandbox UI and includes 30 official centers",async()=>{
 const res=await acceptance.fetch(makeReq(),{});
 assert.equal(res.status,200);
 const html=await res.text();
 assert.match(html,/開發驗收/);
 assert.match(html,/非正式站/);
 assert.match(html,/EC-003/);
 assert.match(html,/EC-032/);
 assert.doesNotMatch(html,/EC-001/);
 assert.doesNotMatch(html,/EC-002/);
 assert.match(html,/不會變更任何真實會員資料/);
 assert.match(html,/模擬/);
 assert.match(html,/id="ai-run"/);
 assert.match(html,/id="ai-outcome"/);
 assert.doesNotMatch(html,/id="reserve"/);
 assert.doesNotMatch(html,/id="commit"/);
 assert.doesNotMatch(html,/id="release"/);
});
test("acceptance refuses all writes",async()=>{
 const r=await acceptance.fetch(makeReq("/api/acceptance/status","POST"),{});
 assert.equal(r.status,405);
 assert.equal((await r.json()).error,"read_only_acceptance_environment");
});
test("read-only sandbox status reads only counts",async()=>{
 let readCalls=[];
 const count=n=>({prepare(sql){readCalls.push(sql);return{first:async()=>({n})}}});
 const r=await acceptance.fetch(makeReq("/api/acceptance/status"),{CENTRAL_SANDBOX:count(30),BATTERY_SANDBOX:count(7)});
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.ready,true);
 assert.equal(body.center_count,30);
 assert.equal(body.battery_table_count,7);
 assert.equal(body.environment,"sandbox_only");
 assert.equal(readCalls.length,3);
 assert.ok(readCalls.every(sql=>/^SELECT COUNT\(/.test(sql)));
});
test("acceptance never exposes sandbox without private bindings",async()=>{
 const r=await acceptance.fetch(makeReq("/api/acceptance/status"),{});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"sandbox_bindings_missing");
});
test("D1 E2E results endpoint remains read-only and pending until actual real report",async()=>{
 const calls=[];const db={prepare(sql){calls.push(sql);return{first:async()=>null}}};
 const r=await acceptance.fetch(makeReq("/api/acceptance/e2e"),{BATTERY_SANDBOX:db});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.status,"pending");
 assert.equal(data.total,0);
 assert.equal(calls.length,1);
 assert.match(calls[0],/sqlite_master/);
});
test("D1 E2E report reflects real stored counts without exposing report contents",async()=>{
 const db={prepare(sql){return{first:async()=>sql.includes("sqlite_master")?{name:"e2e_test_results"}:{run_id:"e2e_demo",passed:8,total:8}}}};
 const r=await acceptance.fetch(makeReq("/api/acceptance/e2e"),{BATTERY_SANDBOX:db});
 assert.equal(r.status,200);
 const data=await r.json();
 assert.deepEqual(data,{status:"pass",passed:8,total:8});
});
test("E2E status cannot be forged with a POST",async()=>{
 const r=await acceptance.fetch(makeReq("/api/acceptance/e2e","POST"),{});
 assert.equal(r.status,405);
});

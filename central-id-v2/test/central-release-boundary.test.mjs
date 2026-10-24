import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const base=new URL("../release/",import.meta.url);
const cfg=JSON.parse(await readFile(new URL("central-targets.json",base),"utf8"));
const yaml=await readFile(new URL("../../.github/workflows/central-id-v2.yml",import.meta.url),"utf8");

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

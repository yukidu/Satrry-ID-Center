// Central-only integration harness: run real SQLite constraints and triggers in CI.
// Not a Battery test and never connects to Cloudflare Production D1.
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

test("center migration revokes scoped roles and sessions atomically in SQLite",()=>{
 const script=fileURLToPath(new URL("./center_migration_schema_test.py",import.meta.url));
 const r=spawnSync("python3",[script],{encoding:"utf8",timeout:15000,env:{PATH:process.env.PATH||"/usr/bin:/bin"}});
 assert.equal(r.error,undefined,String(r.error||""));
 assert.equal(r.status,0,r.stderr||r.stdout||"SQLite test failed");
 assert.match(r.stdout,/atomic session\/role revocation checks passed/);
});

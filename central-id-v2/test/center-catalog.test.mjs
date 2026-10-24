import test from "node:test";
import assert from "node:assert/strict";
import {HGLOBAL_CENTERS,isValidHglobalCenter} from "../src/centers.mjs";

test("official center catalog has only EC-003..EC-032 in correct order",()=>{
 assert.equal(HGLOBAL_CENTERS.length,30);
 assert.equal(new Set(HGLOBAL_CENTERS.map(x=>x.code)).size,30);
 assert.equal(HGLOBAL_CENTERS[0].code,"EC-003");
 assert.equal(HGLOBAL_CENTERS[0].name,"飛登");
 assert.equal(HGLOBAL_CENTERS.at(-1).code,"EC-032");
 assert.equal(HGLOBAL_CENTERS.at(-1).name,"其他");
 for(let i=3;i<=32;i++)assert.equal(HGLOBAL_CENTERS[i-3].code,"EC-"+String(i).padStart(3,"0"));
});

test("rejects historical placeholders and forged client system values",()=>{
 for(const code of ["EC-001","EC-002","EC-033","none","other",null,undefined,{},3,"EC-003 OR 1=1"])assert.equal(isValidHglobalCenter(code),false);
 for(const c of HGLOBAL_CENTERS)assert.equal(isValidHglobalCenter(c.code),true);
});

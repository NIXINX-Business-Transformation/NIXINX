import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../lib/organization-acronym.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {normalizeOrganizationAcronym,validNewOrganizationAcronym,validOrganizationAcronymDraft}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
test("strict new organization acronym",()=>{
 for(const id of ["org","a0","htl2026","a".repeat(35)])assert.equal(validNewOrganizationAcronym(id),true);
 for(const id of ["","a","1org","ORG","org-1","org_1","org.1","org 1","org\n","org\t","café","cafe\u0301","你好","عرب","оrg","org\u200b","ｏｒｇ","a".repeat(36),null,123])assert.equal(validNewOrganizationAcronym(id),false,String(id));
 assert.equal(validOrganizationAcronymDraft(""),true);
 assert.equal(validOrganizationAcronymDraft("a"),true);
 assert.equal(validOrganizationAcronymDraft("a-"),false);
 assert.equal(validOrganizationAcronymDraft("a".repeat(36)),false);
});

test("ASCII case variants converge without accepting Unicode or invalid characters",()=>{
 for(const id of ["Org","org","oRg","orG","ORG"])assert.equal(normalizeOrganizationAcronym(id),"org");
 for(const id of ["ÓRG","Оrg","Korg","Org-1","Org 1","ORG\n"])assert.equal(validNewOrganizationAcronym(normalizeOrganizationAcronym(id)),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile=(p)=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const url=(s)=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const geo=url(compile("../lib/commercial-geography.ts"));
const {validateCommercialProfile,normalizeCanadianPostal,legalBillingName}=await import(url(compile("../lib/commercial-profile-validation.ts").replace('"./commercial-geography"',JSON.stringify(geo))));
const {availableCommercialItems,resumableCommercialOrder,openCheckoutUrl}=await import(url(compile("../lib/commercial-app-eligibility.ts")));
const valid={name:"José",company:"Échantillon Inc.",legalName:"123456 Ontario Inc.",country:"CA",province:"ON",address1:"100 Main St",city:"Windsor",postalCode:"n9a1a1",phone:"+1 (519) 555-0100",contactEmail:"test@example.com"};
test("valid Canadian profile, local postal normalization and optional fields",()=>{assert.deepEqual(validateCommercialProfile(valid,true),{});assert.equal(normalizeCanadianPostal("n9a1a1"),"N9A 1A1");assert.deepEqual(validateCommercialProfile({...valid,city:"Trois-Rivières",phone:""},true),{});});
test("reject invalid fields separately and require billing address",()=>{const e=validateCommercialProfile({...valid,phone:"not a phone",city:"3513214354",postalCode:"garbage",address1:"",contactEmail:"x",taxType:"GST"},true);for(const k of ["phone","city","postalCode","address1","contactEmail","taxId"])assert.ok(e[k],k);assert.equal(normalizeCanadianPostal("D9D 1D1"),null);assert.ok(validateCommercialProfile({...valid,city:"Windsor\u200b"},true).city);});
test("paid and pending apps never reappear in available choices",()=>{const apps=[{id:"corporate"},{id:"initiatives"},{id:"supply"}];assert.deepEqual(availableCommercialItems(apps,[{status:"paid_test",applicationIds:["corporate"]},{status:"pending_test",applicationIds:["initiatives"]}]),[{id:"supply"}]);assert.deepEqual(availableCommercialItems(apps,[{status:"paid_test",applicationIds:["corporate","initiatives","supply"]}]),[]);});

test("resume only the owner's existing open Sandbox session, never a paid or mismatched order",()=>{
 const orderId="a".repeat(64),uid="owner",version="v1";
 const order={uid,status:"pending_test",billingMode:"subscription",currency:"cad",terms:{version,acceptedBy:uid},stripeSessionId:"cs_test_fixture",stripeCustomerId:"cus_fixture",subtotal:50};
 const session={object:"checkout.session",livemode:false,id:order.stripeSessionId,status:"open",payment_status:"unpaid",mode:"subscription",currency:"cad",amount_subtotal:50,automatic_tax:{enabled:true},customer:order.stripeCustomerId,client_reference_id:orderId,metadata:{orderId},url:"https://checkout.stripe.com/c/pay/cs_test_fixture"};
 assert.equal(resumableCommercialOrder(order,uid,version),true);
 for(const changes of [{uid:"other"},{status:"paid_test"},{stripeSessionId:null},{terms:{version:"old",acceptedBy:uid}},{terms:{version,acceptedBy:"other"}},{stripeSessionId:"cs_live_fixture"}])assert.equal(resumableCommercialOrder({...order,...changes},uid,version),false);
 assert.equal(openCheckoutUrl(session,order,orderId),session.url);
 for(const changes of [{status:"expired"},{status:"complete"},{payment_status:"paid"},{livemode:true},{customer:"cus_other"},{amount_subtotal:51},{client_reference_id:"other"},{metadata:{}},{url:"https://checkout.stripe.com.evil.example/c/pay"},{automatic_tax:{enabled:false}}])assert.equal(openCheckoutUrl({...session,...changes},order,orderId),null);
});

test("both legal and operating names required; may be identical; personal name must contain a letter",()=>{
 assert.equal(validateCommercialProfile({...valid,legalName:""},true).legalName,"required");
 assert.equal(validateCommercialProfile({...valid,legalName:undefined},true).legalName,"required");
 assert.equal(validateCommercialProfile({...valid,company:""},true).company,"required");
 assert.equal(validateCommercialProfile({...valid,name:"984983725098"},true).name,"format");
 assert.equal(validateCommercialProfile({...valid,name:"---"},true).name,"format");
 assert.deepEqual(validateCommercialProfile({...valid,legalName:valid.company},true),{});
 assert.deepEqual(validateCommercialProfile({...valid,name:"Élodie 李",legalName:"123456 Ontario Inc.",company:"Échantillon & Fils"},true),{});
 assert.equal(legalBillingName(" 123456 Ontario Inc. "),"123456 Ontario Inc.");
 assert.equal(legalBillingName(undefined),null);
 assert.equal(legalBillingName(""),null);
 assert.equal(legalBillingName("Test\u200b Inc."),null);
});

const {sameDeclaredTaxAddress,confirmedDeclaredTaxAddress}=await import(url(compile("../lib/commercial-billing-address.ts")));
test("declared billing confirmation binds only to the exact current server snapshot",()=>{
 const saved={country:"CA",province:"ON",postal:"N9A1A1",city:"Windsor",line1:"100 Main St"};
 assert.equal(confirmedDeclaredTaxAddress(true,{...saved},saved),true);
 for(const v of [false,undefined,"true",1])assert.equal(confirmedDeclaredTaxAddress(v,saved,saved),false);
 for(const [key,value] of Object.entries({country:"US",province:"QC",postal:"N9A1A2",city:"London",line1:"101 Main St"}))assert.equal(sameDeclaredTaxAddress({...saved,[key]:value},saved),false);
 assert.equal(sameDeclaredTaxAddress({...saved,extra:"foreign"},saved),false);
 assert.equal(sameDeclaredTaxAddress(null,saved),false);
 assert.equal(sameDeclaredTaxAddress({...saved,line1:""},saved),false);
});

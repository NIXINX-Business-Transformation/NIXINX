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

const {sameDeclaredTaxAddress,confirmedDeclaredTaxAddress,fiscalProfileAddress,changedFiscalProfileFields,confirmedFiscalProfileChange,profileRevisionMatches,stripeFiscalAddressMatches,paidFiscalReviewRequired,sameHeldPayment}=await import(url(compile("../lib/commercial-billing-address.ts").replace('"./commercial-geography"',JSON.stringify(geo))));
test("declared billing confirmation binds only to the exact current server snapshot",()=>{
 const saved={country:"CA",province:"ON",postal:"N9A1A1",city:"Windsor",line1:"100 Main St"};
 assert.equal(confirmedDeclaredTaxAddress(true,{...saved},saved),true);
 for(const v of [false,undefined,"true",1])assert.equal(confirmedDeclaredTaxAddress(v,saved,saved),false);
 for(const [key,value] of Object.entries({country:"US",province:"QC",postal:"N9A1A2",city:"London",line1:"101 Main St"}))assert.equal(sameDeclaredTaxAddress({...saved,[key]:value},saved),false);
 assert.equal(sameDeclaredTaxAddress({...saved,extra:"foreign"},saved),false);
 assert.equal(sameDeclaredTaxAddress(null,saved),false);
 assert.equal(sameDeclaredTaxAddress({...saved,line1:""},saved),false);
});

test("profile fiscal edits require exact confirmed new address including unit; cosmetic formatting does not change identity",()=>{
 const before={...valid,address2:"Unit 2",country:"Canada",province:"Ontario"};
 const after={...before,address1:"101 Main St",address2:"Unit 3"};
 assert.deepEqual(changedFiscalProfileFields(before,{...before,country:"CA",province:"ON",postalCode:"N9A 1A1"}),[]);
 assert.deepEqual(changedFiscalProfileFields(before,after),["address1","address2"]);
 assert.equal(confirmedFiscalProfileChange(true,fiscalProfileAddress(after),after),true);
 assert.equal(confirmedFiscalProfileChange(false,fiscalProfileAddress(after),after),false);
 assert.equal(confirmedFiscalProfileChange(true,fiscalProfileAddress(before),after),false);
 assert.equal(confirmedFiscalProfileChange(true,{...fiscalProfileAddress(after),address2:""},after),false);
});
test("profile revisions reject missing, stale and different-account tokens",()=>{
 const token="a".repeat(64),foreign="b".repeat(64);
 assert.equal(profileRevisionMatches(token,token),true);
 for(const value of [undefined,null,"",foreign,true])assert.equal(profileRevisionMatches(value,token),false);
});

test("paid address mismatch is held, including unknown evidence, other province, or changed unit",()=>{
 const policy={country:"CA",province:"ON",postal:"N9A1A1",city:"Windsor",line1:"100 Main St"};
 const address={country:"CA",state:"Ontario",postal_code:"n9a 1a1",city:"WINDSOR",line1:"100 MAIN ST",line2:"Unit 2"};
 assert.equal(stripeFiscalAddressMatches(policy,address,"Unit 2"),true);
 assert.equal(paidFiscalReviewRequired(policy,"Unit 2",address,address),false);
 for(const bad of [null,{...address,line1:"101 Main St"},{...address,state:"QC"},{...address,country:"US"},{...address,line2:"Unit 3"},{...address,line1:"100 Main Street"}]){
  assert.equal(paidFiscalReviewRequired(policy,"Unit 2",bad,address),true);
  assert.equal(paidFiscalReviewRequired(policy,"Unit 2",address,bad),true);
 }
 assert.deepEqual(availableCommercialItems([{id:"corporate"},{id:"initiatives"}],[{status:"paid_review_test",applicationIds:["corporate"]}]),[{id:"initiatives"}]);
});
test("held payment replay matches immutable payment and cannot resume",()=>{
 const payment={sessionId:"cs_test_fixture",paymentIntentId:"pi_fixture",subscriptionId:"sub_fixture",amount:57};
 const order={status:"paid_review_test",stripeSessionId:payment.sessionId,stripePaymentIntentId:payment.paymentIntentId,stripeSubscriptionId:payment.subscriptionId,amount:57,currency:"cad"};
 assert.equal(sameHeldPayment(order,payment),true);
 for(const changes of [{amount:58},{paymentIntentId:"pi_other"},{subscriptionId:"sub_other"},{sessionId:"cs_test_other"}])assert.equal(sameHeldPayment(order,{...payment,...changes}),false);
 assert.equal(resumableCommercialOrder(order,"owner","v1"),false);
});

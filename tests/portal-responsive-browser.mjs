import assert from "node:assert/strict";
import {chromium} from "playwright";
const base="http://127.0.0.1:3100";
const profile={name:"Fixture Customer",company:"A very long commercial organization name for responsive acceptance",acronym:"responsivefixture",legalName:"Fixture Organization Incorporated",contactEmail:"fixture@example.invalid",phone:"5195550100",address1:"100 Example Avenue",address2:"Unit 2",city:"Windsor",province:"ON",postalCode:"N9A 1A1",country:"CA",taxType:"",taxId:""};
const date=Date.UTC(2026,10,26);
const account={email:"fixture@example.invalid",profile,communication:{email:false,sms:false},taxPolicy:{country:"CA",province:"ON",postal:"N9A1A1",city:"Windsor",line1:profile.address1},catalogAvailable:true,items:[{id:"corporate",name:"Corporate",amount:50,currency:"cad",interval:"month"},{id:"initiatives",name:"Initiatives",amount:50,currency:"cad",interval:"month"},{id:"supply",name:"Supply",amount:50,currency:"cad",interval:"month"}],orders:[{id:"fixture-paid",billingMode:"subscription",subscriptionId:"sub_fixture_long_reference_for_wrapping",status:"paid_test",applicationIds:["corporate"],amount:57,currency:"cad",date},{id:"fixture-pending",billingMode:"subscription",subscriptionId:null,status:"pending_test",applicationIds:["supply"],amount:57,currency:"cad",date}],tickets:[{id:"fixture-ticket",kind:"claim",subject:"Long customer request subject to verify wrapping without horizontal scrolling",status:"OPEN",date}]};
const names={en:["Overview","Company profile","Applications","Billing & payments","Subscriptions","Security","Support & claims"],es:["Resumen","Perfil de empresa","Aplicaciones","Facturación y pagos","Suscripciones","Seguridad","Soporte y reclamaciones"],fr:["Vue d’ensemble","Profil entreprise","Applications","Facturation et paiements","Abonnements","Sécurité","Assistance et réclamations"]};
const secure={en:"SECURE BILLING · SANDBOX",es:"FACTURACIÓN SEGURA · SANDBOX",fr:"FACTURATION SÉCURISÉE · SANDBOX"};
const sizes=[[320,568],[375,667],[390,844],[430,932],[667,375],[844,390],[768,1024],[820,1180],[1024,768],[1180,820],[1280,800],[1440,900],[1920,1080]];
const themes=[["light","light"],["dark","light"],["system","light"],["system","dark"]];
const browser=await chromium.launch({headless:true});
let checks=0;const failures=[];
try{
for(const locale of ["en","es","fr"]){
 const ctx=await browser.newContext({serviceWorkers:"block",viewport:{width:390,height:844},locale:locale+"-CA"});
 let signedIn=true;
 await ctx.route("**/api/customer-portal/**",async route=>{
  const action=new URL(route.request().url()).pathname.split("/").at(-1);
  const fixtures={account,notifications:{notifications:[{id:"fixture-notice",type:"invoice.paid",read:false,date}]},invoices:{invoices:[{id:"in_fixture",number:"INV-FIXTURE-0001",status:"paid",amountDue:57,amountPaid:57,currency:"cad",date}]},subscriptions:{subscriptions:[{id:"sub_fixture_long_reference_for_wrapping",status:"active",periodEnd:date+86400000,cancelAtPeriodEnd:false}]}};
  if(action==="account"&&!signedIn)return route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:"LOGIN_REQUIRED"})});
  if(!(action in fixtures))return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"FIXTURE_BLOCKED_MUTATION"})});
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixtures[action])});
 });
 // No requests reach real external providers.
 await ctx.route("**/*",route=>new URL(route.request().url()).origin===base?route.fallback():route.abort());
 const page=await ctx.newPage();
 await page.goto(base+"/"+locale+"/account");await page.locator(".nx-sidebar").waitFor();
 assert.equal(await page.locator("html").getAttribute("lang"),locale);
 assert.deepEqual(await page.locator(".nx-sidebar nav button").allTextContents().then(x=>x.map(v=>v.slice(1))),names[locale]);
 for(const [width,height] of sizes){
  await page.setViewportSize({width,height});
  for(const [theme,scheme] of themes){
   await page.emulateMedia({colorScheme:scheme});
   await page.locator(".nx-tools label select").selectOption(theme);
   for(let i=0;i<7;i++){
    await page.locator(".nx-sidebar nav button").nth(i).click();
    await page.locator(".nx-top h1").waitFor();
    assert.equal(await page.locator(".nx-top h1").textContent(),names[locale][i]);
    if(i===2){await page.locator(".nx-app-card input").first().check();}
    if(i===3)assert.equal(await page.locator(".nx-stripe-brand span").textContent(),secure[locale]);
    if(i===4){await page.locator(".nx-panel button").first().click();await page.getByText("sub_fixture_long_reference_for_wrapping",{exact:true}).waitFor();}
    const result=await page.evaluate(()=>{
     const root=document.querySelector(".nx-dash"), vw=document.documentElement.clientWidth;
     const visible=e=>e.getClientRects().length>0;
     const overflow=[...root.querySelectorAll("main,aside,.nx-panel,.nx-stripe-panel,.nx-fields,.nx-record,.nx-app-card,.nx-tools,.nx-login-card,.nx-sidebar nav button")].filter(visible).filter(e=>{const b=e.getBoundingClientRect();return b.right>vw+1||b.left< -1||e.scrollWidth>e.clientWidth+2;}).map(e=>e.className||e.tagName);
     const small=[...root.querySelectorAll("button,.nx-tools select,input:not([type=checkbox]),textarea")].filter(visible).filter(e=>e.getBoundingClientRect().height<43.5).map(e=>e.textContent?.slice(0,35)||e.tagName);
     return {pageOverflow:document.documentElement.scrollWidth>vw+1,overflow,small,scheme:getComputedStyle(root).colorScheme};
    });
    const expected=theme==="system"?scheme:theme;
    if(result.pageOverflow||result.overflow.length||result.small.length||result.scheme!==expected)failures.push({locale,width,height,theme,scheme,section:i,...result});
    checks++;
   }
  }
 }
 // Language selector preserves the selected section, and persisted theme works on reload.
 await page.locator(".nx-sidebar nav button").nth(3).click();
 const target=locale==="en"?"fr":"en";
 await page.locator('.nx-tools>select').selectOption(target);
 await page.waitForURL("**/"+target+"/account?section=billing");
 await page.locator(".nx-top h1").filter({hasText:names[target][3]}).waitFor();
 assert.equal(await page.locator(".nx-dash").getAttribute("data-theme"),"system");
 // Check logged-out form using the same actual route, with no identity provider.
 signedIn=false;
 for(const [width,height] of sizes){await page.setViewportSize({width,height});await page.goto(base+"/"+locale+"/account");await page.locator(".nx-login-card").waitFor();assert.equal(await page.locator("html").getAttribute("lang"),locale);const ok=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1&&document.querySelector(".nx-login-card").getBoundingClientRect().width<=460.5&&[...document.querySelectorAll(".nx-login-card input,.nx-login-card button")].every(e=>e.getBoundingClientRect().height>=43.5));if(!ok)failures.push({locale,width,height,section:"login"});checks++;}
 await ctx.close();
}
}finally{await browser.close();}
console.log("PORTAL_UI_FIXTURE_CHECKS="+checks+" FAILURES="+failures.length);
if(failures.length){console.error(JSON.stringify(failures.slice(0,30),null,2));process.exitCode=1;}

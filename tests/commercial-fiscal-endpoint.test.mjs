import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const requireNative=createRequire(import.meta.url);
const origin='https://portal.fixture.invalid';
const policy={country:'CA',province:'ON',postal:'N9A1A1',city:'Windsor',line1:'100 Main St'};
const address={country:'CA',state:'ON',postal_code:'N9A 1A1',city:'Windsor',line1:'100 Main St',line2:'Unit 2'};
const profile={name:'Test Contact',company:'Fixture Inc.',legalName:'Fixture Inc.',acronym:'fixture-a',country:'CA',province:'ON',postalCode:'N9A 1A1',city:'Windsor',address1:'100 Main St',address2:'Unit 2',contactEmail:'a@example.test'};
const orderId='a'.repeat(64);
const digest=(uid,rev)=>createHash('sha256').update(JSON.stringify([uid,rev+':0'])).digest('hex');

function harness(){
 const rows=new Map(),writes=[],requests=[];let serial=10;
 const put=(key,value,rev=1)=>rows.set(key,{value:structuredClone(value),rev});
 const get=(key)=>rows.get(key)?.value;
 const snapshot=(key)=>{
  const row=rows.get(key),v=row?.value;
  return {exists:!!row,updateTime:row?{seconds:row.rev,nanoseconds:0}:undefined,data:()=>v&&structuredClone(v),get:k=>k.split('.').reduce((a,b)=>a?.[b],v)};
 };
 const ref=(key)=>({key,get:async()=>snapshot(key),collection:name=>collection(key+'/'+name)});
 const collection=(key)=>({doc:(id='history-'+(++serial))=>ref(key+'/'+id),where:(field,op,value)=>({limit:max=>({get:async()=>{
  assert.equal(op,'==');const docs=[...rows.keys()].filter(k=>k.startsWith(key+'/')&&!k.slice(key.length+1).includes('/')&&get(k)?.[field]===value).slice(0,max).map(k=>({...snapshot(k),id:k.slice(key.length+1),ref:ref(k)}));return {docs,empty:!docs.length,size:docs.length};
 }})})});
 const db={collection,runTransaction:async fn=>{
  const changes=[];
  const tx={get:async r=>snapshot(r.key),create:(r,v)=>changes.push(['create',r.key,v]),update:(r,v)=>changes.push(['update',r.key,v]),set:(r,v,o)=>changes.push(['set',r.key,v,o])};
  const result=await fn(tx);
  for(const [op,key,v,o] of changes){
   if(op==='create')assert.equal(rows.has(key),false);
   if(op==='update')assert.equal(rows.has(key),true);
   put(key,op==='update'||o?.merge?{...get(key),...v}:v,(rows.get(key)?.rev??0)+1);
   writes.push({op,key});
  }
  return result;
 }};
 put('commercial_profiles/a',profile);put('commercial_profiles/b',{...profile,acronym:'fixture-b',address1:'200 Main St',contactEmail:'b@example.test'});
 put('commercial_acronyms/fixture-a',{uid:'a'});put('commercial_acronyms/fixture-b',{uid:'b'});
 put('commercial_billing_customers/a',{uid:'a',environment:'sandbox',stripeCustomerId:'cus_fixture'});
 const order={terms:{version:'sandbox-2026-11-26-v1',acceptedBy:'a'},status:'pending_test',uid:'a',stripeSessionId:'cs_test_fixture',billingMode:'subscription',stripeCustomerId:'cus_fixture',subtotal:50,currency:'cad',taxPolicy:policy,declaredFiscalLine2:'Unit 2',profile:{acronym:'fixture-a'},applicationIds:['corporate']};
 put('commercial_orders/'+orderId,order);
 const stripeFixtures={
  'customers/cus_fixture':{id:'cus_fixture',livemode:false,address,metadata:{nixinx_owner:'nixinx-commercial-sandbox-v1',nixinx_uid_hash:createHash('sha256').update('a').digest('hex')}},
  'checkout/sessions/cs_test_fixture':{id:'cs_test_fixture',livemode:false,payment_status:'paid',status:'complete',mode:'subscription',client_reference_id:orderId,subscription:'sub_fixture',customer:'cus_fixture',amount_total:57,amount_subtotal:50,currency:'cad',metadata:{orderId},automatic_tax:{enabled:true,status:'complete'},total_details:{amount_tax:7},customer_details:{address}},
  'subscriptions/sub_fixture':{id:'sub_fixture',livemode:false,customer:'cus_fixture',metadata:{orderId}},
  'invoices?subscription=sub_fixture&limit=100':{object:'list',has_more:false,data:[{id:'in_fixture',livemode:false,billing_reason:'subscription_create',status:'paid',customer:'cus_fixture',subscription:'sub_fixture',amount_paid:57,currency:'cad',payment_intent:'pi_fixture',customer_address:address}]}
 };
 const env={FIREBASE_PROJECT_ID:'nixinx-bt',FIREBASE_CLIENT_EMAIL:'fixture@example.test',FIREBASE_PRIVATE_KEY:'fixture',CUSTOMER_PORTAL_ORIGIN:origin,CUSTOMER_FIREBASE_WEB_API_KEY:'fixture-public-key',STRIPE_COMMERCIAL_SECRET_KEY:'rk_test_fixture',STRIPE_SANDBOX_WEBHOOK_SECRET:'whsec_fixture'};
 const auth={verifySessionCookie:async token=>{if(!['a','b'].includes(token))throw Error('bad session');return {uid:token,email:token+'@example.test',email_verified:true};}};
 const fakeFetch=async (url,opts)=>{
  const p='https://api.stripe.com/v1/';
  assert.ok(url.startsWith(p),'unexpected network request');
  assert.equal(opts.method,'GET','no Stripe writes permitted');
  const key=url.slice(p.length);requests.push(key);
  assert.ok(stripeFixtures[key],'unexpected Stripe path '+key);
  return {ok:true,json:async()=>structuredClone(stripeFixtures[key])};
 };
 const mocks={
  'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts.status,headers:opts.headers})}},
  'firebase-admin/app':{cert:()=>({}),getApps:()=>[],initializeApp:()=>({})},
  'firebase-admin/auth':{getAuth:()=>auth},
  'firebase-admin/firestore':{getFirestore:()=>db,FieldValue:{serverTimestamp:()=>0}},
  '@/lib/commercial-stripe-catalog':{commercialCatalog:async()=>[],reconcileStripe:async()=>{throw Error('not allowed')}},
  '@/lib/customer-billing':{},
  'server-only':{}
 };
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const source=fs.readFileSync(file,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const localRequire=(id)=>{
   if(Object.hasOwn(mocks,id))return mocks[id];
   if(id.startsWith('@/'))return load(path.join(root,id.slice(2)+'.ts'));
   if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
   return requireNative(id);
  };
  new Function('require','module','exports','process','fetch',js)(localRequire,mod,mod.exports,{env},fakeFetch);
  return mod.exports;
 }
 const api=load(path.join(root,'app/api/customer-portal/[action]/route.ts'));
 const ctx=action=>({params:Promise.resolve({action})});
 const post=(action,body,token='a')=>api.POST({headers:new Headers({origin}),nextUrl:{origin},cookies:{get:()=>token?{value:token}:undefined},text:async()=>JSON.stringify(body)},ctx(action));
 const webhook=(type='checkout.session.completed',signatureValid=true,eventOverrides={})=>{
  const raw=JSON.stringify({id:'evt_fixture',type,livemode:false,created:100,data:{object:{id:'cs_test_fixture'}},...eventOverrides});
  const t=Math.floor(Date.now()/1000),hash=createHmac('sha256',env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
  return api.POST({headers:new Headers({'stripe-signature':'t='+t+',v1='+(signatureValid?hash:'0'.repeat(64))}),text:async()=>raw},ctx('stripe-webhook'));
 };
 return {api,ctx,env,post,webhook,put,get,writes,requests,stripeFixtures};
}

test('auth-config fails closed when Preview configuration is absent or wrong',async()=>{
 const h=harness();
 const req={};
 let r=await h.api.GET(req,h.ctx('auth-config'));assert.equal(r.status,200);assert.equal(r.body.projectId,'nixinx-bt');
 delete h.env.CUSTOMER_FIREBASE_WEB_API_KEY;
 r=await h.api.GET(req,h.ctx('auth-config'));assert.equal(r.status,503);assert.equal(r.body.error,'NOT_CONFIGURED');
 h.env.CUSTOMER_FIREBASE_WEB_API_KEY='fixture';h.env.FIREBASE_PROJECT_ID='other';
 r=await h.api.GET(req,h.ctx('auth-config'));assert.equal(r.status,503);assert.equal(h.writes.length,0);assert.equal(h.requests.length,0);
});
test('profile endpoint: cross-account and stale revisions are rejected without writes',async()=>{
 const h=harness();
 for(const [token,revision] of [['a',digest('b',1)],['b',digest('a',1)],['a',digest('a',0)]]){
  const result=await h.post('profile',{...profile,profileRevision:revision},token);
  assert.equal(result.status,409);assert.equal(result.body.error,'PROFILE_REVISION_REQUIRED');assert.equal(h.writes.length,0);
 }
 const unauth=await h.post('profile',profile,'');assert.equal(unauth.status,401);assert.equal(h.writes.length,0);
});
test('profile endpoint: explicit fiscal confirmation and atomic audit; other account untouched',async()=>{
 const h=harness(),before=structuredClone(h.get('commercial_profiles/b'));
 const proposed={...profile,address1:'101 Main St',profileRevision:digest('a',1)};
 const rejected=await h.post('profile',proposed);assert.equal(rejected.status,409);assert.equal(rejected.body.error,'FISCAL_ADDRESS_CHANGE_CONFIRMATION_REQUIRED');assert.equal(h.writes.length,0);
 const accepted=await h.post('profile',{...proposed,addressChangeConfirmed:true,confirmedFiscalAddress:{address1:'101 Main St',address2:'Unit 2',city:'Windsor',province:'ON',postalCode:'N9A1A1',country:'CA'}});
 assert.equal(accepted.status,200);assert.equal(h.get('commercial_profiles/a').address1,'101 Main St');assert.deepEqual(h.get('commercial_profiles/b'),before);
 assert.equal(h.writes.length,2);assert.ok(h.writes[1].key.startsWith('commercial_profiles/a/fiscal_address_history/'));assert.deepEqual(h.get(h.writes[1].key).fields,['address1']);
 const stale=await h.post('profile',proposed);assert.equal(stale.status,409);assert.equal(h.writes.length,2);assert.equal(h.requests.length,0);
});
test('signed webhook: mismatch holds payment without outbox, replay never releases it',async()=>{
 const h=harness();
 h.stripeFixtures['invoices?subscription=sub_fixture&limit=100'].data[0].customer_address={...address,line1:'999 Main St'};
 const invalid=await h.webhook(undefined,false);assert.equal(invalid.status,400);assert.equal(h.writes.length,0);
 const result=await h.webhook();assert.equal(result.status,200);assert.equal(h.get('commercial_orders/'+orderId).status,'paid_review_test');assert.equal(h.get('commercial_orders/'+orderId).stripePaymentIntentId,'pi_fixture');assert.equal(h.get('commercial_provisioning_outbox/'+orderId),undefined);assert.equal(h.writes.length,1);
 h.stripeFixtures['invoices?subscription=sub_fixture&limit=100'].data[0].customer_address=address;
 const replay=await h.webhook();assert.equal(replay.status,200);assert.equal(h.writes.length,1);assert.equal(h.get('commercial_provisioning_outbox/'+orderId),undefined);
});
test('signed webhook: matched payment preserves outbox v1 and exact replay is write-free',async()=>{
 const h=harness();
 const result=await h.webhook();assert.equal(result.status,200);assert.equal(h.get('commercial_orders/'+orderId).status,'paid_test');
 const out=h.get('commercial_provisioning_outbox/'+orderId);assert.equal(out.schemaVersion,1);assert.equal(out.status,'PENDING_PROVISIONER');assert.equal(out.requestId,orderId);assert.deepEqual(out.applicationIds,['corporate']);assert.equal(out.payment.amount,57);assert.equal(h.writes.length,2);
 const replay=await h.webhook();assert.equal(replay.status,200);assert.equal(h.writes.length,2);
});

function openSession(h){
 const key='checkout/sessions/cs_test_fixture';
 h.stripeFixtures[key]={...h.stripeFixtures[key],object:'checkout.session',status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};
 return h.stripeFixtures[key];
}
test('resume checkout: authenticated owner reuses exact open session with zero writes',async()=>{
 const h=harness();const session=openSession(h);
 const result=await h.post('resume-checkout',{orderId});
 assert.equal(result.status,200);assert.equal(result.body.url,session.url);
 assert.deepEqual(h.requests,['customers/cus_fixture','checkout/sessions/cs_test_fixture']);assert.equal(h.writes.length,0);
 const again=await h.post('resume-checkout',{orderId});
 assert.equal(again.body.url,session.url);assert.equal(h.writes.length,0);
});
test('resume checkout: foreign UID, expired session, changed address, paid or held order cannot resume',async()=>{
 for(const variant of ['foreign','expired','complete','wrongCustomer','wrongUrl','changedProfile','changedStripe','paid','held']){
  const h=harness(),session=openSession(h);
  if(variant==='expired')session.status='expired';
  if(variant==='complete')session.status='complete';
  if(variant==='wrongCustomer')session.customer='cus_other';
  if(variant==='wrongUrl')session.url='https://checkout.stripe.com.invalid/c/pay/x';
  if(variant==='changedProfile')h.put('commercial_profiles/a',{...profile,address1:'101 Main St'});
  if(variant==='changedStripe')h.stripeFixtures['customers/cus_fixture'].address={...address,line1:'101 Main St'};
  if(['paid','held'].includes(variant))h.put('commercial_orders/'+orderId,{...h.get('commercial_orders/'+orderId),status:variant==='paid'?'paid_test':'paid_review_test'});
  const result=await h.post('resume-checkout',{orderId},variant==='foreign'?'b':'a');
  assert.equal(result.status,variant==='foreign'?404:409,variant);
  assert.equal(h.writes.length,0,variant);assert.ok(!result.body.url,variant);
  if(['foreign','changedProfile','paid','held'].includes(variant))assert.equal(h.requests.length,0,variant);
 }
});
const renewal=(h,overrides={})=>{h.stripeFixtures['invoices/in_renewal']={id:'in_renewal',livemode:false,customer:'cus_fixture',status:'paid',amount_due:57,amount_paid:57,currency:'cad',number:'fixture-2',subscription:'sub_fixture',...overrides};};
const event=(id,created=200,object={id:'in_renewal'},livemode=false)=>({id:'evt_'+id,created,livemode,data:{object}});
test('renewal paid webhook records only billing facts and one notice, exact replay is write-free',async()=>{
 const h=harness();renewal(h);
 const result=await h.webhook('invoice.paid',true,event('renewal'));
 assert.equal(result.status,200);assert.equal(h.get('commercial_invoices/in_renewal').uid,'a');assert.equal(h.get('commercial_invoices/in_renewal').amountPaid,57);
 assert.equal(h.get('commercial_notifications/evt_renewal').type,'invoice.paid');assert.equal(h.writes.length,3);
 const replay=await h.webhook('invoice.paid',true,event('renewal'));assert.equal(replay.status,200);assert.equal(h.writes.length,3);assert.equal(h.requests.length,1);
 assert.equal(h.get('commercial_provisioning_outbox/'+orderId),undefined);assert.equal(h.get('commercial_orders/'+orderId).status,'pending_test');
});
test('out-of-order billing failure cannot overwrite newer paid invoice projection',async()=>{
 const h=harness();renewal(h);
 assert.equal((await h.webhook('invoice.paid',true,event('new',300))).status,200);
 assert.equal((await h.webhook('invoice.payment_failed',true,event('old',200))).status,200);
 const invoice=h.get('commercial_invoices/in_renewal');assert.equal(invoice.status,'paid');assert.equal(invoice.eventCreated,300);
 assert.equal(h.get('commercial_billing_events/evt_old').eventType,'invoice.payment_failed');
 assert.equal(h.writes.filter(w=>w.key==='commercial_invoices/in_renewal').length,1);
 assert.ok(h.writes.every(w=>!w.key.includes('provisioning_outbox')));
});
test('upcoming invoice is advisory, never creates a payable invoice or provisioning request',async()=>{
 const h=harness();
 const result=await h.webhook('invoice.upcoming',true,event('upcoming',200,{livemode:false,customer:'cus_fixture',amount_due:57}));
 assert.equal(result.status,200);assert.equal(h.get('commercial_notifications/evt_upcoming').objectId,null);assert.equal(h.writes.length,2);assert.equal(h.requests.length,0);
 assert.ok(h.writes.every(w=>!w.key.includes('commercial_invoices')&&!w.key.includes('provisioning_outbox')));
});
test('billing webhook rejects live, duplicate owner and foreign projection without mutation',async()=>{
 for(const variant of ['live','duplicate','foreign','unowned']){
  const h=harness();renewal(h,variant==='unowned'?{customer:'cus_external'}:{});
  if(variant==='duplicate')h.put('commercial_billing_customers/b',{uid:'b',environment:'sandbox',stripeCustomerId:'cus_fixture'});
  if(variant==='foreign')h.put('commercial_invoices/in_renewal',{uid:'b',status:'paid'});
  const result=await h.webhook('invoice.paid',true,event(variant,200,{id:'in_renewal'},variant==='live'));
  assert.equal(result.status,variant==='live'?400:variant==='unowned'?200:409,variant);assert.equal(h.writes.length,0,variant);
 }
});
test('subscription deleted webhook records Stripe fact, never executes cancellation or license change',async()=>{
 const h=harness();
 h.stripeFixtures['subscriptions/sub_fixture']={...h.stripeFixtures['subscriptions/sub_fixture'],status:'canceled',current_period_end:200,cancel_at_period_end:false};
 const result=await h.webhook('customer.subscription.deleted',true,event('cancel',200,{id:'sub_fixture'}));
 assert.equal(result.status,200);assert.equal(h.get('commercial_subscriptions/sub_fixture').status,'canceled');assert.equal(h.writes.length,3);
 assert.ok(h.writes.every(w=>/commercial_(subscriptions|notifications|billing_events)\//.test(w.key)));
});

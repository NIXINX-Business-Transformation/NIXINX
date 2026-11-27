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
 const rows=new Map(),writes=[],requests=[],mail=[];let serial=10;let mailStatus=200,failAudit=false;
 const put=(key,value,rev=1)=>rows.set(key,{value:structuredClone(value),rev});
 const get=(key)=>rows.get(key)?.value;
 const snapshot=(key)=>{
  const row=rows.get(key),v=row?.value;
  return {exists:!!row,updateTime:row?{seconds:row.rev,nanoseconds:0}:undefined,data:()=>v&&structuredClone(v),get:k=>k.split('.').reduce((a,b)=>a?.[b],v)};
 };
 const ref=(key)=>({key,id:key.split('/').at(-1),get:async()=>snapshot(key),collection:name=>collection(key+'/'+name),update:async v=>{if(failAudit)throw Error('audit unavailable');assert.ok(rows.has(key));put(key,{...get(key),...v},rows.get(key).rev+1);writes.push({op:'update',key});}});
 const collection=(key)=>({doc:(id='history-'+(++serial))=>ref(key+'/'+id),where:(field,op,value)=>({limit:max=>({get:async()=>{
  assert.equal(op,'==');const docs=[...rows.keys()].filter(k=>k.startsWith(key+'/')&&!k.slice(key.length+1).includes('/')&&get(k)?.[field]===value).slice(0,max).map(k=>({...snapshot(k),id:k.slice(key.length+1),ref:ref(k)}));return {docs,empty:!docs.length,size:docs.length};
 }})})});
 let transactionTail=Promise.resolve();
 const transaction=async fn=>{
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
 };
 const db={collection,runTransaction:fn=>{const next=transactionTail.then(()=>transaction(fn));transactionTail=next.catch(()=>{});return next;}};
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
  if(url==='https://api.resend.com/emails'){assert.equal(opts.method,'POST');mail.push({body:JSON.parse(opts.body),headers:opts.headers});if(mailStatus===0)throw Error('transport');return new Response(JSON.stringify({id:'49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'}),{status:mailStatus});}
  const p='https://api.stripe.com/v1/';
  assert.ok(url.startsWith(p),'unexpected network request');
  assert.equal(opts.method,'GET','no Stripe writes permitted');
  const key=url.slice(p.length);requests.push(key);
  assert.ok(stripeFixtures[key],'unexpected Stripe path '+key);
  const fixture=stripeFixtures[key];if(fixture.__httpStatus)return {ok:false,status:fixture.__httpStatus,json:async()=>({error:{message:'fixture internal detail'}})};
  return {ok:true,json:async()=>structuredClone(fixture)};
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
 const post=(action,body,token='a',requestOrigin=origin)=>api.POST({headers:new Headers({origin:requestOrigin}),nextUrl:{origin},cookies:{get:()=>token?{value:token}:undefined},text:async()=>JSON.stringify(body)},ctx(action));
 const webhook=(type='checkout.session.completed',signatureValid=true,eventOverrides={})=>{
  const raw=JSON.stringify({id:'evt_fixture',type,livemode:false,created:100,data:{object:{id:'cs_test_fixture'}},...eventOverrides});
  const t=Math.floor(Date.now()/1000),hash=createHmac('sha256',env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
  return api.POST({headers:new Headers({'stripe-signature':'t='+t+',v1='+(signatureValid?hash:'0'.repeat(64))}),text:async()=>raw},ctx('stripe-webhook'));
 };
 return {api,ctx,env,post,put,get,writes,requests,mail,setMailStatus:v=>{mailStatus=v;},failAudit:()=>{failAudit=true;}};
}


const requestId='1a3999c0-0ce1-4ea6-ab68-afcd6dc2e794';
const ticket={kind:'claim',subject:'Private subject',description:'Private customer description',appId:'',requestId};
const recordKey=(uid,id=requestId)=>'commercial_support_requests/'+createHash('sha256').update(JSON.stringify([uid,id])).digest('hex');
function enable(h){Object.assign(h.env,{SUPPORT_NOTIFICATIONS_ENABLED:'true',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'NIXINX <sender@example.test>',SUPPORT_NOTIFY_EMAIL:'support@nixinx.com'});}
test('support endpoint: disabled transport saves ticket without email or financial writes',async()=>{
 const h=harness(),r=await h.post('support',ticket);assert.equal(r.status,201);assert.equal(h.get(recordKey('a')).status,'OPEN');assert.equal(h.get(recordKey('a')).internalNotification.status,'NOT_CONFIGURED');assert.equal(h.mail.length,0);assert.equal(h.requests.length,0);
 assert.ok(h.writes.every(w=>w.key===recordKey('a')));
});
test('support endpoint: concurrent retry sends one minimal notification only after persistence',async()=>{
 const h=harness();enable(h);const rs=await Promise.all([h.post('support',ticket),h.post('support',ticket)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,201]);assert.equal(rs[0].body.id,rs[1].body.id);assert.equal(h.mail.length,1);const m=h.mail[0],record=h.get(recordKey('a'));assert.equal(record.internalNotification.status,'ACCEPTED');assert.equal(record.internalNotification.providerId,'49a3999c-0ce1-4ea6-ab68-afcd6dc2e794');assert.deepEqual(m.body.to,['support@nixinx.com']);assert.equal(m.headers['Idempotency-Key'],'nixinx-support/'+rs[0].body.id);assert.ok(m.body.text.includes(rs[0].body.id));for(const value of [ticket.subject,ticket.description,'a@example.test'])assert.ok(!JSON.stringify(m.body).includes(value));assert.equal(h.requests.length,0);assert.ok(h.writes.every(w=>w.key===recordKey('a')));
});
test('support endpoint: invalid origin, unauthenticated, malformed input and stale client cannot send or write',async()=>{
 const h=harness();enable(h);for(const [body,token,requestOrigin] of [[ticket,'a','https://other.invalid'],[ticket,''],[{...ticket,requestId:'bad'},'a'],[{...ticket,requestId:undefined},'a'],[{...ticket,kind:'unknown'},'a'],[{...ticket,description:'x'},'a'],[{...ticket,kind:'cancellation',appId:'other'},'a']]){const r=await h.post('support',body,token,requestOrigin);assert.ok(r.status>=400);}assert.equal(h.mail.length,0);assert.equal(h.writes.length,0);assert.equal(h.requests.length,0);
});
test('support endpoint: same request ID with changed payload conflicts; separate users isolated',async()=>{
 const h=harness();enable(h);assert.equal((await h.post('support',ticket)).status,201);const before=structuredClone(h.get(recordKey('a')));assert.equal((await h.post('support',{...ticket,subject:'Different subject'})).status,409);assert.equal(h.mail.length,1);assert.deepEqual(h.get(recordKey('a')),before);const b=await h.post('support',ticket,'b');assert.equal(b.status,201);assert.notEqual(b.body.id,recordKey('a').split('/')[1]);assert.equal(h.get(recordKey('b')).uid,'b');assert.deepEqual(h.get(recordKey('a')),before);assert.equal(h.mail.length,2);assert.equal(h.requests.length,0);
});
test('support endpoint: failed or unknown provider response preserves ticket, retry never sends again',async()=>{
 for(const [status,expected] of [[403,'FAILED'],[500,'UNKNOWN'],[0,'UNKNOWN']]){const h=harness();enable(h);h.setMailStatus(status);const r=await h.post('support',ticket);assert.equal(r.status,201);assert.equal(h.get(recordKey('a')).internalNotification.status,expected);assert.equal((await h.post('support',ticket)).status,200);assert.equal(h.mail.length,1);assert.equal(h.requests.length,0);}
});
test('support endpoint: audit update failure leaves PENDING, retry does not repeat send',async()=>{
 const h=harness();enable(h);h.failAudit();assert.equal((await h.post('support',ticket)).status,201);assert.equal(h.get(recordKey('a')).internalNotification.status,'PENDING');assert.equal((await h.post('support',ticket)).status,200);assert.equal(h.mail.length,1);assert.equal(h.requests.length,0);
});
test('support endpoint: cancellation of contracted application records request only',async()=>{
 const h=harness();enable(h);h.put('commercial_orders/'+orderId,{...h.get('commercial_orders/'+orderId),status:'paid_test'});const r=await h.post('support',{...ticket,kind:'cancellation',appId:'corporate'});assert.equal(r.status,201);assert.equal(h.get(recordKey('a')).appId,'corporate');assert.equal(h.mail.length,1);assert.equal(h.requests.length,0);assert.ok(h.writes.every(w=>w.key===recordKey('a')));
});

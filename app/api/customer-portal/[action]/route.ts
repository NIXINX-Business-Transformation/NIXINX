import { NextRequest, NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { commercialCatalog, reconcileStripe } from '@/lib/commercial-stripe-catalog';
import { billingCustomer, hostedBilling, billingSubscriptions } from '@/lib/customer-billing';
import { recordBillingEvent } from '@/lib/commercial-billing-events';
import {countryCode,provinceCode} from '@/lib/commercial-geography';
import { commercialTaxPolicy, quoteTax } from '@/lib/commercial-tax';
import { CONSENT_VERSION } from '@/lib/commercial-consents';
import {validNewOrganizationAcronym,normalizeOrganizationAcronym} from '@/lib/organization-acronym';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const cookie='__Host-nx-commercial', ttl=86400000;
const result=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(code:string,status=400)=>result({error:code},status);
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const slug=/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])$/;
function service(){
 const projectId=process.env.FIREBASE_PROJECT_ID,clientEmail=process.env.FIREBASE_CLIENT_EMAIL,privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
 if(!projectId||!clientEmail||!privateKey)throw Error('NOT_CONFIGURED');
 const app=getApps().find(a=>a.name==='commercial')??initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId},'commercial');
 return {auth:getAuth(app),db:getFirestore(app)};
}
function origin(){const u=new URL(process.env.CUSTOMER_PORTAL_ORIGIN||'');if(u.protocol!=='https:')throw Error('NOT_CONFIGURED');return u.origin;}
async function user(req:NextRequest){try{const t=req.cookies.get(cookie)?.value;if(!t)return null;const u=await service().auth.verifySessionCookie(t,true);return u.email_verified&&u.email?u:null;}catch{return null;}}
async function firebase(action:string,body:object){
 const key=process.env.CUSTOMER_FIREBASE_WEB_API_KEY;if(!key)throw Error('NOT_CONFIGURED');
 const res=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('AUTH_FAILED');return res.json();
}
async function stripe(path:string,form?:URLSearchParams,idempotency?:string){
 const key=process.env.STRIPE_COMMERCIAL_SECRET_KEY;if(!key?.startsWith('rk_test_'))throw Error('SANDBOX_NOT_CONFIGURED');
 const headers:Record<string,string>={Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20'};
 if(form)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotency)headers['Idempotency-Key']=idempotency;
 const res=await fetch('https://api.stripe.com/v1/'+path,{method:form?'POST':'GET',headers,body:form,cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('STRIPE_UNAVAILABLE');const obj=await res.json();if(obj.object==='list'?(!Array.isArray(obj.data)||obj.data.some((v:{livemode?:boolean})=>v.livemode!==false)):obj.livemode!==false)throw Error('LIVE_REJECTED');return obj;
}
const catalog=commercialCatalog;
function signature(raw:string,header:string){
 const secret=process.env.STRIPE_SANDBOX_WEBHOOK_SECRET;if(!secret?.startsWith('whsec_'))return false;
 const pairs=header.split(',').map(p=>p.split('='));const t=pairs.find(p=>p[0]==='t')?.[1];
 if(!t||!/^\d+$/.test(t)||Math.abs(Date.now()/1000-Number(t))>300)return false;
 const hash=createHmac('sha256',secret).update(t+'.'+raw).digest();
 return pairs.some(p=>p[0]==='v1'&&/^[a-f0-9]{64}$/.test(p[1]||'')&&timingSafeEqual(hash,Buffer.from(p[1],'hex')));
}
async function webhook(req:NextRequest){
 const raw=await req.text();if(raw.length>1000000||!signature(raw,req.headers.get('stripe-signature')||''))return fail('INVALID_SIGNATURE');
 const event=JSON.parse(raw);if(event.livemode!==false)return fail('LIVE_REJECTED');
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  await recordBillingEvent(service().db,event,stripe);
  return result({received:true});
 }
 const id=str(event.data?.object?.id);if(!/^cs_test_[A-Za-z0-9_]+$/.test(id))return fail('INVALID_SESSION');
 const s=await stripe('checkout/sessions/'+encodeURIComponent(id));
 if(s.payment_status!=='paid')return result({received:true});
 const orderId=str(s.client_reference_id);
 if(!/^[a-f0-9]{64}$/.test(orderId)||!['payment','subscription'].includes(s.mode)||s.status!=='complete'||!Number.isSafeInteger(s.amount_total)||s.amount_total<50||s.currency!=='cad'||(s.mode==='payment'&&typeof s.payment_intent!=='string')||(s.mode==='subscription'&&typeof s.subscription!=='string'))return fail('PAYMENT_MISMATCH',409);
 const {db}=service(),ref=db.collection('commercial_orders').doc(orderId),out=db.collection('commercial_provisioning_outbox').doc(orderId);
 const [existingOrder,existingOut]=await Promise.all([ref.get(),out.get()]);
 if(existingOut.exists){
  if(existingOrder.get('stripeSessionId')!==id||existingOut.get('payment.checkoutSessionId')!==id||s.metadata?.orderId!==orderId)return fail('ORDER_MISMATCH',409);
  return result({received:true});
 }
 let subscriptionId:string|null=null,paymentIntentId=s.payment_intent;
 if(s.mode==='subscription'){
  const sub=await stripe('subscriptions/'+encodeURIComponent(s.subscription));
  if(sub.customer!==s.customer||sub.metadata?.orderId!==orderId||typeof sub.id!=='string')return fail('PAYMENT_MISMATCH',409);
  const invoices=await stripe('invoices?'+new URLSearchParams({subscription:sub.id,limit:'100'}));
  const initial=invoices.data.filter((v:any)=>v.billing_reason==='subscription_create');
  if(invoices.has_more||initial.length!==1)return fail('PAYMENT_MISMATCH',409);
  const invoice=initial[0];
  if(invoice.status!=='paid'||invoice.billing_reason!=='subscription_create'||invoice.customer!==s.customer||invoice.subscription!==sub.id||invoice.amount_paid!==s.amount_total||invoice.currency!=='cad'||typeof invoice.payment_intent!=='string')return fail('PAYMENT_MISMATCH',409);
  subscriptionId=sub.id;paymentIntentId=invoice.payment_intent;
 }
 await db.runTransaction(async tx=>{
  const [old,prior]=await Promise.all([tx.get(ref),tx.get(out)]);const order=old.data();
  if(!order||order.stripeSessionId!==id||(order.billingMode??'payment')!==s.mode||s.metadata?.orderId!==orderId||(order.stripeCustomerId&&order.stripeCustomerId!==s.customer)||(s.mode==='payment'?order.amount!==s.amount_total:(order.subtotal!==s.amount_subtotal||s.automatic_tax?.enabled!==true||s.automatic_tax?.status!=='complete'||!Number.isSafeInteger(s.total_details?.amount_tax)||s.total_details.amount_tax<0||s.amount_total!==order.subtotal+s.total_details.amount_tax||s.customer_details?.address?.country!=='CA'))||order.currency!=='cad')throw Error('ORDER_MISMATCH');
  if(prior.exists){if(prior.get('payment.checkoutSessionId')!==id)throw Error('ORDER_MISMATCH');return;}
  tx.update(ref,{status:'paid_test',...(subscriptionId?{stripeSubscriptionId:subscriptionId,amount:s.amount_total,taxAmount:s.total_details.amount_tax}:{}),paidAt:FieldValue.serverTimestamp()});
  tx.create(out,{schemaVersion:1,requestId:orderId,environment:'sandbox',status:'PENDING_PROVISIONER',customer:order.profile,applicationIds:order.applicationIds,payment:{provider:'stripe',status:'paid',livemode:false,checkoutSessionId:id,paymentIntentId,eventId:event.id,amount:s.amount_total,currency:'cad'},createdAt:FieldValue.serverTimestamp()});
 });
 return result({received:true});
}
type Ctx={params:Promise<{action:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 try{const action=(await params).action;if(action==='auth-config'){const key=process.env.CUSTOMER_FIREBASE_WEB_API_KEY,projectId=process.env.FIREBASE_PROJECT_ID;if(!key||projectId!=='nixinx-bt')return fail('NOT_CONFIGURED',503);return result({apiKey:key,projectId,authDomain:projectId+'.firebaseapp.com'});}if(action!=='account')return fail('NOT_FOUND',404);const u=await user(req);if(!u)return fail('LOGIN_REQUIRED',401);
 const {db}=service();const [p,orders,items,tickets]=await Promise.all([db.collection('commercial_profiles').doc(u.uid).get(),db.collection('commercial_orders').where('uid','==',u.uid).limit(501).get(),catalog().catch(()=>null),db.collection('commercial_support_requests').where('uid','==',u.uid).limit(100).get()]);
 if(orders.size>500)return fail('ORDER_HISTORY_LIMIT',409);
 const records=orders.docs.map(d=>({id:d.id,status:d.get('status'),billingMode:d.get('billingMode')??'payment',subscriptionId:d.get('stripeSubscriptionId')??null,applicationIds:d.get('applicationIds')??[],amount:d.get('amount')??d.get('subtotal')??0,currency:d.get('currency'),date:d.get('paidAt')?.toMillis?.()??d.get('createdAt')?.toMillis?.()??null}));
 return result({email:u.email,communication:{email:p.get('communication.email')===true,sms:p.get('communication.sms')===true},profile:p.data()??null,taxPolicy:commercialTaxPolicy(p.data()??null),items:(items??[]).map(({priceId,...item})=>item),catalogAvailable:items!==null,orders:records.sort((a,b)=>(b.date??0)-(a.date??0)),tickets:tickets.docs.map(d=>({id:d.id,kind:d.get('kind'),subject:d.get('subject'),status:d.get('status'),date:d.get('createdAt')?.toMillis?.()??null}))});
 }catch{return fail('PORTAL_UNAVAILABLE',503);}
}
const syncOrigin='https://controlde.nixinx.org';
const cors={'Access-Control-Allow-Origin':syncOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store','Vary':'Origin'};
export async function OPTIONS(req:NextRequest,{params}:Ctx){
 if((await params).action!=='catalog-sync'||req.headers.get('origin')!==syncOrigin)return new Response(null,{status:403});
 return new Response(null,{status:204,headers:cors});
}
async function sync(req:NextRequest){
 if(req.headers.get('origin')!==syncOrigin)return fail('INVALID_ORIGIN',403);
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length>8192)return NextResponse.json({error:'STAFF_REQUIRED'},{status:401,headers:cors});
 try{
  const data=await reconcileStripe(auth.slice(7));
  return NextResponse.json(data,{headers:cors});
 }catch(e){
  const code=e instanceof Error?e.message:'SYNC_FAILED';
  const safe=['STAFF_REQUIRED','CATALOG_UNAVAILABLE','CATALOG_LIMIT','CATALOG_INVALID','STRIPE_CATALOG_UNAVAILABLE','SANDBOX_NOT_CONFIGURED','LIVE_REJECTED','STRIPE_PRODUCT_CONFLICT','STRIPE_READBACK_FAILED','CATALOG_CHANGED_RETRY','STRIPE_CATALOG_LIMIT'];
  return NextResponse.json({error:safe.includes(code)?code:'SYNC_FAILED'},{status:code==='STAFF_REQUIRED'?403:503,headers:cors});
 }
}
// Staff lookup is read-only and uses Control's existing verified financial authority.
async function financialLookup(req:NextRequest){
 const authorization=req.headers.get('authorization')||'';
 if(!authorization.startsWith('Bearer ')||authorization.length>8192)return fail('STAFF_REQUIRED',401);
 const gate=await fetch(syncOrigin+'/api/commercial/financial-authority',{method:'POST',headers:{Authorization:authorization},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!gate.ok)return fail('STAFF_REQUIRED',gate.status===401?401:403);
 if((await gate.json()).authorized!==true)return fail('STAFF_REQUIRED',403);
 const raw=await req.text();if(raw.length>2000)return fail('REQUEST_TOO_LARGE',413);
 const b=JSON.parse(raw);
 // Read-only directory from the canonical acronym claims and their owning profiles.
 // Never use Control tenant records as substitutes for commercial identities.
 if(b.directory===true){
  if(Object.keys(b).some(k=>!['directory','cursor'].includes(k))||(b.cursor!==undefined&&(typeof b.cursor!=='string'||!slug.test(b.cursor))))return fail('INVALID_DIRECTORY_REQUEST');
  const {db}=service();
  let query=db.collection('commercial_acronyms').orderBy('__name__');
  if(b.cursor)query=query.startAfter(b.cursor);
  const page=await query.limit(101).get(),claims=page.docs.slice(0,100);
  const identities=claims.map(d=>({acronym:d.id,uid:d.get('uid')}));
  if(identities.some(x=>!slug.test(x.acronym)||typeof x.uid!=='string'||!x.uid||x.uid.includes('/')))return fail('BILLING_RECONCILIATION_REQUIRED',409);
  const profiles=identities.length?await db.getAll(...identities.map(x=>db.collection('commercial_profiles').doc(x.uid))):[];
  if(profiles.some((p,i)=>!p.exists||p.get('acronym')!==identities[i].acronym||typeof p.get('company')!=='string'||!p.get('company').trim()))return fail('BILLING_RECONCILIATION_REQUIRED',409);
  return result({customers:identities.map((x,i)=>({acronym:x.acronym,company:profiles[i].get('company')})),cursor:page.size>100?claims[claims.length-1].id:null});
 }
 const acronym=str(b.acronym);
 if(!slug.test(acronym))return fail('INVALID_ACRONYM');
 const {db}=service(),claim=await db.collection('commercial_acronyms').doc(acronym).get();
 const uid=claim.get('uid');if(typeof uid!=='string'||!uid)return result({payments:[]});
 const [profile,binding,orders]=await Promise.all([db.collection('commercial_profiles').doc(uid).get(),db.collection('commercial_billing_customers').doc(uid).get(),db.collection('commercial_orders').where('uid','==',uid).limit(501).get()]);
 if(profile.get('acronym')!==acronym||orders.size>500)return fail('BILLING_RECONCILIATION_REQUIRED',409);
 const customer=binding.get('stripeCustomerId');if(!customer)return result({payments:[]});
 if(binding.get('uid')!==uid||binding.get('environment')!=='sandbox'||!/^cus_[A-Za-z0-9]+$/.test(customer))return fail('BILLING_BINDING_INVALID',409);
 const c=await stripe('customers/'+customer);
 if(c.deleted||c.metadata?.nixinx_owner!=='nixinx-commercial-sandbox-v1'||c.metadata?.nixinx_uid_hash!==createHash('sha256').update(uid).digest('hex'))return fail('BILLING_BINDING_INVALID',409);
 const page=await stripe('invoices?'+new URLSearchParams({customer,limit:'100'}));
 if(page.has_more)return fail('BILLING_HISTORY_LIMIT',409);
 const payments=page.data.flatMap((invoice:any)=>{
  if(invoice.customer!==customer||invoice.status!=='paid'||invoice.currency!=='cad'||typeof invoice.payment_intent!=='string'||!/^pi_[A-Za-z0-9]+$/.test(invoice.payment_intent))return [];
  const matches=orders.docs.filter(d=>d.get('status')==='paid_test'&&d.get('stripeSubscriptionId')===invoice.subscription);
  if(matches.length!==1)return [];
  const applicationIds=matches[0].get('applicationIds');
  if(!Array.isArray(applicationIds)||!applicationIds.length)return [];
  if(!/^in_[A-Za-z0-9]+$/.test(invoice.id??'')||!Number.isSafeInteger(invoice.amount_paid)||invoice.amount_paid<=0)return [];
  return [{paymentIntentId:invoice.payment_intent,invoiceId:invoice.id,orderId:matches[0].id,customerId:customer,subscriptionId:invoice.subscription,invoiceNumber:invoice.number??null,applicationIds,amount:invoice.amount_paid,currency:'cad',date:invoice.created*1000}];
 });
 return result({acronym,company:profile.get('company')??null,payments});
}
export async function POST(req:NextRequest,{params}:Ctx){
 try{
 const {action}=await params;if(action==='stripe-webhook')return await webhook(req);if(action==='catalog-sync')return await sync(req);if(action==='financial-lookup')return await financialLookup(req);
 if(req.headers.get('origin')!==origin()||req.nextUrl.origin!==origin())return fail('INVALID_ORIGIN',403);
 const raw=await req.text();if(raw.length>(action==='profile'?150000:10000))return fail('REQUEST_TOO_LARGE',413);const body=JSON.parse(raw||'{}');
 if(action==='google-login'){
  const idToken=typeof body.idToken==='string'?body.idToken:'';
  if(!idToken||idToken.length>8192)return fail('AUTH_FAILED',401);
  const {auth}=service();
  const decoded=await auth.verifyIdToken(idToken,true).catch(()=>null);
  if(!decoded?.email_verified||!decoded.email||decoded.firebase.sign_in_provider!=='google.com'||Math.abs(Date.now()/1000-decoded.auth_time)>300)return fail('AUTH_FAILED',401);
  const session=await auth.createSessionCookie(idToken,{expiresIn:ttl});
  const response=result({ok:true});response.cookies.set(cookie,session,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ttl/1000});return response;
 }
 if(action==='register'||action==='login'||action==='reset'){
  const email=str(body.email).toLowerCase(),password=typeof body.password==='string'?body.password:'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return fail('INVALID_EMAIL');
  if(action==='reset'){try{await firebase('sendOobCode',{requestType:'PASSWORD_RESET',email});}catch{}return result({ok:true});}
  if(password.length<8||password.length>128)return fail('INVALID_PASSWORD');
  const token=await firebase(action==='register'?'signUp':'signInWithPassword',{email,password,returnSecureToken:true});
  const {auth}=service(),decoded=await auth.verifyIdToken(token.idToken,true);
  if(!decoded.email_verified){await firebase('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:token.idToken});return result({verifyEmail:true});}
  const session=await auth.createSessionCookie(token.idToken,{expiresIn:ttl});const r=result({ok:true});r.cookies.set(cookie,session,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:ttl/1000});return r;
 }
 if(action==='logout'){const r=result({ok:true});r.cookies.set(cookie,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return r;}
 const u=await user(req);if(!u)return fail('LOGIN_REQUIRED',401);
 const {db}=service(),p=db.collection('commercial_profiles').doc(u.uid);
 if(action==='acronym-availability'){
  const candidate=typeof body.acronym==='string'?normalizeOrganizationAcronym(body.acronym):'';
  if(!validNewOrganizationAcronym(candidate))return fail('INVALID_NEW_ACRONYM',400);
  const status=await db.runTransaction(async tx=>{
   const [profile,claim]=await Promise.all([tx.get(p),tx.get(db.collection('commercial_acronyms').doc(candidate))]);
   if(profile.exists)return 'immutable';
   return claim.exists?'taken':'available';
  },{readOnly:true});
  return result({acronym:candidate,status});
 }
 if(action==='communication-preferences'){
  if(typeof body.email!=='boolean'||typeof body.sms!=='boolean'||body.version!==CONSENT_VERSION||!['en','es','fr'].includes(body.locale))return fail('INVALID_CONSENT');
  const ref=p.collection('communication_history').doc();
  await db.runTransaction(async tx=>{
   const old=await tx.get(p);if(!old.exists)throw Error('PROFILE_REQUIRED');
   const before={email:old.get('communication.email')===true,sms:old.get('communication.sms')===true};
   if(before.email===body.email&&before.sms===body.sms)return;
   if(body.sms&&!str(old.get('phone')))throw Error('PHONE_REQUIRED');
   const current={email:body.email,sms:body.sms,version:CONSENT_VERSION,locale:body.locale,updatedAt:FieldValue.serverTimestamp()};
   tx.update(p,{communication:current});
   tx.create(ref,{uid:u.uid,before,after:{email:body.email,sms:body.sms},version:CONSENT_VERSION,locale:body.locale,createdAt:FieldValue.serverTimestamp()});
  });return result({ok:true});
 }
 if(action==='profile'){
  const name=str(body.name),company=str(body.company),rawAcronym=typeof body.acronym==='string'?body.acronym:'',acronym=normalizeOrganizationAcronym(rawAcronym);
  if(name.length<2||name.length>100||company.length<2||company.length>150||!slug.test(acronym)||/[^a-z0-9-]/.test(acronym))return fail('INVALID_PROFILE');
  const details:Record<string,string>={};
  const limits:Record<string,number>={legalName:150,contactEmail:254,phone:40,address1:150,address2:150,city:100,province:100,postalCode:24,country:80,taxType:60,taxId:80};
  for(const [key,max] of Object.entries(limits)){
   if(body[key]===undefined)continue;
   if(typeof body[key]!=='string'||body[key].trim().length>max)return fail('INVALID_PROFILE');
   details[key]=body[key].trim();
  }
  if(details.country!==undefined||details.province!==undefined){
   const country=countryCode(details.country),province=provinceCode(details.province);
   if(!country||!province)return fail('INVALID_BILLING_JURISDICTION');
   details.country=country;details.province=province;
  }
  if(details.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail))return fail('INVALID_CONTACT_EMAIL');
  if(body.avatar!==undefined){
   if(typeof body.avatar!=='string'||body.avatar.length>120000||(body.avatar!==''&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.avatar)))return fail('INVALID_AVATAR');
   details.avatar=body.avatar;
  }
  const claim=db.collection('commercial_acronyms').doc(acronym);
  await db.runTransaction(async tx=>{const [old,c]=await Promise.all([tx.get(p),tx.get(claim)]);
   if(old.exists&&old.get('acronym')!==rawAcronym)throw Error('ACRONYM_IMMUTABLE');
   if(!old.exists&&!validNewOrganizationAcronym(acronym))throw Error('INVALID_NEW_ACRONYM');
   if(c.exists&&c.get('uid')!==u.uid)throw Error('ACRONYM_TAKEN');
   if(!c.exists)tx.create(claim,{uid:u.uid});tx.set(p,{...details,name,company,acronym,email:u.email},{merge:true});
  });return result({ok:true});
 }
 if(action==='notifications'||action==='invoices'){
  const collection=action==='notifications'?'commercial_notifications':'commercial_invoices';
  const rows=await db.collection(collection).where('uid','==',u.uid).limit(501).get();
  if(rows.size>500)return fail('BILLING_HISTORY_LIMIT',409);
  if(action==='notifications')return result({notifications:rows.docs.map(d=>({id:d.id,type:d.get('type'),read:d.get('read')===true,date:d.get('createdAt')?.toMillis?.()??null})).sort((a,b)=>(b.date??0)-(a.date??0))});
  return result({invoices:rows.docs.map(d=>({id:d.id,number:d.get('number')??null,status:d.get('status'),amountDue:d.get('amountDue'),amountPaid:d.get('amountPaid'),currency:d.get('currency'),date:Number(d.get('eventCreated')??0)*1000})).sort((a,b)=>b.date-a.date)});
 }
 if(action==='notification-read'){
  const id=str(body.id);if(!/^evt_[A-Za-z0-9_]+$/.test(id))return fail('INVALID_NOTIFICATION');
  const ref=db.collection('commercial_notifications').doc(id);
  await db.runTransaction(async tx=>{const n=await tx.get(ref);if(!n.exists||n.get('uid')!==u.uid)throw Error('NOTIFICATION_NOT_FOUND');tx.update(ref,{read:true,readAt:FieldValue.serverTimestamp()});});
  return result({ok:true});
 }
 if(action==='billing-portal'||action==='subscriptions'){
  const locale=str(body.locale);if(!['en','es','fr'].includes(locale))return fail('INVALID_LOCALE');
  const profile=(await p.get()).data();if(!profile)return fail('PROFILE_REQUIRED',409);
  if(action==='subscriptions'){
   const bound=(await db.collection('commercial_billing_customers').doc(u.uid).get()).data();
   if(!bound?.stripeCustomerId)return result({subscriptions:[]});
   const customer=await billingCustomer(db,u.uid,profile,stripe);
   return result({subscriptions:await billingSubscriptions(stripe,customer)});
  }
  const customer=await billingCustomer(db,u.uid,profile,stripe);
  return result({url:await hostedBilling(stripe,customer,origin()+'/'+locale+'/account?section=billing')});
 }
 if(action==='support'){
  const kind=str(body.kind),subject=str(body.subject),description=str(body.description),appId=str(body.appId);
  if(!['support','claim','cancellation'].includes(kind)||subject.length<3||subject.length>160||description.length<5||description.length>2000)return fail('INVALID_REQUEST');
  if(kind==='cancellation'){
   const orders=await db.collection('commercial_orders').where('uid','==',u.uid).limit(501).get();
   if(orders.size>500||!orders.docs.some(d=>d.get('status')==='paid_test'&&Array.isArray(d.get('applicationIds'))&&d.get('applicationIds').includes(appId)))return fail('APPLICATION_NOT_CONTRACTED',409);
  }
  const ref=db.collection('commercial_support_requests').doc();
  await ref.create({uid:u.uid,email:u.email,kind,subject,description,appId:kind==='cancellation'?appId:null,status:'OPEN',createdAt:FieldValue.serverTimestamp()});
  return result({id:ref.id},201);
 }
 if(action==='checkout'||action==='tax-quote'){
  const locale=str(body.locale);if(!['en','es','fr'].includes(locale)||!Array.isArray(body.applicationIds)||body.applicationIds.length<1||body.applicationIds.length>50||new Set(body.applicationIds).size!==body.applicationIds.length||body.applicationIds.some((id:unknown)=>typeof id!=='string'||!/^[a-z][a-z0-9-]{1,38}$/.test(id)))return fail('INVALID_SELECTION');
  const items=await catalog();
  const selected=items.filter(i=>body.applicationIds.includes(i.id));
  if(selected.length!==body.applicationIds.length)return fail('CATALOG_UNAVAILABLE',503);
  const subtotal=selected.reduce((sum,item)=>sum+item.amount,0);
  const applicationIds=selected.map(i=>i.id).sort();
  const profile=(await p.get()).data();if(!profile)return fail('PROFILE_REQUIRED',409);
  const taxPolicy=commercialTaxPolicy(profile);if(!taxPolicy)return fail('TAX_JURISDICTION_NOT_CONFIGURED',409);
  if(action==='tax-quote')return result(await quoteTax(stripe,taxPolicy,selected));
  if(body.termsAccepted!==true||body.termsVersion!==CONSENT_VERSION)return fail('TERMS_REQUIRED',409);
  const customer=await billingCustomer(db,u.uid,profile,stripe);
  const orderId=createHash('sha256').update('sandbox-v1:'+u.uid+':'+applicationIds.join(',')).digest('hex'),ref=db.collection('commercial_orders').doc(orderId);
  const order=await db.runTransaction<FirebaseFirestore.DocumentData>(async tx=>{const old=await tx.get(ref);if(old.exists){const existing=old.data()!;if(existing.status==='pending_test'&&existing.terms?.version!==CONSENT_VERSION)throw Error('ORDER_REQUIRES_REVIEW');return existing;}
   const previous=await tx.get(db.collection('commercial_orders').where('uid','==',u.uid).limit(501));
   if(previous.size>500||previous.docs.some(d=>['paid_test','pending_test'].includes(d.get('status'))&&Array.isArray(d.get('applicationIds'))&&d.get('applicationIds').some((id:string)=>applicationIds.includes(id))))throw Error('APPLICATION_ALREADY_ORDERED');
   const customerSnapshot={name:profile.name,company:profile.company,acronym:profile.acronym,email:u.email};
   const value={terms:{version:CONSENT_VERSION,locale,acceptedBy:u.uid,acceptedAt:FieldValue.serverTimestamp()},billingMode:'subscription',uid:u.uid,profile:customerSnapshot,stripeCustomerId:customer,applicationIds,subtotal,taxPolicy,currency:'cad',priceIds:selected.map(i=>i.priceId),status:'pending_test',createdAt:FieldValue.serverTimestamp()};tx.create(ref,value);return value;
  });
  if(order.status!=='pending_test')return fail('ORDER_ALREADY_PAID',409);
  if(order.stripeSessionId){const s=await stripe('checkout/sessions/'+encodeURIComponent(order.stripeSessionId));if(s.status==='open'&&s.url)return result({url:s.url});return fail('ORDER_REQUIRES_REVIEW',409);}
  if(order.billingMode!=='subscription'||order.subtotal!==subtotal||JSON.stringify(order.priceIds)!==JSON.stringify(selected.map(i=>i.priceId)))return fail('ORDER_REQUIRES_REVIEW',409);
  const base=origin()+'/'+locale+'/account';
  const form=new URLSearchParams({mode:'subscription',customer,'automatic_tax[enabled]':'true',billing_address_collection:'required','customer_update[address]':'auto','subscription_data[metadata][orderId]':orderId,client_reference_id:orderId,'metadata[orderId]':orderId,'payment_method_types[0]':'card',locale,success_url:base+'?checkout=returned&order='+orderId,cancel_url:base+'?checkout=cancelled'});
  selected.forEach((item,index)=>{form.set('line_items['+index+'][price]',item.priceId);form.set('line_items['+index+'][quantity]','1');});
  const s=await stripe('checkout/sessions',form,'nx-sandbox-'+orderId);
  if(!/^cs_test_/.test(s.id)||typeof s.url!=='string')return fail('INVALID_CHECKOUT',503);
  if(s.amount_subtotal!==subtotal||s.currency!=='cad'||s.automatic_tax?.enabled!==true)return fail('TAX_AMOUNT_MISMATCH',503);
  await ref.update({stripeSessionId:s.id});return result({url:s.url});
 }
 return fail('NOT_FOUND',404);
 }catch(e){const c=e instanceof Error?e.message:'';if(['ACRONYM_IMMUTABLE','ACRONYM_TAKEN','ORDER_MISMATCH','APPLICATION_ALREADY_ORDERED','BILLING_RECONCILIATION_REQUIRED','BILLING_CONFIGURATION_REVIEW','BILLING_BINDING_INVALID'].includes(c))return fail(c,409);if(['PROFILE_REQUIRED','PHONE_REQUIRED','ORDER_REQUIRES_REVIEW'].includes(c))return fail(c,409);if(c==='INVALID_NEW_ACRONYM')return fail(c,400);if(c==='NOTIFICATION_NOT_FOUND')return fail(c,404);if(c==='AUTH_FAILED')return fail(c,401);return fail('PORTAL_UNAVAILABLE',503);}
}

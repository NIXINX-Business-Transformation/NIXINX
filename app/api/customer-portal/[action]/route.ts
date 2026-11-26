import { NextRequest, NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
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
 const key=process.env.STRIPE_SANDBOX_SECRET_KEY;if(!key?.startsWith('sk_test_'))throw Error('SANDBOX_NOT_CONFIGURED');
 const headers:Record<string,string>={Authorization:'Bearer '+key,'Stripe-Version':'2024-06-20'};
 if(form)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotency)headers['Idempotency-Key']=idempotency;
 const res=await fetch('https://api.stripe.com/v1/'+path,{method:form?'POST':'GET',headers,body:form,cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('STRIPE_UNAVAILABLE');const obj=await res.json();if(obj.livemode!==false)throw Error('LIVE_REJECTED');return obj;
}
async function catalog(){
 // Read-only commercial projection; no staff token or access to Control's database.
 const d=(await service().db.collection('commercial_catalog').doc('corporate').get()).data();
 if(!d||d.source!=='nixinx-control'||d.appId!=='corporate'||d.status!=='active'||d.published!==true)return [];
 return [{id:'corporate',name:str(d.name)||'Corporate',amount:50,currency:'cad'}];
}
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
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return result({received:true});
 const id=str(event.data?.object?.id);if(!/^cs_test_[A-Za-z0-9_]+$/.test(id))return fail('INVALID_SESSION');
 const s=await stripe('checkout/sessions/'+encodeURIComponent(id));
 if(s.payment_status!=='paid')return result({received:true});
 const orderId=str(s.client_reference_id);
 if(!/^[a-f0-9]{64}$/.test(orderId)||s.mode!=='payment'||s.status!=='complete'||s.amount_total!==50||s.currency!=='cad'||typeof s.payment_intent!=='string')return fail('PAYMENT_MISMATCH',409);
 const {db}=service(),ref=db.collection('commercial_orders').doc(orderId),out=db.collection('commercial_provisioning_outbox').doc(orderId);
 await db.runTransaction(async tx=>{
  const [old,prior]=await Promise.all([tx.get(ref),tx.get(out)]);const order=old.data();
  if(!order||order.stripeSessionId!==id||s.metadata?.orderId!==orderId||order.amount!==50||order.currency!=='cad')throw Error('ORDER_MISMATCH');
  if(prior.exists){if(prior.get('payment.checkoutSessionId')!==id)throw Error('ORDER_MISMATCH');return;}
  tx.update(ref,{status:'paid_test',paidAt:FieldValue.serverTimestamp()});
  tx.create(out,{schemaVersion:1,requestId:orderId,environment:'sandbox',status:'PENDING_PROVISIONER',customer:order.profile,applicationIds:order.applicationIds,payment:{provider:'stripe',status:'paid',livemode:false,checkoutSessionId:id,paymentIntentId:s.payment_intent,eventId:event.id,amount:50,currency:'cad'},createdAt:FieldValue.serverTimestamp()});
 });
 return result({received:true});
}
type Ctx={params:Promise<{action:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 try{if((await params).action!=='account')return fail('NOT_FOUND',404);const u=await user(req);if(!u)return fail('LOGIN_REQUIRED',401);
 const {db}=service();const [p,orders,items]=await Promise.all([db.collection('commercial_profiles').doc(u.uid).get(),db.collection('commercial_orders').where('uid','==',u.uid).limit(10).get(),catalog()]);
 return result({email:u.email,profile:p.data()??null,items,orders:orders.docs.map(d=>({id:d.id,status:d.get('status')}))});
 }catch{return fail('PORTAL_UNAVAILABLE',503);}
}
export async function POST(req:NextRequest,{params}:Ctx){
 try{
 const {action}=await params;if(action==='stripe-webhook')return await webhook(req);
 if(req.headers.get('origin')!==origin()||req.nextUrl.origin!==origin())return fail('INVALID_ORIGIN',403);
 const raw=await req.text();if(raw.length>10000)return fail('REQUEST_TOO_LARGE',413);const body=JSON.parse(raw||'{}');
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
 if(action==='profile'){
  const name=str(body.name),company=str(body.company),acronym=str(body.acronym);
  if(name.length<2||name.length>100||company.length<2||company.length>150||!slug.test(acronym))return fail('INVALID_PROFILE');
  const claim=db.collection('commercial_acronyms').doc(acronym);
  await db.runTransaction(async tx=>{const [old,c]=await Promise.all([tx.get(p),tx.get(claim)]);
   if(old.exists&&old.get('acronym')!==acronym)throw Error('ACRONYM_IMMUTABLE');
   if(c.exists&&c.get('uid')!==u.uid)throw Error('ACRONYM_TAKEN');
   if(!c.exists)tx.create(claim,{uid:u.uid});tx.set(p,{name,company,acronym,email:u.email},{merge:true});
  });return result({ok:true});
 }
 if(action==='checkout'){
  const locale=str(body.locale);if(!['en','es','fr'].includes(locale)||!Array.isArray(body.applicationIds)||body.applicationIds.length!==1||body.applicationIds[0]!=='corporate')return fail('INVALID_SELECTION');
  if(!(await catalog()).length)return fail('CATALOG_UNAVAILABLE',503);
  const profile=(await p.get()).data();if(!profile)return fail('PROFILE_REQUIRED',409);
  const orderId=createHash('sha256').update('sandbox-v1:'+u.uid+':corporate').digest('hex'),ref=db.collection('commercial_orders').doc(orderId);
  const order=await db.runTransaction<FirebaseFirestore.DocumentData>(async tx=>{const old=await tx.get(ref);if(old.exists)return old.data()!;
   const value={uid:u.uid,profile,applicationIds:['corporate'],amount:50,currency:'cad',status:'pending_test',createdAt:FieldValue.serverTimestamp()};tx.create(ref,value);return value;
  });
  if(order.status!=='pending_test')return fail('ORDER_ALREADY_PAID',409);
  if(order.stripeSessionId){const s=await stripe('checkout/sessions/'+encodeURIComponent(order.stripeSessionId));if(s.status==='open'&&s.url)return result({url:s.url});return fail('ORDER_REQUIRES_REVIEW',409);}
  const base=origin()+'/'+locale+'/account';
  const form=new URLSearchParams({mode:'payment',customer_email:u.email!,client_reference_id:orderId,'metadata[orderId]':orderId,'payment_method_types[0]':'card','line_items[0][price_data][currency]':'cad','line_items[0][price_data][unit_amount]':'50','line_items[0][price_data][product_data][name]':'Corporate (sandbox)','line_items[0][quantity]':'1',success_url:base+'?checkout=returned',cancel_url:base+'?checkout=cancelled'});
  const s=await stripe('checkout/sessions',form,'nx-sandbox-'+orderId);
  if(!/^cs_test_/.test(s.id)||typeof s.url!=='string')return fail('INVALID_CHECKOUT',503);
  await ref.update({stripeSessionId:s.id});return result({url:s.url});
 }
 return fail('NOT_FOUND',404);
 }catch(e){const c=e instanceof Error?e.message:'';if(['ACRONYM_IMMUTABLE','ACRONYM_TAKEN','ORDER_MISMATCH'].includes(c))return fail(c,409);if(c==='AUTH_FAILED')return fail(c,401);return fail('PORTAL_UNAVAILABLE',503);}
}

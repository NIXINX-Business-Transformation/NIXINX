import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getLeadDb } from '@/lib/firebase-admin';
import { notifyMarketingLead } from '@/lib/marketing-lead-notification';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const locales=new Set(['en','es','fr']);
const intents=new Set(['infrastructure','software','information','performance','unsure']);
const respond=(status:number,error:string)=>NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest) {
  const size=Number(request.headers.get('content-length')||0);
  if(size>10000) return respond(413,'REQUEST_TOO_LARGE');
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  if(!origin||!host){return respond(403,'INVALID_ORIGIN')}
  try {if(new URL(origin).host!==host)return respond(403,'INVALID_ORIGIN')}catch{return respond(403,'INVALID_ORIGIN')}
  const db=getLeadDb();
  if(!db)return respond(503,'FORM_NOT_CONFIGURED');
  let raw:unknown;
  try{raw=await request.json()}catch{return respond(400,'INVALID_JSON')}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return respond(400,'INVALID_JSON');
  const obj=raw as Record<string,unknown>;
  const get=(key:string)=>typeof obj[key]==='string'?(obj[key] as string).trim():'';
  if(get('website'))return NextResponse.json({ok:true}); // honeypot, silently discard
  const name=get('name'),email=get('email'),company=get('company'),message=get('message'),intent=get('intent'),locale=get('locale'),consent=obj.consent===true;
  if(!consent||name.length<2||name.length>100||company.length>150||!emailRe.test(email)||email.length>254||message.length<10||message.length>2500||!intents.has(intent)||!locales.has(locale))return respond(400,'VALIDATION_FAILED');
  if(process.env.TURNSTILE_SECRET_KEY){
    const token=get('turnstileToken');if(!token)return respond(400,'BOT_VERIFICATION_REQUIRED');
    const form=new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:token});
    const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(5000)});
    if(!res.ok)return respond(503,'VERIFICATION_UNAVAILABLE');
    const result=await res.json() as {success?:boolean};if(!result.success)return respond(403,'BOT_VERIFICATION_FAILED');
  }
  const ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const now=Date.now();const hour=Math.floor(now/3600000);
  const fingerprint=createHash('sha256').update(`${process.env.LEADS_HASH_SECRET}:${ip}:${hour}`).digest('hex');
  const rateRef=db.collection('marketing_lead_rate_limits').doc(fingerprint);
  const leadRef=db.collection('marketing_leads').doc();
  try{
    await db.runTransaction(async tx=>{
      const limit=await tx.get(rateRef);
      const hits=limit.exists?(limit.data()?.hits as number||0):0;
      if(hits>=5)throw new Error('RATE_LIMITED');
      tx.set(rateRef,{hits:hits+1,expiresAt:new Date((hour+2)*3600000)}, {merge:true});
      tx.create(leadRef,{
        name,email:email.toLowerCase(),company,message,intent,locale,consentAt:FieldValue.serverTimestamp(),
        createdAt:FieldValue.serverTimestamp(),status:'new',source:'nixinx.com',schemaVersion:1,
        privacyNoticeVersion:'2026-11-18',internalNotification:{status:'PENDING',provider:'resend'},
      });
    });
    // The lead is already committed. A transport or audit error must not turn a saved lead into a failed submission.
    const notification=await notifyMarketingLead(leadRef.id,{
      LEAD_NOTIFICATIONS_ENABLED:process.env.LEAD_NOTIFICATIONS_ENABLED,
      LEAD_NOTIFY_EMAIL:process.env.LEAD_NOTIFY_EMAIL,
      LEAD_NOTIFICATION_DAILY_LIMIT:process.env.LEAD_NOTIFICATION_DAILY_LIMIT,
      RESEND_API_KEY:process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL:process.env.RESEND_FROM_EMAIL,
    },async limit=>{
      const day=Math.floor(Date.now()/86400000);
      const budgetRef=db.collection('marketing_lead_rate_limits').doc('notification-utc-day-'+day);
      return db.runTransaction(async tx=>{
        const snapshot=await tx.get(budgetRef);
        const hits=snapshot.exists?snapshot.data()?.hits:0;
        if(!Number.isInteger(hits)||hits<0||hits>=limit)return false;
        tx.set(budgetRef,{hits:hits+1,expiresAt:new Date((day+2)*86400000)},{merge:true});
        return true;
      });
    });
    await leadRef.update({internalNotification:{...notification,provider:'resend',checkedAt:FieldValue.serverTimestamp()}}).catch(()=>{});
    return NextResponse.json({ok:true},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(e){
    if(e instanceof Error&&e.message==='RATE_LIMITED')return respond(429,'RATE_LIMITED');
    console.error('Lead capture failed:',e instanceof Error?e.name:'Unknown');
    return respond(503,'SAVE_UNAVAILABLE');
  }
}

import {NextRequest,NextResponse} from 'next/server';
import {FieldValue} from 'firebase-admin/firestore';
import {getLeadDb} from '@/lib/firebase-admin';
import {MAX_BODY,RECIPIENT,verifySignature,parseEvent,sendAssessmentNotice} from '@/lib/assessment-event-notification';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const respond=(status:number,code:string)=>NextResponse.json({ok:status<300,code},{status,headers:{'Cache-Control':'no-store'}});
async function readBounded(request:NextRequest):Promise<Buffer|null>{
 if(Number(request.headers.get('content-length')||0)>MAX_BODY||!request.body)return null;
 const reader=request.body.getReader();const chunks:Buffer[]=[];let size=0;
 try{
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BODY){await reader.cancel();return null;}chunks.push(Buffer.from(part.value));}
  return Buffer.concat(chunks,size);
 }finally{reader.releaseLock();}
}
export async function POST(request:NextRequest){
 if(process.env.ASSESSMENT_NOTIFICATIONS_ENABLED!=='true')return respond(503,'DISABLED');
 const secret=process.env.ASSESSMENT_EVENT_SECRET||'',apiKey=process.env.RESEND_API_KEY||'',limitRaw=process.env.ASSESSMENT_NOTIFICATION_DAILY_LIMIT||'';
 const limit=Number(limitRaw);
 if(process.env.FIREBASE_PROJECT_ID!=='nixinx-bt'||!apiKey||!/^[a-f0-9]{64}$/.test(secret)||!/^\d{1,3}$/.test(limitRaw)||!Number.isInteger(limit)||limit<1||limit>100)return respond(503,'NOT_CONFIGURED');
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return respond(415,'INVALID_CONTENT_TYPE');
 let raw:Buffer|null;
 try{raw=await readBounded(request);}catch{return respond(400,'INVALID_BODY');}
 if(!raw)return respond(413,'INVALID_BODY_SIZE');
 const now=Date.now();
 if(!verifySignature(raw,request.headers.get('x-nixinx-timestamp'),request.headers.get('x-nixinx-signature'),secret,now))return respond(401,'INVALID_SIGNATURE');
 const event=parseEvent(raw,now);if(!event)return respond(400,'INVALID_EVENT');
 try{
  const db=getLeadDb();if(!db)return respond(503,'NOT_CONFIGURED');
  const collection=db.collection('marketing_assessment_notifications');
  const ref=collection.doc(event.eventId);
  const day=Math.floor(now/86400000),budget=collection.doc('budget-utc-day-'+day);
  const reservation=await db.runTransaction(async tx=>{
   const existing=await tx.get(ref);if(existing.exists)return 'DUPLICATE' as const;
   const daily=await tx.get(budget);const hits=daily.exists?daily.data()?.attempts:0;
   if(typeof hits!=='number'||!Number.isSafeInteger(hits)||hits<0)throw Error('INVALID_BUDGET');
   const metadata={...event,source:'zite-restaurant-assessment',recipient:RECIPIENT,provider:'resend',createdAt:FieldValue.serverTimestamp(),checkedAt:FieldValue.serverTimestamp()};
   if(hits>=limit){tx.create(ref,{...metadata,status:'RATE_LIMITED',attempts:0});return 'RATE_LIMITED' as const;}
   tx.set(budget,{attempts:hits+1,utcDay:day},{merge:true});
   tx.create(ref,{...metadata,status:'PENDING',attempts:1});return 'RESERVED' as const;
  });
  if(reservation!=='RESERVED')return respond(200,reservation);
  // External transport must never run inside the retried transaction.
  const result=await sendAssessmentNotice(event,apiKey);
  try{await ref.update({...result,checkedAt:FieldValue.serverTimestamp()});}catch{return respond(202,'AUDIT_PENDING');}
  return respond(202,result.status);
 }catch{return respond(503,'RESERVATION_UNAVAILABLE');}
}

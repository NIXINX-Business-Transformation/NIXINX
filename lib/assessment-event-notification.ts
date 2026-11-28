import {createHmac,timingSafeEqual} from 'node:crypto';
export const EVENT_TYPE='assessment.completed';
export const CONSULTATION_EVENT_TYPE='consultation.requested';
export const RECIPIENT='sales@nixinx.com';
export const MAX_BODY=2048;
export type AssessmentEvent={eventType:typeof EVENT_TYPE|typeof CONSULTATION_EVENT_TYPE;assessmentCode:string;eventId:string;occurredAt:string};
export type NotificationResult={status:'ACCEPTED'|'FAILED'|'UNKNOWN';providerId?:string};
export function verifySignature(raw:Buffer,timestamp:string|null,signature:string|null,secret:string,now:number):boolean{
 if(!/^[a-f0-9]{64}$/.test(secret)||!timestamp||!/^\d{10}$/.test(timestamp)||!signature||!/^[a-f0-9]{64}$/.test(signature))return false;
 if(Math.abs(Math.floor(now/1000)-Number(timestamp))>300)return false;
 const expected=createHmac('sha256',secret).update(timestamp+'.','utf8').update(raw).digest();
 return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}
export function parseEvent(raw:Buffer,now:number):AssessmentEvent|null{
 try{
  const o=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as Record<string,unknown>;
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!=='assessmentCode,eventId,eventType,occurredAt')return null;
  if((o.eventType!==EVENT_TYPE&&o.eventType!==CONSULTATION_EVENT_TYPE)||typeof o.assessmentCode!=='string'||!/^NX-[A-Za-z0-9]{8}$/.test(o.assessmentCode)||o.eventId!==(o.eventType===EVENT_TYPE?'assessment-completed:':'consultation-requested:')+o.assessmentCode||typeof o.occurredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o.occurredAt))return null;
  const at=Date.parse(o.occurredAt);
  if(!Number.isFinite(at)||new Date(at).toISOString()!==o.occurredAt||Math.abs(now-at)>300000)return null;
  return {eventType:o.eventType,assessmentCode:o.assessmentCode,eventId:o.eventId,occurredAt:o.occurredAt};
 }catch{return null;}
}
export async function sendAssessmentNotice(event:AssessmentEvent,apiKey:string,send:typeof fetch=fetch):Promise<NotificationResult>{
 try{
  const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'nixinx-zite/'+event.eventId},body:JSON.stringify({from:'NIXINX <notifications@nixinx.com>',to:[RECIPIENT],subject:event.eventType===CONSULTATION_EVENT_TYPE?'NIXINX | New consultation request':'NIXINX | New restaurant assessment',text:(event.eventType===CONSULTATION_EVENT_TYPE?'A restaurant has requested a consultation. This is not a scheduled appointment.':'A restaurant assessment has been completed.')+'\nType: '+event.eventType+'\nReference: '+event.assessmentCode+'\nReview the existing assessment through the authorized NIXINX Admin process.'}),signal:AbortSignal.timeout(1800)});
  if(!response.ok)return {status:response.status>=500||response.status===409?'UNKNOWN':'FAILED'};
  const body=await response.json() as {id?:unknown};
  return typeof body.id==='string'&&/^[a-f0-9-]{36}$/i.test(body.id)?{status:'ACCEPTED',providerId:body.id}:{status:'UNKNOWN'};
 }catch{return {status:'UNKNOWN'};}
}

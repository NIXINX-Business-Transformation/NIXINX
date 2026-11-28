// Server-only internal notification for the public lead intake. No customer email or message is transmitted.
type NotificationStatus='NOT_CONFIGURED'|'RATE_LIMITED'|'ACCEPTED'|'FAILED'|'UNKNOWN';
type Config={LEAD_NOTIFICATIONS_ENABLED?:string;LEAD_NOTIFY_EMAIL?:string;LEAD_NOTIFICATION_DAILY_LIMIT?:string;RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string};
export async function notifyMarketingLead(id:string,config:Config,reserve:(limit:number)=>Promise<boolean>,send:typeof fetch=fetch):Promise<{status:NotificationStatus;providerId?:string}>{
 const {LEAD_NOTIFICATIONS_ENABLED,LEAD_NOTIFY_EMAIL,LEAD_NOTIFICATION_DAILY_LIMIT,RESEND_API_KEY,RESEND_FROM_EMAIL}=config;
 if(LEAD_NOTIFICATIONS_ENABLED!=='true'||!RESEND_API_KEY||!RESEND_FROM_EMAIL||!LEAD_NOTIFY_EMAIL||!LEAD_NOTIFICATION_DAILY_LIMIT)return {status:'NOT_CONFIGURED'};
 if(!/^[a-zA-Z0-9_-]{16,128}$/.test(id)||!/^sales@nixinx\.com$/i.test(LEAD_NOTIFY_EMAIL)||!/^\d{1,3}$/.test(LEAD_NOTIFICATION_DAILY_LIMIT))return {status:'FAILED'};
 const limit=Number(LEAD_NOTIFICATION_DAILY_LIMIT);
 if(!Number.isInteger(limit)||limit<1||limit>100)return {status:'FAILED'};
 try{
  if(!await reserve(limit))return {status:'RATE_LIMITED'};
  const response=await send('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'nixinx-lead/'+id},body:JSON.stringify({from:RESEND_FROM_EMAIL,to:[LEAD_NOTIFY_EMAIL],subject:'NIXINX | New business inquiry',text:'A business inquiry has been registered in NIXINX.\nReference: '+id+'\nReview the existing marketing lead through the authorized internal process. No prospect details are included in this email.'}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {status:response.status>=500||response.status===409?'UNKNOWN':'FAILED'};
  const data=await response.json() as {id?:unknown};
  return typeof data.id==='string'&&/^[a-f0-9-]{36}$/i.test(data.id)?{status:'ACCEPTED',providerId:data.id}:{status:'UNKNOWN'};
 }catch{return {status:'UNKNOWN'};}
}

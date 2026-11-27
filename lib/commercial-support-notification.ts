// Optional, server-only internal notification. The commercial request is always the authority.
type NotificationStatus="NOT_CONFIGURED"|"ACCEPTED"|"FAILED"|"UNKNOWN";
type Config={SUPPORT_NOTIFICATIONS_ENABLED?:string;RESEND_API_KEY?:string;RESEND_FROM_EMAIL?:string;SUPPORT_NOTIFY_EMAIL?:string};
export async function notifySupportRequest(id:string,kind:string,config:Config,send:typeof fetch=fetch):Promise<{status:NotificationStatus;providerId?:string}>{
 const {SUPPORT_NOTIFICATIONS_ENABLED,RESEND_API_KEY,RESEND_FROM_EMAIL,SUPPORT_NOTIFY_EMAIL}=config;
 if(SUPPORT_NOTIFICATIONS_ENABLED!=="true"||!RESEND_API_KEY||!RESEND_FROM_EMAIL||!SUPPORT_NOTIFY_EMAIL)return {status:"NOT_CONFIGURED"};
 if(!/^[a-zA-Z0-9_-]{16,128}$/.test(id)||!["support","claim","cancellation","commercial"].includes(kind)||!/^support@nixinx\.com$/i.test(SUPPORT_NOTIFY_EMAIL))return {status:"FAILED"};
 try{
  const response=await send("https://api.resend.com/emails",{method:"POST",redirect:"error",headers:{"Authorization":"Bearer "+RESEND_API_KEY,"Content-Type":"application/json","Idempotency-Key":"nixinx-support/"+id},body:JSON.stringify({from:RESEND_FROM_EMAIL,to:[SUPPORT_NOTIFY_EMAIL],subject:"NIXINX | New customer request",text:"A customer request has been registered in NIXINX.\nType: "+kind+"\nReference: "+id+"\nReview the existing commercial support request through the authorized internal process. No customer details are included in this email."}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)return {status:response.status>=500||response.status===409? "UNKNOWN":"FAILED"};
  const data=await response.json() as {id?:unknown};
  return typeof data.id==="string"&&/^[a-f0-9-]{36}$/i.test(data.id)?{status:"ACCEPTED",providerId:data.id}:{status:"UNKNOWN"};
 }catch{return {status:"UNKNOWN"};}
}

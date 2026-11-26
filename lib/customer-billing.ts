import "server-only";
import {createHash} from "node:crypto";
import {FieldValue,type Firestore} from "firebase-admin/firestore";
type StripeCall=(path:string,form?:URLSearchParams,key?:string)=>Promise<any>;
const owner="nixinx-commercial-sandbox-v1";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
export async function billingCustomer(db:Firestore,uid:string,profile:FirebaseFirestore.DocumentData,stripe:StripeCall):Promise<string>{
 const ref=db.collection("commercial_billing_customers").doc(uid);
 const binding=await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(snap.exists)return snap.data()!;
  const record={uid,environment:"sandbox",status:"creating",startedAtMs:Date.now()};
  tx.create(ref,record);return record;
 });
 if(binding.uid!==uid||binding.environment!=="sandbox")throw Error("BILLING_BINDING_INVALID");
 if(typeof binding.stripeCustomerId==="string"){
  const c=await stripe("customers/"+encodeURIComponent(binding.stripeCustomerId));
  if(c.deleted||c.metadata?.nixinx_owner!==owner||c.metadata?.nixinx_uid_hash!==hash(uid))throw Error("BILLING_BINDING_INVALID");
  return c.id;
 }
 // Do not create a second customer after Stripe's idempotency retention window.
 if(typeof binding.startedAtMs!=="number"||Date.now()-binding.startedAtMs>20*3600000)throw Error("BILLING_RECONCILIATION_REQUIRED");
 const c=await stripe("customers",new URLSearchParams({name:String(profile.company),email:String(profile.email),"metadata[nixinx_owner]":owner,"metadata[nixinx_uid_hash]":hash(uid)}),"nx-customer-"+hash(uid));
 if(!/^cus_[A-Za-z0-9]+$/.test(c.id)||c.metadata?.nixinx_owner!==owner||c.metadata?.nixinx_uid_hash!==hash(uid))throw Error("BILLING_BINDING_INVALID");
 await db.runTransaction(async tx=>{
  const current=(await tx.get(ref)).data();
  if(!current||current.uid!==uid||(current.stripeCustomerId&&current.stripeCustomerId!==c.id))throw Error("BILLING_BINDING_INVALID");
  tx.update(ref,{stripeCustomerId:c.id,status:"active",updatedAt:FieldValue.serverTimestamp()});
 });
 return c.id;
}
function portalSafe(c:any){
 return c.active===true&&c.livemode===false&&c.metadata?.nixinx_owner===owner&&c.features?.invoice_history?.enabled===true&&c.features?.payment_method_update?.enabled===true&&c.features?.subscription_cancel?.enabled===false&&c.features?.subscription_update?.enabled===false&&c.login_page?.enabled===false;
}
export async function hostedBilling(stripe:StripeCall,customer:string,returnUrl:string){
 const page=await stripe("billing_portal/configurations?active=true&limit=100");
 if(page.has_more)throw Error("BILLING_RECONCILIATION_REQUIRED");
 const owned=page.data.filter((c:any)=>c.metadata?.nixinx_owner===owner);
 if(owned.length>1||owned.some((c:any)=>!portalSafe(c)))throw Error("BILLING_CONFIGURATION_REVIEW");
 const configuration=owned[0]??await stripe("billing_portal/configurations",new URLSearchParams({
  "business_profile[headline]":"NIXINX | Secure billing",
  "features[invoice_history][enabled]":"true",
  "features[payment_method_update][enabled]":"true",
  "features[customer_update][enabled]":"true",
  "features[customer_update][allowed_updates][0]":"address",
  "features[customer_update][allowed_updates][1]":"tax_id",
  "features[subscription_cancel][enabled]":"false",
  "features[subscription_update][enabled]":"false",
  "login_page[enabled]":"false",
  "metadata[nixinx_owner]":owner
 }),"nx-portal-config-sandbox-v1");
 if(!portalSafe(configuration))throw Error("BILLING_CONFIGURATION_REVIEW");
 const session=await stripe("billing_portal/sessions",new URLSearchParams({customer,configuration:configuration.id,return_url:returnUrl}));
 const url=new URL(session.url);
 if(url.protocol!=="https:"||url.hostname!=="billing.stripe.com"||session.customer!==customer)throw Error("BILLING_SESSION_INVALID");
 return url.href;
}
export async function billingSubscriptions(stripe:StripeCall,customer:string){
 const page=await stripe("subscriptions?"+new URLSearchParams({customer,status:"all",limit:"100"}));
 if(page.has_more)throw Error("BILLING_RECONCILIATION_REQUIRED");
 return page.data.map((s:any)=>{
  if(s.customer!==customer)throw Error("BILLING_BINDING_INVALID");
  return {id:s.id,status:s.status,periodEnd:typeof s.current_period_end==="number"?s.current_period_end*1000:null,cancelAtPeriodEnd:s.cancel_at_period_end===true};
 });
}

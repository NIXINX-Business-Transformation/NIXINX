import "server-only";
import {createHash} from "node:crypto";
import type {Firestore} from "firebase-admin/firestore";
type StripeRead=(path:string)=>Promise<any>;
const id=(v:unknown,prefix:string):v is string=>typeof v==="string"&&v.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(v);
const amount=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const validRefundStates=new Set(["pending","requires_action","succeeded","failed","canceled"]);
function documentUrl(raw:unknown):string|null{
 if(typeof raw!=="string")return null;
 try{const u=new URL(raw);return u.origin==="https://pay.stripe.com"&&!u.username&&!u.password&&u.pathname.startsWith("/credit_notes/")?u.href:null;}catch{return null;}
}
// Read-only complement to hosted invoices, not a financial ledger.
// Verify the existing projection, authenticated customer binding and Stripe
// ownership before exposing any native document or related refund.
export async function invoiceAdjustments(db:Firestore,uid:string,invoiceId:string,stripe:StripeRead){
 const [local,binding]=await Promise.all([db.collection("commercial_invoices").doc(invoiceId).get(),db.collection("commercial_billing_customers").doc(uid).get()]);
 if(!local.exists||local.get("uid")!==uid)throw Error("INVOICE_NOT_FOUND");
 const customer=binding.get("stripeCustomerId");
 if(binding.get("uid")!==uid||binding.get("environment")!=="sandbox"||!id(customer,"cus_")||local.get("customerId")!==customer||local.get("environment")!=="sandbox")throw Error("BILLING_BINDING_INVALID");
 const c=await stripe("customers/"+customer);
 if(c.livemode!==false||c.deleted||c.id!==customer||c.metadata?.nixinx_owner!=="nixinx-commercial-sandbox-v1"||c.metadata?.nixinx_uid_hash!==createHash("sha256").update(uid).digest("hex"))throw Error("BILLING_BINDING_INVALID");
 const invoice=await stripe("invoices/"+invoiceId);
 if(invoice.livemode!==false||invoice.object!=="invoice"||invoice.id!==invoiceId||invoice.customer!==customer||invoice.currency!=="cad")throw Error("BILLING_BINDING_INVALID");
 const page=await stripe("credit_notes?"+new URLSearchParams({invoice:invoiceId,customer,limit:"100","expand[]":"data.refund"}));
 if(page.object!=="list"||!Array.isArray(page.data)||page.has_more!==false)throw Error("BILLING_HISTORY_LIMIT");
 const seen=new Set<string>();
 const notes=page.data.map((n:any)=>{
  if(n.object!=="credit_note"||n.livemode!==false||!id(n.id,"cn_")||seen.has(n.id)||n.invoice!==invoiceId||n.customer!==customer||n.currency!=="cad"||!amount(n.amount)||typeof n.number!=="string"||!n.number||!["issued","void"].includes(n.status))throw Error("BILLING_BINDING_INVALID");
  seen.add(n.id);
  let refund:null|{amount:number;status:string}=null;
  if(n.refund!==null){
   const f=n.refund;
   if(!f||f.object!=="refund"||!id(f.id,"re_")||f.livemode===true||!id(invoice.payment_intent,"pi_")||f.payment_intent!==invoice.payment_intent||f.currency!=="cad"||!amount(f.amount)||f.amount>n.amount||!validRefundStates.has(f.status))throw Error("BILLING_RECONCILIATION_REQUIRED");
   refund={amount:f.amount,status:f.status};
  }
  return {id:n.id,number:n.number,amount:n.amount,status:n.status,pdf:documentUrl(n.pdf),refund};
 });
 return {notes};
}

import "server-only";
import {FieldValue,type Firestore} from "firebase-admin/firestore";
type StripeCall=(path:string,form?:URLSearchParams,key?:string)=>Promise<any>;
const types=new Set(["invoice.finalized","invoice.paid","invoice.payment_failed","invoice.payment_action_required","invoice.upcoming","invoice.voided","invoice.marked_uncollectible","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","customer.subscription.trial_will_end"]);
const valid=(v:unknown,prefix:string):v is string=>typeof v==="string"&&v.startsWith(prefix)&&/^[A-Za-z0-9_]+$/.test(v);
export async function recordBillingEvent(db:Firestore,event:any,stripe:StripeCall):Promise<boolean>{
 if(!types.has(event.type))return false;
 if(!valid(event.id,"evt_")||event.livemode!==false||!Number.isSafeInteger(event.created))throw Error("INVALID_BILLING_EVENT");
 const eventRef=db.collection("commercial_billing_events").doc(event.id);
 if((await eventRef.get()).exists)return true;
 const object=event.data?.object;
 const invoice=event.type.startsWith("invoice.");
 // Upcoming invoices have no persistent ID. Treat as an advisory, not a payable document.
 const upcoming=event.type==="invoice.upcoming";
 const id=object?.id;
 if(!upcoming&&!valid(id,invoice?"in_":"sub_"))throw Error("INVALID_BILLING_EVENT");
 const current=upcoming?object:await stripe((invoice?"invoices/":"subscriptions/")+encodeURIComponent(id));
 if(current.livemode!==false||!valid(current.customer,"cus_"))throw Error("INVALID_BILLING_EVENT");
 const owners=await db.collection("commercial_billing_customers").where("stripeCustomerId","==",current.customer).limit(2).get();
 if(owners.empty)return true; // Other Stripe integrations are outside NIXINX commercial ownership.
 if(owners.size!==1)throw Error("BILLING_BINDING_INVALID");
 const owner=owners.docs[0],uid=owner.id;
 if(owner.get("uid")!==uid||owner.get("environment")!=="sandbox")throw Error("BILLING_BINDING_INVALID");
 const ref=upcoming?null:db.collection(invoice?"commercial_invoices":"commercial_subscriptions").doc(id);
 await db.runTransaction(async tx=>{
  const reads=await Promise.all([tx.get(eventRef),tx.get(owner.ref),...(ref?[tx.get(ref)]:[])]);
  if(reads[0].exists)return;
  if(reads[1].get("stripeCustomerId")!==current.customer||reads[1].get("uid")!==uid)throw Error("BILLING_BINDING_INVALID");
  if(ref&&reads[2]?.exists&&reads[2].get("uid")!==uid)throw Error("BILLING_BINDING_INVALID");
  const record={uid,customerId:current.customer,environment:"sandbox",eventType:event.type,eventCreated:event.created,receivedAt:FieldValue.serverTimestamp()};
  tx.create(eventRef,{...record,objectId:upcoming?null:id});
  if(ref&&(!reads[2]?.exists||Number(reads[2].get("eventCreated")??0)<=event.created)){
   const fields=invoice?{status:current.status??null,amountDue:current.amount_due??0,amountPaid:current.amount_paid??0,currency:current.currency??null,number:current.number??null,subscriptionId:typeof current.subscription==="string"?current.subscription:null}:{status:current.status??null,periodEnd:current.current_period_end??null,cancelAtPeriodEnd:current.cancel_at_period_end===true};
   tx.set(ref,{...record,...fields},{merge:true});
  }
  const notices=new Set(["invoice.paid","invoice.payment_failed","invoice.payment_action_required","invoice.upcoming","customer.subscription.deleted","customer.subscription.trial_will_end"]);
  if(notices.has(event.type)){
   tx.create(db.collection("commercial_notifications").doc(event.id),{uid,type:event.type,objectId:upcoming?null:id,read:false,createdAt:FieldValue.serverTimestamp()});
  }
 });
 return true;
}

export function isConfirmedCommercialPayment(status:unknown):boolean{return status==="paid_test"||status==="paid_review_test";}
export function reservedApplicationIds(orders:ReadonlyArray<{status:unknown;applicationIds:unknown}>):Set<string>{
 return new Set(orders.filter(o=>isConfirmedCommercialPayment(o.status)||o.status==="pending_test").flatMap(o=>Array.isArray(o.applicationIds)?o.applicationIds.filter((id):id is string=>typeof id==="string"):[]));
}
export function availableCommercialItems<T extends {id:string}>(items:readonly T[],orders:ReadonlyArray<{status:unknown;applicationIds:unknown}>):T[]{
 const reserved=reservedApplicationIds(orders);return items.filter(item=>!reserved.has(item.id));
}

export function resumableCommercialOrder(order:Record<string,any>,uid:string,consentVersion:string):boolean{
 return order.uid===uid&&order.status==="pending_test"&&order.billingMode==="subscription"&&order.currency==="cad"&&order.terms?.version===consentVersion&&order.terms?.acceptedBy===uid&&typeof order.stripeSessionId==="string"&&/^cs_test_[A-Za-z0-9_]+$/.test(order.stripeSessionId)&&typeof order.stripeCustomerId==="string"&&/^cus_[A-Za-z0-9]+$/.test(order.stripeCustomerId)&&Number.isSafeInteger(order.subtotal)&&order.subtotal>0;
}
export function openCheckoutUrl(session:Record<string,any>,order:Record<string,any>,orderId:string):string|null{
 if(session.object!=="checkout.session"||session.livemode!==false||session.id!==order.stripeSessionId||session.status!=="open"||session.payment_status!=="unpaid"||session.mode!==order.billingMode||session.currency!==order.currency||session.amount_subtotal!==order.subtotal||session.automatic_tax?.enabled!==true||session.customer!==order.stripeCustomerId||session.client_reference_id!==orderId||session.metadata?.orderId!==orderId||typeof session.url!=="string")return null;
 try{const url=new URL(session.url);return url.origin==="https://checkout.stripe.com"&&!url.username&&!url.password?url.href:null;}catch{return null;}
}

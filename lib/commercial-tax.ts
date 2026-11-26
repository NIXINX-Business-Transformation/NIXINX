import "server-only";
import {countryCode,provinceCode} from "./commercial-geography";
type StripeCall=(path:string,form?:URLSearchParams,key?:string)=>Promise<any>;
export function commercialTaxPolicy(profile:Record<string,unknown>|null){
 const country=countryCode(profile?.country),province=provinceCode(profile?.province);
 const postal=String(profile?.postalCode??"").trim().toUpperCase().replace(/\s/g,"");
 const city=String(profile?.city??"").trim(),line1=String(profile?.address1??"").trim();
 return country==="CA"&&province&&/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)&&city&&line1?{country,province,postal,city,line1}:null;
}
export async function quoteTax(stripe:StripeCall,policy:NonNullable<ReturnType<typeof commercialTaxPolicy>>,items:{id:string;amount:number;priceId:string}[]){
 const form=new URLSearchParams({currency:"cad","customer_details[address][country]":policy.country,"customer_details[address][state]":policy.province,"customer_details[address][postal_code]":policy.postal,"customer_details[address][city]":policy.city,"customer_details[address][line1]":policy.line1,"customer_details[address_source]":"billing"});
 items.forEach((item,i)=>{form.set("line_items["+i+"][amount]",String(item.amount));form.set("line_items["+i+"][reference]",item.id);form.set("line_items["+i+"][tax_behavior]","exclusive");form.set("line_items["+i+"][tax_code]","txcd_10103001");});
 const q=await stripe("tax/calculations",form);
 const subtotal=items.reduce((n,i)=>n+i.amount,0);
 if(q.currency!=="cad"||!Number.isSafeInteger(q.tax_amount_exclusive)||q.tax_amount_exclusive<0||q.amount_total!==subtotal+q.tax_amount_exclusive||q.tax_amount_inclusive!==0)throw Error("TAX_AMOUNT_MISMATCH");
 return {subtotal,tax:q.tax_amount_exclusive,total:q.amount_total,lines:(q.tax_breakdown??[]).map((r:any)=>({label:r.tax_rate_details?.tax_type??"tax",percentage:r.tax_rate_details?.percentage_decimal??null,amount:r.amount}))};
}

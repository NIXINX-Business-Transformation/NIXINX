import "server-only";
import {createHash} from "node:crypto";

const control="https://controlde.nixinx.org";
const owner="nixinx-commercial-sandbox-v1";
type Published={id:string;name:string;amount:number};
type Price={id:string;active:boolean;livemode:boolean;unit_amount:number;currency:string;type:string;recurring?:{interval:string;interval_count:number};product:string};
type Product={id:string;name:string;active:boolean;livemode:boolean;metadata:Record<string,string>;default_price:Price|string|null};
const productId=(id:string)=>"nixinx_"+createHash("sha256").update(id).digest("hex").slice(0,40);

export async function readPublished(token?:string):Promise<Published[]>{
 const res=await fetch(control+"/api/commercial/catalog",{method:token?"POST":"GET",headers:token?{Authorization:"Bearer "+token}:undefined,cache:"no-store",signal:AbortSignal.timeout(10000),redirect:"error"});
 if(!res.ok)throw Error(res.status===401||res.status===403?"STAFF_REQUIRED":"CATALOG_UNAVAILABLE");
 const payload=await res.json();
 if(!Array.isArray(payload.items)||payload.items.length>50)throw Error("CATALOG_LIMIT");
 const seen=new Set<string>();
 return payload.items.map((v:unknown)=>{
  if(!v||typeof v!=="object"||!("id" in v)||!("name" in v)||typeof v.id!=="string"||!/^[a-z][a-z0-9-]{1,38}$/.test(v.id)||typeof v.name!=="string"||!v.name.trim()||!("amount" in v)||typeof v.amount!=="number"||!Number.isSafeInteger(v.amount)||v.amount<50||v.amount>99999999||seen.has(v.id))throw Error("CATALOG_INVALID");
  seen.add(v.id);return{id:v.id,name:v.name,amount:v.amount};
 });
}
async function request(path:string,form?:URLSearchParams,key?:string){
 const secret=process.env.STRIPE_COMMERCIAL_SECRET_KEY;
 if(!secret?.startsWith("rk_test_"))throw Error("SANDBOX_NOT_CONFIGURED");
 const headers:Record<string,string>={Authorization:"Bearer "+secret,"Stripe-Version":"2024-06-20"};
 if(form)headers["Content-Type"]="application/x-www-form-urlencoded";
 if(key)headers["Idempotency-Key"]=key;
 const res=await fetch("https://api.stripe.com/v1/"+path,{method:form?"POST":"GET",headers,body:form,cache:"no-store",signal:AbortSignal.timeout(10000),redirect:"error"});
 if(!res.ok)throw Error("STRIPE_CATALOG_UNAVAILABLE");
 const data=await res.json();
 if(data.object==="list"?(!Array.isArray(data.data)||data.data.some((v:{livemode?:boolean})=>v.livemode!==false)):data.livemode!==false)throw Error("LIVE_REJECTED");
 return data;
}
async function listProducts():Promise<Product[]>{
 let cursor="";const rows:Product[]=[];
 for(let i=0;i<5;i++){
  const q=new URLSearchParams({limit:"100","expand[]":"data.default_price"});
  if(cursor)q.set("starting_after",cursor);
  const page=await request("products?"+q);
  rows.push(...page.data);
  if(!page.has_more)return rows;
  cursor=page.data.at(-1)?.id;if(!cursor)throw Error("CATALOG_INVALID");
 }
 throw Error("STRIPE_CATALOG_LIMIT");
}
function managed(p:Product){return p.metadata?.nixinx_catalog===owner&&typeof p.metadata?.app_id==="string"&&p.id===productId(p.metadata.app_id);}
function validPrice(p:Product,amount:number):p is Product&{default_price:Price}{
 const v=p.default_price;return !!v&&typeof v==="object"&&v.active===true&&v.livemode===false&&v.unit_amount===amount&&v.currency==="cad"&&v.type==="recurring"&&v.recurring?.interval==="month"&&v.recurring.interval_count===1&&v.product===p.id;
}
export async function commercialCatalog(){
 const apps=await readPublished();if(!apps.length)return [];
 const products=await listProducts();
 return apps.flatMap(a=>{
  const p=products.find(p=>p.id===productId(a.id)&&managed(p)&&p.active&&p.name===a.name);
  return p&&validPrice(p,a.amount)?[{id:a.id,name:a.name,amount:a.amount,currency:"cad",interval:"month" as const,priceId:p.default_price.id}]:[];
 });
}
export async function reconcileStripe(token:string){
 const apps=await readPublished(token);
 const products=await listProducts();
 // Validate all existing managed bindings before writing any changes.
 for(const a of apps){
  const p=products.find(p=>p.id===productId(a.id));
  if(p&&!managed(p))throw Error("STRIPE_PRODUCT_CONFLICT");
 }
 let archived=0;
 for(const a of apps){
  const id=productId(a.id),existing=products.find(p=>p.id===id);
  if(!existing){
   const form=new URLSearchParams({id,name:a.name,active:"true","metadata[nixinx_catalog]":owner,"metadata[app_id]":a.id,"default_price_data[currency]":"cad","default_price_data[unit_amount]":String(a.amount),"default_price_data[recurring][interval]":"month"});
   await request("products",form,"nx-catalog-create-"+id);
   }else{
   const form=new URLSearchParams({active:"true",name:a.name});
   if(!validPrice(existing,a.amount)){
    const query=new URLSearchParams({product:id,active:"true",limit:"100"});
    const page=await request("prices?"+query);
    if(page.has_more)throw Error("STRIPE_CATALOG_LIMIT");
    const match=page.data.find((p:Price)=>p.livemode===false&&p.active&&p.unit_amount===a.amount&&p.currency==="cad"&&p.type==="recurring"&&p.recurring?.interval==="month"&&p.recurring.interval_count===1&&p.product===id);
    const price=match??await request("prices",new URLSearchParams({product:id,currency:"cad",unit_amount:String(a.amount),"recurring[interval]":"month"}),"nx-price-month-"+id+"-"+a.amount);
    form.set("default_price",price.id);
   }
   if(!existing.active||existing.name!==a.name||!validPrice(existing,a.amount))await request("products/"+encodeURIComponent(id),form);
  }
 }
 for(const p of products){
  if(managed(p)&&p.active&&!apps.some(a=>a.id===p.metadata.app_id)){
   await request("products/"+encodeURIComponent(p.id),new URLSearchParams({active:"false"}));archived++;
  }
 }
 const after=await listProducts();
 if(apps.some(a=>!after.some(p=>p.id===productId(a.id)&&managed(p)&&p.active&&p.name===a.name&&validPrice(p,a.amount)))||after.some(p=>managed(p)&&p.active&&!apps.some(a=>a.id===p.metadata.app_id)))throw Error("STRIPE_READBACK_FAILED");
 const latest=await readPublished(token);
 if(JSON.stringify(latest)!==JSON.stringify(apps))throw Error("CATALOG_CHANGED_RETRY");
 return {published:apps.length,archived};
}

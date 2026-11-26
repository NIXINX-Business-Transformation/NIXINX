import "server-only";
type StripeCall=(path:string,form?:URLSearchParams,key?:string)=>Promise<any>;
type Rate={label:string;percentage:number};
const gst:Rate={label:"GST",percentage:5};
const hst=(percentage:number):Rate=>({label:"HST",percentage});
const jurisdictions:Record<string,{names:string[];rates:Rate[]}>={
 AB:{names:["alberta"],rates:[gst]},BC:{names:["british columbia","colombie-britannique"],rates:[gst,{label:"PST",percentage:7}]},
 MB:{names:["manitoba"],rates:[gst,{label:"RST",percentage:7}]},NB:{names:["new brunswick","nouveau-brunswick"],rates:[hst(15)]},
 NL:{names:["newfoundland and labrador","terre-neuve-et-labrador"],rates:[hst(15)]},NS:{names:["nova scotia","nouvelle-ecosse"],rates:[hst(14)]},
 ON:{names:["ontario"],rates:[hst(13)]},PE:{names:["prince edward island","ile-du-prince-edouard"],rates:[hst(15)]},
 QC:{names:["quebec"],rates:[gst,{label:"QST",percentage:9.975}]},SK:{names:["saskatchewan"],rates:[gst,{label:"PST",percentage:6}]},
 NT:{names:["northwest territories","territoires du nord-ouest"],rates:[gst]},NU:{names:["nunavut"],rates:[gst]},YT:{names:["yukon"],rates:[gst]}
};
const normalize=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
// Standard taxable single-jurisdiction SaaS simulation only; not a live registration decision.
export function commercialTaxPolicy(profile:Record<string,unknown>|null){
 if(!["ca","canada"].includes(normalize(profile?.country)))return null;
 const province=normalize(profile?.province);
 const code=Object.keys(jurisdictions).find(k=>k.toLowerCase()===province||jurisdictions[k].names.includes(province));
 return code?{country:"CA",province:code,rates:jurisdictions[code].rates,version:"CA-2026-11-26"}:null;
}
export async function canadaTaxRates(stripe:StripeCall,policy:NonNullable<ReturnType<typeof commercialTaxPolicy>>):Promise<string[]>{
 const page=await stripe("tax_rates?active=true&limit=100");
 if(page.has_more)throw Error("TAX_CONFIGURATION_REVIEW");
 const ids:string[]=[];
 for(const tax of policy.rates){
  const owner=policy.province==="ON"&&tax.label==="HST"?"nixinx-commercial-ontario-hst-13-v1":"nixinx-commercial-ca-"+policy.province.toLowerCase()+"-"+tax.label.toLowerCase()+"-"+tax.percentage+"-v1";
  const matches=page.data.filter((v:any)=>v.metadata?.nixinx_owner===owner);
  const valid=(v:any)=>v.active===true&&v.livemode===false&&v.inclusive===false&&v.percentage===tax.percentage&&v.country==="CA"&&v.state===policy.province&&v.display_name===tax.label&&v.metadata?.nixinx_owner===owner&&/^txr_[A-Za-z0-9]+$/.test(v.id);
  if(matches.length>1||matches.some((v:any)=>!valid(v)))throw Error("TAX_CONFIGURATION_REVIEW");
  const rate=matches[0]??await stripe("tax_rates",new URLSearchParams({display_name:tax.label,percentage:String(tax.percentage),inclusive:"false",country:"CA",state:policy.province,jurisdiction:policy.province+", Canada","metadata[nixinx_owner]":owner}),owner);
  if(!valid(rate))throw Error("TAX_CONFIGURATION_REVIEW");
  ids.push(rate.id);
 }
 return ids;
}

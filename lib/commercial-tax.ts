import "server-only";
type StripeCall=(path:string,form?:URLSearchParams,key?:string)=>Promise<any>;
// Sandbox policy only. Other jurisdictions fail closed until configured.
export function commercialTaxPolicy(profile:Record<string,unknown>|null){
 const country=String(profile?.country??"").trim().toLowerCase();
 const province=String(profile?.province??"").trim().toLowerCase();
 return ["ca","canada"].includes(country)&&["on","ontario"].includes(province)
  ?{country:"CA",province:"ON",label:"HST",percentage:13}:null;
}
export async function ontarioTaxRate(stripe:StripeCall):Promise<string>{
 const owner="nixinx-commercial-ontario-hst-13-v1";
 const page=await stripe("tax_rates?active=true&limit=100");
 if(page.has_more)throw Error("TAX_CONFIGURATION_REVIEW");
 const matches=page.data.filter((v:any)=>v.metadata?.nixinx_owner===owner);
 const valid=(v:any)=>v.active===true&&v.livemode===false&&v.inclusive===false&&v.percentage===13&&v.country==="CA"&&v.state==="ON"&&v.display_name==="HST"&&v.metadata?.nixinx_owner===owner&&/^txr_[A-Za-z0-9]+$/.test(v.id);
 if(matches.length>1||matches.some((v:any)=>!valid(v)))throw Error("TAX_CONFIGURATION_REVIEW");
 const rate=matches[0]??await stripe("tax_rates",new URLSearchParams({display_name:"HST",percentage:"13",inclusive:"false",country:"CA",state:"ON",jurisdiction:"Ontario, Canada","metadata[nixinx_owner]":owner}),"nx-ontario-hst-13-v1");
 if(!valid(rate))throw Error("TAX_CONFIGURATION_REVIEW");
 return rate.id;
}

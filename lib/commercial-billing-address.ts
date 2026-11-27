import {countryCode,provinceCode} from "./commercial-geography";
// Exact equality of the server-derived tax address snapshot; do not infer
// equivalence between different street spellings or change the tax policy.
const fields=["country","province","postal","city","line1"] as const;
export function sameDeclaredTaxAddress(left:unknown,right:unknown):boolean{
 if(!left||!right||typeof left!=="object"||typeof right!=="object"||Array.isArray(left)||Array.isArray(right))return false;
 const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
 if(Object.keys(a).length!==fields.length||Object.keys(b).length!==fields.length)return false;
 return fields.every(k=>typeof a[k]==="string"&&typeof b[k]==="string"&&a[k]!==""&&a[k]===b[k]);
}
export function confirmedDeclaredTaxAddress(confirmed:unknown,submitted:unknown,current:unknown):boolean{
 return confirmed===true&&sameDeclaredTaxAddress(submitted,current);
}

export const fiscalProfileFields=["address1","address2","city","province","postalCode","country"] as const;
const clean=(v:unknown)=>typeof v==="string"?v.trim():"";
export function fiscalProfileAddress(profile:object|null|undefined){
 const p=(profile??{}) as Record<string,unknown>;
 return {address1:clean(p.address1),address2:clean(p.address2),city:clean(p.city),province:provinceCode(p.province),postalCode:clean(p.postalCode).toUpperCase().replace(/\s/g,""),country:countryCode(p.country)};
}
export function changedFiscalProfileFields(previous:object|null|undefined,next:object|null|undefined){
 const a=fiscalProfileAddress(previous),b=fiscalProfileAddress(next);
 return fiscalProfileFields.filter(k=>a[k]!==b[k]);
}
export function confirmedFiscalProfileChange(confirmed:unknown,submitted:unknown,next:object){
 if(confirmed!==true||!submitted||typeof submitted!=="object"||Array.isArray(submitted))return false;
 const b=fiscalProfileAddress(next),a=submitted as Record<string,unknown>;
 return Object.keys(a).length===fiscalProfileFields.length&&fiscalProfileFields.every(k=>a[k]===b[k]);
}
export function profileRevisionMatches(submitted:unknown,current:string){return typeof submitted==="string"&&/^[a-f0-9]{64}$/.test(submitted)&&submitted===current;}

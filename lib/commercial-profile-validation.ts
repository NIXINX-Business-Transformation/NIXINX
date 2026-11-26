import {countryCode,provinceCode} from "./commercial-geography";
export const profileLimits={name:100,company:150,legalName:150,contactEmail:254,phone:40,address1:150,address2:150,city:100,province:100,postalCode:24,country:80,taxType:60,taxId:80} as const;
export type ProfileField=keyof typeof profileLimits;
export type ProfileErrors=Partial<Record<ProfileField,"required"|"length"|"format"|"jurisdiction">>;
export function normalizeCanadianPostal(value:string){const compact=value.trim().toUpperCase().replace(/\s+/g,"");return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(compact)?compact.slice(0,3)+" "+compact.slice(3):null;}
export function validCanadianCity(value:string){return /\p{L}/u.test(value)&&/^[\p{L}\p{M}\p{N} .’'\-]+$/u.test(value)&&!/\p{C}/u.test(value);}
export function validContactPhone(value:string){if(!/^\+?[0-9(). \-]+$/.test(value))return false;const digits=value.replace(/\D/g,"");return digits.length>=10&&digits.length<=15;}
export function validateCommercialProfile(input:Record<string,unknown>,complete=false):ProfileErrors{
 const errors:ProfileErrors={};
 for(const [field,max] of Object.entries(profileLimits) as [ProfileField,number][]){
  const raw=input[field];
  if(raw===undefined&&!complete&&field!=="name"&&field!=="company"&&field!=="legalName")continue;
  if(raw!==undefined&&typeof raw!=="string"){errors[field]="format";continue;}
  const v=typeof raw==="string"?raw.trim():"";
  if(!v){if(field==="name"||field==="company"||field==="legalName"||(complete&&["country","province","address1","city","postalCode"].includes(field)))errors[field]="required";continue;}
  if(v.length>max){errors[field]="length";continue;}
  if(/[\p{Cc}\p{Cf}]/u.test(v)){errors[field]="format";continue;}
  if((field==="name"||field==="company"||field==="legalName")&&v.length<2)errors[field]="length";
  else if(field==="name"&&!/\p{L}/u.test(v))errors[field]="format";
  else if(field==="contactEmail"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))errors[field]="format";
  else if(field==="phone"&&!validContactPhone(v))errors[field]="format";
  else if(field==="city"&&!validCanadianCity(v))errors[field]="format";
  else if(field==="postalCode"&&!normalizeCanadianPostal(v))errors[field]="format";
  else if(field==="country"&&!countryCode(v))errors[field]="jurisdiction";
  else if(field==="province"&&!provinceCode(v))errors[field]="jurisdiction";
  else if(field==="address1"&&!/\p{L}/u.test(v))errors[field]="format";
 }
 if(!!String(input.taxType??"").trim()!==!!String(input.taxId??"").trim()){errors.taxType=errors.taxType??"required";errors.taxId=errors.taxId??"required";}
 return errors;
}

// The commercial display name is not a fallback for the legal billing identity.
export function legalBillingName(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const name=value.trim();return name.length>=2&&name.length<=profileLimits.legalName&&!/[\p{Cc}\p{Cf}]/u.test(name)?name:null;
}

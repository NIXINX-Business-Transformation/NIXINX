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

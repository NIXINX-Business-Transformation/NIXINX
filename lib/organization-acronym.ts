// Keep legacy organization keys immutable. Apply this policy only to new identities.
export const NEW_ORGANIZATION_ACRONYM_PATTERN="[a-z][a-z0-9]{1,34}";
export function validNewOrganizationAcronym(value:unknown):value is string{
 return typeof value==="string"&&value.length>=2&&value.length<=35&&/^[a-z]/.test(value)&&!/[^a-z0-9]/.test(value);
}
export function validOrganizationAcronymDraft(value:string):boolean{
 return value===""||(value.length<=35&&/^[a-z]/.test(value)&&!/[^a-z0-9]/.test(value));
}

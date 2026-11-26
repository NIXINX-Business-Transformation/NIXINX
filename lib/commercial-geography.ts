export const provinces=[
 ["AB","Alberta","Alberta"],["BC","British Columbia","Colombie-Britannique"],["MB","Manitoba","Manitoba"],["NB","New Brunswick","Nouveau-Brunswick"],["NL","Newfoundland and Labrador","Terre-Neuve-et-Labrador"],["NS","Nova Scotia","Nouvelle-Écosse"],["NT","Northwest Territories","Territoires du Nord-Ouest"],["NU","Nunavut","Nunavut"],["ON","Ontario","Ontario"],["PE","Prince Edward Island","Île-du-Prince-Édouard"],["QC","Quebec","Québec"],["SK","Saskatchewan","Saskatchewan"],["YT","Yukon","Yukon"]
] as const;
const normalize=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export const provinceCode=(v:unknown)=>provinces.find(p=>p.some(n=>normalize(n)===normalize(v)))?.[0]??"";
export const countryCode=(v:unknown)=>["ca","canada"].includes(normalize(v))?"CA":"";

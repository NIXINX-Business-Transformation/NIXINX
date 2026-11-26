export function reservedApplicationIds(orders:ReadonlyArray<{status:unknown;applicationIds:unknown}>):Set<string>{
 return new Set(orders.filter(o=>o.status==="paid_test"||o.status==="pending_test").flatMap(o=>Array.isArray(o.applicationIds)?o.applicationIds.filter((id):id is string=>typeof id==="string"):[]));
}
export function availableCommercialItems<T extends {id:string}>(items:readonly T[],orders:ReadonlyArray<{status:unknown;applicationIds:unknown}>):T[]{
 const reserved=reservedApplicationIds(orders);return items.filter(item=>!reserved.has(item.id));
}

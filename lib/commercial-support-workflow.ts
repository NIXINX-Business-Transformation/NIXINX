export const kinds=['support','claim','cancellation','commercial'];
export const statuses=['OPEN','IN_PROGRESS','RESOLVED','CLOSED'];
const transitions:Record<string,string[]>={OPEN:['OPEN','IN_PROGRESS','RESOLVED'],IN_PROGRESS:['IN_PROGRESS','RESOLVED'],RESOLVED:['RESOLVED','IN_PROGRESS','CLOSED'],CLOSED:[]};
export const validRef=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{16,128}$/.test(v);
export function change(r:Record<string,any>,b:Record<string,any>,actor:{uid:string;role:string},at:number){
 if(!actor.uid||!['admin','superadmin'].includes(actor.role))throw Error('STAFF_REQUIRED');
 const revision=r.workflowRevision??0;
 if(!Number.isSafeInteger(revision)||revision!==b.revision)throw Error('SUPPORT_STALE');
 if(!transitions[r.status]?.includes(b.status))throw Error('SUPPORT_TRANSITION_INVALID');
 if(b.reply!==undefined&&typeof b.reply!=='string')throw Error('SUPPORT_REPLY_INVALID');
 const reply=(b.reply??'').trim();
 if(reply.length>2000||(!reply&&(b.status===r.status||b.status==='RESOLVED')))throw Error('SUPPORT_REPLY_INVALID');
 const history=r.workflowHistory??[];
 if(!Array.isArray(history)||history.length>=100)throw Error('SUPPORT_HISTORY_LIMIT');
 return {status:b.status,workflowRevision:revision+1,assignedTo:actor.uid,workflowHistory:[...history,{actor:actor.uid,role:actor.role,at,from:r.status,to:b.status,reply:reply||null}]};
}
export function customerView(id:string,r:Record<string,any>){
 return {id,kind:r.kind,subject:r.subject,status:r.status,appId:r.appId??null,date:r.createdAt?.toMillis?.()??null,replies:(Array.isArray(r.workflowHistory)?r.workflowHistory:[]).filter(e=>typeof e.reply==='string'&&e.reply.length>0).map(e=>({date:e.at,text:e.reply}))};
}

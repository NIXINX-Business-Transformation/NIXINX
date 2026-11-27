import {NextRequest,NextResponse} from 'next/server';
import {FieldValue} from 'firebase-admin/firestore';
import {change,customerView,kinds,statuses,validRef} from './commercial-support-workflow';
const result=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(error:string,status=400)=>result({error},status);
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const day=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export async function staffSupport(req:NextRequest,db:FirebaseFirestore.Firestore){
 if(process.env.FIREBASE_PROJECT_ID!=='nixinx-bt'||req.nextUrl.origin!=='https://nixinx.com'||process.env.VERCEL_ENV!=='production')return fail('SUPPORT_UNAVAILABLE',503);
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length>8192)return fail('STAFF_REQUIRED',401);
 const gate=await fetch('https://controlde.nixinx.org/api/commercial/support-authority',{method:'POST',headers:{Authorization:auth},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!gate.ok)return fail('STAFF_REQUIRED',gate.status===401?401:403);
 const actor=await gate.json();
 if(actor.authorized!==true||typeof actor.uid!=='string'||!actor.uid||!['admin','superadmin'].includes(actor.role))return fail('STAFF_REQUIRED',403);
 const raw=await req.text();if(raw.length>10000)return fail('REQUEST_TOO_LARGE',413);
 const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))return fail('INVALID_REQUEST');
 const col=db.collection('commercial_support_requests');
 if(b.operation==='update'){
  if(!validRef(b.id))return fail('INVALID_REQUEST');
  try{return result(await db.runTransaction(async tx=>{
   const ref=col.doc(b.id),snap=await tx.get(ref);if(!snap.exists)throw Error('SUPPORT_NOT_FOUND');
   const update=change(snap.data()!,b,actor,Date.now());
   tx.update(ref,{...update,updatedAt:FieldValue.serverTimestamp()});
   return {status:update.status,revision:update.workflowRevision};
  }));}catch(e){const code=e instanceof Error?e.message:'';
   if(code==='SUPPORT_NOT_FOUND')return fail(code,404);
   if(['SUPPORT_STALE','SUPPORT_TRANSITION_INVALID','SUPPORT_REPLY_INVALID','SUPPORT_HISTORY_LIMIT'].includes(code))return fail(code,409);throw e;}
 }
 if(b.operation==='detail'){
  if(!validRef(b.id))return fail('INVALID_REQUEST');
  const snap=await col.doc(b.id).get();
  if(!snap.exists)return fail('SUPPORT_NOT_FOUND',404);
  const r=snap.data()!;
  return result({id:snap.id,status:r.status,revision:r.workflowRevision??0,history:Array.isArray(r.workflowHistory)?r.workflowHistory:[],assignedTo:r.assignedTo??null});
 }
 if(b.operation!=='list')return fail('INVALID_REQUEST');
 const kind=str(b.kind),status=str(b.status),customer=str(b.customer).toLowerCase(),from=str(b.from),to=str(b.to);
 if(customer.length>160||(kind&&!kinds.includes(kind))||(status&&!statuses.includes(status))||(from&&!day(from))||(to&&!day(to))||(from&&to&&from>to))return fail('INVALID_FILTER');
 let query:FirebaseFirestore.Query=col.orderBy('createdAt','desc');
 if(b.cursor){if(!validRef(b.cursor))return fail('INVALID_FILTER');const cursor=await col.doc(b.cursor).get();if(!cursor.exists)return fail('INVALID_FILTER');query=query.startAfter(cursor);}
 const snap=await query.limit(26).get(),docs=snap.docs.slice(0,25);
 const uids=[...new Set(docs.map(d=>d.get('uid')).filter((v):v is string=>typeof v==='string'&&v.length>0&&v.length<=128&&!v.includes('/')))];
 const profiles=new Map<string,FirebaseFirestore.DocumentSnapshot>();
 if(uids.length){const values=await db.getAll(...uids.map(uid=>db.collection('commercial_profiles').doc(uid)));values.forEach(v=>profiles.set(v.id,v));}
 const items=docs.flatMap(d=>{const r=d.data(),p=profiles.get(r.uid),v=customerView(d.id,r,false),name=str(p?.get('company')),acronym=str(p?.get('acronym')),email=str(r.email);
 if((customer&&![name,acronym,email,r.uid].some(x=>typeof x==='string'&&x.toLowerCase().includes(customer)))||(kind&&r.kind!==kind)||(status&&r.status!==status)||(from&&(v.date===null||v.date<Date.parse(from+'T00:00:00Z')))||(to&&(v.date===null||v.date>=Date.parse(to+'T00:00:00Z')+86400000)))return [];
 return [{...v,customer:name||email,acronym,description:str(r.description),revision:r.workflowRevision??0,assignedTo:r.assignedTo??null,historyCount:Array.isArray(r.workflowHistory)?r.workflowHistory.length:0,notification:r.internalNotification?.status??null}];});
 return result({items,cursor:snap.size>25?docs.at(-1)!.id:null,scanned:docs.length});
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const copy={
 en:{title:'Customer portal',back:'Back to NIXINX',login:'Sign in',register:'Create account',email:'Email',password:'Password',verify:'Check your email, verify your address and sign in again.',reset:'Reset password',resetSent:'If the account exists, a reset email will be sent.',name:'Your name',company:'Company name',acronym:'Permanent acronym',save:'Save profile',catalog:'Available applications',none:'No published applications available yet.',pay:'Pay in Stripe sandbox',logout:'Sign out',test:'Test mode only. No real charge or infrastructure creation.',saved:'Profile saved.',paid:'Test payment confirmed. Provisioning request recorded.',pending:'Payment not yet confirmed.',loading:'Loading…',error:'Unable to complete request',domain:'Proposed subdomain'},
 es:{title:'Portal del cliente',back:'Volver a NIXINX',login:'Iniciar sesión',register:'Crear cuenta',email:'Correo',password:'Contraseña',verify:'Verifica tu correo y vuelve a iniciar sesión.',reset:'Restablecer contraseña',resetSent:'Si la cuenta existe, recibirás un correo.',name:'Tu nombre',company:'Nombre de la empresa',acronym:'Acrónimo permanente',save:'Guardar perfil',catalog:'Aplicaciones disponibles',none:'Todavía no hay aplicaciones publicadas disponibles.',pay:'Pagar en Stripe sandbox',logout:'Cerrar sesión',test:'Solo pruebas. No hay cobro real ni creación de infraestructura.',saved:'Perfil guardado.',paid:'Pago de prueba confirmado. Solicitud de aprovisionamiento registrada.',pending:'Pago aún no confirmado.',loading:'Cargando…',error:'No se pudo completar la solicitud',domain:'Subdominio propuesto'},
 fr:{title:'Portail client',back:'Retour à NIXINX',login:'Se connecter',register:'Créer un compte',email:'Courriel',password:'Mot de passe',verify:'Vérifiez votre courriel puis reconnectez-vous.',reset:'Réinitialiser le mot de passe',resetSent:'Si le compte existe, un courriel sera envoyé.',name:'Votre nom',company:'Nom de la société',acronym:'Acronyme permanent',save:'Enregistrer le profil',catalog:'Applications disponibles',none:'Aucune application publiée pour le moment.',pay:'Payer en mode test Stripe',logout:'Se déconnecter',test:'Mode test uniquement. Aucun débit réel ni création de ressources.',saved:'Profil enregistré.',paid:'Paiement test confirmé. Demande de provisionnement enregistrée.',pending:'Paiement non confirmé.',loading:'Chargement…',error:'Impossible de terminer la demande',domain:'Sous-domaine proposé'}
};
type Profile={name:string;company:string;acronym:string};
type Account={email:string;profile:Profile|null;items:{id:string;name:string;amount:number;currency:string}[];orders:{id:string;status:string}[]};
const empty={name:'',company:'',acronym:''};
async function api(action:string,body?:object){
 const r=await fetch('/api/customer-portal/'+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const d=await r.json();if(!r.ok)throw Error(d.error||'REQUEST_FAILED');return d;
}
export default function AccountPage(){
 const params=useParams<{locale:string}>(),locale=params.locale in copy?params.locale as keyof typeof copy:'en',t=copy[locale];
 const [account,setAccount]=useState<Account|null>(null),[profile,setProfile]=useState<Profile>(empty),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState<'login'|'register'>('login'),[selected,setSelected]=useState<string[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 async function refresh(){try{const a:Account=await api('account');setAccount(a);setProfile(a.profile??empty);}catch(e){setAccount(null);if((e as Error).message!=='LOGIN_REQUIRED')setMessage((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void refresh();},[]);
 async function run(fn:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(t.error+': '+(e as Error).message);}finally{setBusy(false);}}
 function submit(e:FormEvent){e.preventDefault();void run(async()=>{const a=await api(mode,{email,password});setPassword('');if(a.verifyEmail){setMessage(t.verify);setMode('login');}else await refresh();});}
 return <main className="section" style={{maxWidth:720,margin:'0 auto',padding:'100px 24px 48px'}}>
 <Link href={'/'+locale}>← {t.back}</Link><h1>{t.title}</h1><p>{t.test}</p>
 {loading?<p>{t.loading}</p>:!account?<form className="lead-form" onSubmit={submit}>
 <label>{t.email}<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>{t.password}<input type="password" minLength={8} required autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button type="submit" className="button primary" disabled={busy}>{t[mode]}</button>
 <button type="button" className="button secondary" disabled={busy} onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?t.register:t.login}</button>
 <button type="button" className="button secondary" disabled={busy||!email} onClick={()=>void run(async()=>{await api('reset',{email});setMessage(t.resetSent);})}>{t.reset}</button></form>:
 <>
 <p>{account.email}</p><form className="lead-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('profile',profile);await refresh();setMessage(t.saved);});}}>
 <label>{t.name}<input required minLength={2} maxLength={100} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
 <label>{t.company}<input required minLength={2} maxLength={150} value={profile.company} onChange={e=>setProfile({...profile,company:e.target.value})}/></label>
 <label>{t.acronym}<input required pattern="[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])" maxLength={39} readOnly={!!account.profile} value={profile.acronym} onChange={e=>setProfile({...profile,acronym:e.target.value.toLowerCase()})}/></label>
 <button className="button primary" disabled={busy} type="submit">{t.save}</button></form>
 <h2>{t.catalog}</h2>{!account.items.length?<p>{t.none}</p>:account.items.map(item=><div key={item.id} style={{padding:'12px 0'}}>
 <label><input type="checkbox" checked={selected.includes(item.id)} onChange={e=>setSelected(previous=>e.target.checked?[...previous,item.id]:previous.filter(id=>id!==item.id))}/> {item.name} · {new Intl.NumberFormat(locale==='en'?'en-CA':locale==='fr'?'fr-CA':'es-CA',{style:'currency',currency:item.currency.toUpperCase()}).format(item.amount/100)} CAD</label>
 {profile.acronym&&<p>{t.domain}: {profile.acronym}.{item.id}.nixinx.app</p>}</div>)}
 <button className="button primary" style={{opacity:busy||!account.profile||!selected.length||account.orders.some(o=>o.status==='paid_test')?0.45:1}} disabled={busy||!account.profile||!selected.length||account.orders.some(o=>o.status==='paid_test')} onClick={()=>void run(async()=>{const r=await api('checkout',{locale,applicationIds:selected});window.location.assign(r.url);})}>{t.pay}</button>
 {account.orders.length>0&&<p role="status">{account.orders.some(o=>o.status==='paid_test')?t.paid:t.pending}</p>}
 <button className="button secondary" disabled={busy} onClick={()=>void run(async()=>{await api('logout',{});setAccount(null);setProfile(empty);setSelected([]);})}>{t.logout}</button>
 </>}{message&&<p role="status" style={{overflowWrap:'anywhere'}}>{message}</p>}
 </main>;
}

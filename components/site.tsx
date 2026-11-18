'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import type { Locale } from '@/lib/i18n';
import { words } from '@/lib/i18n';

type TurnstileClient={render:(element:HTMLElement,settings:Record<string,unknown>)=>string;reset?:()=>void};
declare global {interface Window {turnstile?:TurnstileClient}}
const sections=['approach','capabilities','architecture','business','contact'];
const icons=['◈','⌘','◇','✳','◉','↗'];
function LeadForm({locale}:{locale:Locale}){
  const t=words[locale];const [status,setStatus]=useState<'idle'|'sending'|'sent'|'failed'|'rate'|'validation'|'unavailable'>('idle');
  const [token,setToken]=useState('');
  const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const address=process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  const errors={failed:t.failed,rate:t.rate,validation:t.validation,unavailable:t.unavailable};
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(status==='sending')return;const form=e.currentTarget;const d=new FormData(form);
    const body={name:String(d.get('name')||''),email:String(d.get('email')||''),company:String(d.get('company')||''),intent:String(d.get('intent')||'unsure'),message:String(d.get('message')||''),website:String(d.get('website')||''),consent:d.get('consent')==='yes',locale,turnstileToken:token};
    setStatus('sending');
    try{const res=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      if(res.ok){setStatus('sent');form.reset();window.turnstile?.reset?.();setToken('');return;}
      const data=await res.json().catch(()=>({error:'SAVE_UNAVAILABLE'})) as {error?:string};
      setStatus(res.status===429?'rate':data.error==='FORM_NOT_CONFIGURED'?'unavailable':res.status===400?'validation':'failed');
    }catch{setStatus('failed')}
  }
  return <form className="lead-form" onSubmit={submit} aria-label={t.contactTitle}>
    <div className="form-grid"><label>{t.formName}<input type="text" name="name" maxLength={100} minLength={2} required autoComplete="name" placeholder={t.placeholders[0]}/></label><label>{t.formEmail}<input type="email" name="email" maxLength={254} required autoComplete="email" placeholder={t.placeholders[1]}/></label></div>
    <label>{t.formCompany}<input type="text" name="company" maxLength={150} autoComplete="organization" placeholder={t.placeholders[2]}/></label>
    <label>{t.formIntent}<select name="intent" defaultValue="unsure">{t.intents.map(([id,value])=><option value={id} key={id}>{value}</option>)}</select></label>
    <label>{t.formMessage}<textarea name="message" minLength={10} maxLength={2500} required rows={4} placeholder={t.placeholders[3]}/></label>
    <div className="robot-field" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <label className="consent"><input type="checkbox" name="consent" value="yes" required/><span>{t.formConsent} <Link href={`/${locale}/privacy`}>{t.privacyLabel}</Link>.</span></label>
    {siteKey&&<><div id="nixinx-turnstile" className="turnstile-slot"/><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={()=>{const node=document.getElementById('nixinx-turnstile');if(node&&window.turnstile&&node.children.length===0){window.turnstile.render(node,{sitekey:siteKey,callback:(v:unknown)=>setToken(String(v)), 'expired-callback':()=>setToken('')});}}}/></>}
    <button className="button primary wide" disabled={status==='sending'||status==='sent'||(!!siteKey&&!token)} type="submit">{status==='sending'?t.sending:status==='sent'?t.sent:t.submit} <span aria-hidden="true">↗</span></button>
    {status==='sent'&&<p className="feedback good" role="status">{t.sent}</p>}
    {status!=='idle'&&status!=='sending'&&status!=='sent'&&<p className="feedback bad" role="alert">{errors[status]}</p>}
    {address&&<p className="email-line"><a href={`mailto:${address}`}>{address}</a></p>}
  </form>
}
export default function Site({locale}:{locale:Locale}){
  const t=words[locale];const [menu,setMenu]=useState(false);
  useEffect(()=>{document.documentElement.lang=locale},[locale]);
  return <>
    <header className="site-header"><div className="nav-wrap"><Link className="logo" href={`/${locale}`} aria-label="NIXINX"><span className="logo-square">N<span>.</span></span><span className="logo-word">NIXINX<small>BUSINESS TRANSFORMATION</small></span></Link>
      <nav className={menu?'main-nav is-open':'main-nav'} aria-label="Main navigation">{t.nav.map((name,i)=><a key={sections[i]} onClick={()=>setMenu(false)} href={`#${sections[i]}`}>{name}</a>)}</nav>
      <div className="nav-side"><div className="lang" aria-label="Language selection">{(['en','es','fr'] as Locale[]).map(code=><Link key={code} href={`/${code}`} aria-current={code===locale?'page':undefined} hrefLang={code}>{code.toUpperCase()}</Link>)}</div><a className="nav-action" href="#contact">{t.cta} <span>↗</span></a><button className="menu-trigger" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Toggle menu">{menu?'✕':'☰'}</button></div></div></header>
    <main>
      <section className="hero" id="top"><div className="hero-glow"/><div className="hero-copy"><div className="eyebrow"><span className="dot"/>{t.heroEyebrow}</div><h1>{t.heroA}<br/><em>{t.heroB}</em><br/>{t.heroC}</h1><p className="hero-lead">{t.heroText}</p><div className="hero-actions"><a className="button primary" href="#contact">{t.heroCta} <span>↗</span></a><a className="button subtle" href="#approach">{t.heroLink} <span>→</span></a></div><div className="hero-pills">{t.heroPills.map(item=><span key={item}><b>✓</b>{item}</span>)}</div></div>
        <div className="orbital" aria-label="Connected NIXINX business services"><div className="orbital-lines line-one"/><div className="orbital-lines line-two"/><div className="orbital-core">N<span>.</span><small>CONNECTED</small></div><div className="orbital-label o1"><b>01</b> INFRA</div><div className="orbital-label o2"><b>02</b> SOFTWARE</div><div className="orbital-label o3"><b>03</b> ENGINE</div><div className="orbital-label o4"><b>04</b> MI + PM</div><div className="orbit-caption">ONE CONNECTED OPERATING MODEL</div></div>
      </section>
      <section className="section vision" id="approach"><div><span className="tag">{t.visionTag}</span><h2>{t.visionTitle}</h2></div><div><p className="vision-lead">{t.visionLead}</p><p>{t.visionCopy}</p></div></section>
      <section className="section stages"><div className="section-heading"><div><span className="tag">{t.maturityTag}</span><h2>{t.maturityTitle}</h2></div><div className="heading-decoration">01—04</div></div><div className="stage-list">{t.maturity.map(([num,title,copy])=><article key={num} className="stage-item"><span>{num}</span><h3>{title}</h3><p>{copy}</p><b aria-hidden="true">↗</b></article>)}</div></section>
      <section className="section capabilities" id="capabilities"><div className="section-heading"><div><span className="tag">{t.capTag}</span><h2>{t.capTitle}</h2></div><p>{t.capIntro}</p></div><div className="capability-grid">{t.capabilities.map(([name,tag,desc],i)=><article key={name} className={'capability cap-'+i}><div className="cap-top"><span className="cap-icon">{icons[i]}</span><small>{tag}</small></div><div><h3>{name}</h3><p>{desc}</p></div><span className="cap-number">0{i+1}</span></article>)}</div></section>
      <section className="section architecture" id="architecture"><div className="section-heading"><div><span className="tag">{t.architectureTag}</span><h2>{t.architectureTitle}</h2></div><p>{t.architectureDesc}</p></div><div className="architecture-flow">{t.flow.map(([num,title,copy],i)=><div className="flow-with-arrow" key={num}><article className={'flow-node flow-'+i}><small>{num}</small><span className="flow-symbol">{['⌘','▤','✳','↗'][i]}</span><h3>{title}</h3><p>{copy}</p></article>{i<3&&<div className="flow-arrow" aria-hidden="true">→</div>}</div>)}</div><div className="arch-footer"><span className="arch-shield">◈</span><p>{t.architectureFoot}</p></div></section>
      <section className="section industries"><div className="industry-copy"><span className="tag">{t.industriesTag}</span><h2>{t.industriesTitle}</h2><p>{t.industriesDesc}</p><div className="radar"><div className="radar-ring one"/><div className="radar-ring two"/><div className="radar-center">N.</div><div className="radar-point p1"/><div className="radar-point p2"/><div className="radar-point p3"/></div></div><div className="industry-list">{t.industries.map((label,i)=><div key={label}><span>0{i+1}</span><strong>{label}</strong><span aria-hidden="true">↗</span></div>)}</div></section>
      <section className="section usecases"><span className="tag">{t.casesTag}</span><h2>{t.casesTitle}</h2><div className="usecase-grid">{t.cases.map(([name,desc],i)=><article key={name}><span className="usecase-icon">{['↗','≋','◎'][i]}</span><h3>{name}</h3><p>{desc}</p></article>)}</div></section>
      <section className="section commercial" id="business"><div className="section-heading"><div><span className="tag">{t.businessTag}</span><h2>{t.businessTitle}</h2></div></div><div className="revenue-grid">{t.revenue.map(([name,desc],i)=><article key={name}><div className="revenue-top"><span>0{i+1}</span><b aria-hidden="true">↗</b></div><h3>{name}</h3><p>{desc}</p></article>)}</div><p className="business-note">{t.businessNote}</p></section>
      <section className="section channels"><span className="tag">{t.channelsTag}</span><h2>{t.channelsTitle}</h2><div className="channel-grid">{t.channels.map(([domain,purpose],i)=><article key={domain}><span className="channel-number">0{i+1}</span><h3>{domain}</h3><p>{purpose}</p></article>)}</div></section>
      <section className="section contact" id="contact"><div><span className="tag">{t.contactTag}</span><h2>{t.contactTitle}</h2><p>{t.contactDesc}</p><div className="contact-deco"><div className="contact-pulse"/>NIXINX <span>·</span> BUSINESS TRANSFORMATION</div></div><LeadForm locale={locale}/></section>
    </main><footer className="footer"><div><span className="footer-word">NIXINX<span>.</span></span><p>{t.footer}</p></div><div className="footer-links"><Link href={`/${locale}/privacy`}>{t.privacy}</Link><a href="#top">↑</a></div><small>© {new Date().getFullYear()} NIXINX. {t.copyright}</small></footer>
  </>;
}

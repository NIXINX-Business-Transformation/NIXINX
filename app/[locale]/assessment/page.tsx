import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {isLocale,locales,words} from '@/lib/i18n';
import AssessmentFrame from '@/components/assessment-frame';
export function generateStaticParams(){return locales.map(locale=>({locale}))}
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
 const {locale}=await params;if(!isLocale(locale))return {};
 const t=words[locale].assessment;
 return {title:`${t.title} | NIXINX`,description:t.lead,alternates:{canonical:`/${locale}/assessment`,languages:{en:'/en/assessment',es:'/es/assessment',fr:'/fr/assessment','x-default':'/en/assessment'}}};
}
export default async function RestaurantAssessment({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(!isLocale(locale))notFound();const t=words[locale].assessment;
 return <main className="assessment-page"><div className="assessment-wrap">
 <header className="assessment-top">
  <Link className="legal-logo" href={`/${locale}`}>NIXINX<span>.</span></Link>
  <nav className="lang" aria-label="Language">{locales.map(code=><Link key={code} href={`/${code}/assessment`} aria-current={code===locale?'page':undefined} hrefLang={code} lang={code}>{code.toUpperCase()}</Link>)}</nav>
  <Link className="assessment-direct" href={`/${locale}`}>← {t.back}</Link>
 </header>
 <section className="assessment-head">
  <div className="tag">{t.eyebrow}</div><h1>{t.title}</h1><p>{t.lead}</p>
  <div className="assessment-highlights">{t.features.map(feature=><span key={feature}>✓ {feature}</span>)}</div>
 </section>
 <aside className="assessment-notice">{t.disclosure} <Link href={`/${locale}/privacy`}>{words[locale].privacyLabel}</Link>.</aside>
 <AssessmentFrame locale={locale}/>
 </div></main>
}
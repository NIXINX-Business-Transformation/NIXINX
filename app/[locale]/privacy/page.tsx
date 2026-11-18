import { notFound } from 'next/navigation';
import Link from 'next/link';
import { isLocale, locales, words } from '@/lib/i18n';
export function generateStaticParams(){return locales.map(locale=>({locale}))}
export default async function Privacy({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();const t=words[locale];return <main className="legal"><Link className="legal-logo" href={`/${locale}`}>NIXINX<span>.</span></Link><div className="legal-content"><Link className="back" href={`/${locale}`}>← {t.privacyBack}</Link><h1>{t.privacyTitle}</h1><p className="legal-lead">{t.privacyIntro}</p>{t.privacySections.map(([heading,body])=><section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}<p className="legal-note">{t.privacyDate}</p></div></main>}

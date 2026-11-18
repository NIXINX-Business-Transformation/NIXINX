import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Site from '@/components/site';
import { isLocale, locales, words } from '@/lib/i18n';
export function generateStaticParams(){return locales.map(locale=>({locale}))}
export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{const {locale}=await params;if(!isLocale(locale))return {};return {title:`NIXINX — ${words[locale].heroEyebrow}`,alternates:{canonical:`/${locale}`,languages:{en:'/en',es:'/es',fr:'/fr','x-default':'/en'}}}}
export default async function Page({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <Site locale={locale}/>}

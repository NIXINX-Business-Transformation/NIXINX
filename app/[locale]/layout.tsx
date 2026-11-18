import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n';
import '../style.css';
export const metadata:Metadata={title:{default:'NIXINX | Business Transformation',template:'%s | NIXINX'},description:'Business Transformation · Infrastructure and Integrations · NIXINX Software · Management Information · Performance Management',applicationName:'NIXINX',manifest:'/manifest.webmanifest',icons:{icon:'/icon',apple:'/apple-icon'},appleWebApp:{capable:true,title:'NIXINX',statusBarStyle:'black-translucent'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#091923'};
export function generateStaticParams(){return locales.map(locale=>({locale}))}
export default async function LocaleLayout({children,params}:{children:React.ReactNode,params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <html lang={locale}><body>{children}</body></html>}

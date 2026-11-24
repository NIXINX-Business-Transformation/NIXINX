import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n';
import '../style.css';
import PwaRegistration from '@/components/pwa-registration';
export const metadata:Metadata={title:{default:'NIXINX | Business Transformation',template:'%s | NIXINX'},description:'Business Transformation · Infrastructure and Integrations · NIXINX Software · Management Information · Performance Management',applicationName:'NIXINX',manifest:'/manifest.webmanifest',icons:{icon:[{url:'/icon.svg?v=diagonal1',type:'image/svg+xml',sizes:'any'}],apple:'/apple-icon'},appleWebApp:{capable:true,title:'NIXINX',statusBarStyle:'black-translucent'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#081210'};
export function generateStaticParams(){return locales.map(locale=>({locale}))}
export default async function LocaleLayout({children,params}:{children:React.ReactNode,params:Promise<{locale:string}>}){const {locale}=await params;if(!isLocale(locale))notFound();return <html lang={locale}><body>{children}<PwaRegistration/></body></html>}

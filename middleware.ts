import { NextRequest, NextResponse } from 'next/server';
export function middleware(req: NextRequest) {
  const path=req.nextUrl.pathname;
  if(path==='/integrations/vercel'||path==='/integrations/vercel/terms'||path==='/integrations/vercel/privacy')return NextResponse.rewrite(new URL(`/en${path}`,req.url));
  if(path!=='/'&&path!=='/privacy'&&path!=='/assessment')return NextResponse.next();
  const lang = req.headers.get('accept-language')?.toLowerCase() || '';
  const saved = req.cookies.get('nixinx_locale')?.value;
  // A deliberate language choice takes precedence over the browser default.
  const locale = saved === 'fr' || saved === 'es' || saved === 'en'
    ? saved
    : lang.startsWith('fr') ? 'fr' : lang.startsWith('es') ? 'es' : 'en';
  return NextResponse.redirect(new URL(path==='/privacy'?`/${locale}/privacy`:path==='/assessment'?`/${locale}/assessment`:`/${locale}`,req.url));
}
export const config = { matcher: ['/','/privacy','/assessment','/integrations/vercel','/integrations/vercel/terms','/integrations/vercel/privacy'] };

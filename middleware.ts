import { NextRequest, NextResponse } from 'next/server';
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== '/') return NextResponse.next();
  const lang = req.headers.get('accept-language')?.toLowerCase() || '';
  const saved = req.cookies.get('nixinx_locale')?.value;
  // A deliberate language choice takes precedence over the browser default.
  const locale = saved === 'fr' || saved === 'es' || saved === 'en'
    ? saved
    : lang.startsWith('fr') ? 'fr' : lang.startsWith('es') ? 'es' : 'en';
  return NextResponse.redirect(new URL(`/${locale}`, req.url));
}
export const config = { matcher: ['/'] };

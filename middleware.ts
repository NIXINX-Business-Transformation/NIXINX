import { NextRequest, NextResponse } from 'next/server';
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== '/') return NextResponse.next();
  const lang = req.headers.get('accept-language')?.toLowerCase() || '';
  const locale = lang.startsWith('fr') ? 'fr' : lang.startsWith('es') ? 'es' : 'en';
  return NextResponse.redirect(new URL(`/${locale}`, req.url));
}
export const config = { matcher: ['/'] };

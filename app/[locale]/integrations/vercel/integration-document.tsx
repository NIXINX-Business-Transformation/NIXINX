import Link from 'next/link';
import type { ReactNode } from 'react';
export default function IntegrationDocument({title,children}:{title:string;children:ReactNode}){
 return <main className="legal" lang="en"><Link className="legal-logo" href="/en">NIXINX<span>.</span></Link><div className="legal-content"><Link className="back" href="/en">← Return to website</Link><h1>{title}</h1>{children}<nav aria-label="Integration documents"><p><Link href="/integrations/vercel">Documentation</Link> · <Link href="/integrations/vercel/terms">Terms of use</Link> · <Link href="/integrations/vercel/privacy">Privacy notice</Link></p></nav><p className="legal-note">Support: <a href="mailto:support@nixinx.com">support@nixinx.com</a></p></div></main>
}

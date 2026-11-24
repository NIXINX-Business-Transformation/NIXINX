'use client';
import {useId} from 'react';
export function BrandFace(){
 const id=useId().replace(/:/g,'');
 return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id={id+'d'} x1="0%" y1="0%" x2="100%" y2="100%"><stop stopColor="#f3f9f6"/><stop offset=".55" stopColor="#b4dcd1"/><stop offset="1" stopColor="#79b6a9"/></linearGradient></defs><g fill="none" strokeWidth="9" strokeLinecap="round"><path d="M16 18L48 46" stroke={'url(#'+id+'d)'}/></g></svg>
}
export function BrandMark(){return <span className="brand-mark" aria-hidden="true"><span className="brand-static"><BrandFace/></span></span>}
export function Wordmark(){return <svg className="wordmark" viewBox="0 0 196 32" role="img" aria-label="NIXINX"><g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M3 25V7L26 25V7 M39 7V25 M51 7L77 25 M77 7L51 25 M90 7V25 M103 25V7L126 25V7 M139 7L165 25 M165 7L139 25"/></g><path d="M3 7L35 30 M103 7L135 30" stroke="#7dcbb6" strokeWidth="1" opacity=".65"/></svg>}
const icons:Record<string,string>={integrate:'M12 3 2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5',optimize:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2',measure:'M3 21h18 M5 18v-5h3v5 M11 18V9h3v9 M17 18V4h3v14',manage:'M20 12a8 8 0 1 1-8-8 M16 12a4 4 0 1 1-4-4 M12 12 22 2 M18 2h4v4',scale:'M12 12C8 3 2 6 2 12s6 9 10 0c4-9 10-6 10 0s-6 9-10 0z'};
export function PillarIcon({name}:{name:string}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]}/></svg>}

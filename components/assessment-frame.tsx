'use client';
import {useState} from 'react';
import Script from 'next/script';
import type {Locale} from '@/lib/i18n';
import {words} from '@/lib/i18n';

// Use the exact, previously deployed Zite SDK configuration from
// business-transformation/src/components/RestaurantAssessment.tsx.
const ZITE_ASSESSMENT='https://vv7qctrcfg.zite.so/';
export default function AssessmentFrame({locale}:{locale:Locale}){
 const t=words[locale].assessment;
 const [open,setOpen]=useState(false);
 return <div>
  <div className="assessment-launch">
   {!open&&<button className="button primary" type="button" onClick={()=>setOpen(true)}>{t.launch} <span aria-hidden="true">↗</span></button>}
   <a className="assessment-direct" href={ZITE_ASSESSMENT} rel="noopener noreferrer" target="_blank">{t.open} ↗</a>
  </div>
  {open?
    <div className="assessment-frame">
      <div className="assessment-zite-container"
        data-zite-id="vv7qctrcfg"
        data-zite-embed-type="standard"
        data-zite-inherit-parameters=""
      />
      <Script src="https://server.zite.com/embed/v2-zite/" strategy="afterInteractive"/>
      <p className="assessment-fallback">{t.alternate} <a href={ZITE_ASSESSMENT} target="_blank" rel="noopener noreferrer">{t.open} ↗</a></p>
    </div>
   :<p className="assessment-hidden-hint">{t.alternate}</p>}
 </div>;
}

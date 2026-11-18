'use client';
import {useState} from 'react';
import type {Locale} from '@/lib/i18n';
import {words} from '@/lib/i18n';
const ZITE_ASSESSMENT='https://vv7qctrcfg.zite.so/';
export default function AssessmentFrame({locale}:{locale:Locale}){
 const t=words[locale].assessment;const[open,setOpen]=useState(false);
 return <div>
  <div className="assessment-launch">
    {!open&&<button className="button primary" type="button" onClick={()=>setOpen(true)}>{t.launch} <span aria-hidden="true">↗</span></button>}
    <a className="assessment-direct" href={ZITE_ASSESSMENT} rel="noopener noreferrer" target="_blank">{t.open} ↗</a>
  </div>
  {open?
   <div className="assessment-frame"><iframe src={ZITE_ASSESSMENT} title={t.eyebrow} loading="eager" allow="fullscreen; clipboard-write" referrerPolicy="strict-origin-when-cross-origin"/><p className="assessment-fallback">{t.alternate} <a href={ZITE_ASSESSMENT} target="_blank" rel="noopener noreferrer">{t.open} ↗</a></p></div>:
   <p className="assessment-hidden-hint">{t.alternate}</p>}
 </div>
}
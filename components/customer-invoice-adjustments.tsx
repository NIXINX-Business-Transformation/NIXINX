'use client';
import {useState} from 'react';
type Note={id:string;number:string;amount:number;status:'issued'|'void';pdf:string|null;refund:{amount:number;status:string}|null};
const copy={
 es:{button:'Consultar notas de crédito y reembolsos',close:'Ocultar ajustes',loading:'Consultando Stripe…',error:'No fue posible verificar los ajustes en Stripe. Intenta nuevamente o solicita soporte.',empty:'No hay notas de crédito vinculadas a esta factura.',credit:'Nota de crédito',refund:'Reembolso vinculado',download:'Descargar nota de Stripe',issued:'Emitida',void:'Anulada',pending:'Pendiente',requires_action:'Requiere acción',succeeded:'Confirmado',failed:'Fallido',canceled:'Cancelado',scope:'Consulta de notas de crédito y sus reembolsos vinculados en Stripe. No es un estado de cuenta.'},
 en:{button:'View credit notes and refunds',close:'Hide adjustments',loading:'Checking Stripe…',error:'Unable to verify adjustments in Stripe. Try again or contact support.',empty:'No credit notes linked to this invoice.',credit:'Credit note',refund:'Linked refund',download:'Download Stripe credit note',issued:'Issued',void:'Voided',pending:'Pending',requires_action:'Action required',succeeded:'Confirmed',failed:'Failed',canceled:'Cancelled',scope:'Credit notes and their linked refunds from Stripe. Not an account statement.'},
 fr:{button:'Consulter les avoirs et remboursements',close:'Masquer les ajustements',loading:'Consultation de Stripe…',error:'Impossible de vérifier les ajustements dans Stripe. Réessayez ou contactez le support.',empty:'Aucun avoir lié à cette facture.',credit:'Avoir',refund:'Remboursement lié',download:'Télécharger l’avoir Stripe',issued:'Émis',void:'Annulé',pending:'En attente',requires_action:'Action requise',succeeded:'Confirmé',failed:'Échec',canceled:'Annulé',scope:'Avoirs et remboursements associés dans Stripe. Ceci n’est pas un relevé de compte.'}
};
export function CustomerInvoiceAdjustments({invoiceId,locale}:{invoiceId:string;locale:'en'|'es'|'fr'}){
 const t=copy[locale];const [notes,setNotes]=useState<Note[]|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const money=(amount:number)=>new Intl.NumberFormat(locale+'-CA',{style:'currency',currency:'CAD'}).format(amount/100);
 const status=(s:string)=>(t as Record<string,string>)[s]??s;
 async function toggle(){
  if(open&&!error){setOpen(false);return;}
  setOpen(true);setBusy(true);setError(false);setNotes(null);
  try{
   const r=await fetch('/api/customer-portal/invoice-adjustments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoiceId}),cache:'no-store'});
   if(!r.ok)throw Error('unavailable');
   const result=await r.json();if(!Array.isArray(result.notes))throw Error('invalid');
   setNotes(result.notes);
  }catch{setError(true);}finally{setBusy(false);}
 }
 return <div className="nx-invoice-adjustments"><button type="button" className="nx-secondary" aria-expanded={open} disabled={busy} onClick={()=>void toggle()}>{busy?t.loading:open&&!error?t.close:t.button}</button>{open&&<div aria-live="polite">{error?<p>{t.error}</p>:notes&&<><p className="nx-muted">{t.scope}</p>{notes.length?notes.map(n=><div className="nx-record" key={n.id}><div><b>{t.credit} · {n.number}</b><small>{status(n.status)} · {money(n.amount)}</small>{n.refund&&<small>{t.refund}: {money(n.refund.amount)} · {status(n.refund.status)}</small>}</div>{n.pdf&&<a className="nx-link" href={n.pdf} target="_blank" rel="noopener noreferrer">{t.download}</a>}</div>):<p>{t.empty}</p>}</>}</div>}</div>;
}

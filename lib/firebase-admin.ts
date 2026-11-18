import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
export function getLeadDb() {
  const projectId=process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!projectId || !clientEmail || !privateKey || !process.env.LEADS_HASH_SECRET) return null;
  const app=getApps()[0]??initializeApp({credential:cert({projectId,clientEmail,privateKey}),projectId});
  return getFirestore(app);
}

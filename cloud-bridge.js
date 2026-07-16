import { firebaseConfig, OWNER_EMAIL } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { user:null, profile:null, sales:[], purchases:[], expenses:[], users:[], stats:{stockDiamonds:0}, ready:false };
const listeners=[];
const notify=()=>window.dispatchEvent(new CustomEvent('dot-cloud-update',{detail:state}));

async function ensureProfile(user){
  const ref=doc(db,'users',user.uid), snap=await getDoc(ref);
  const owner=(user.email||'').toLowerCase()===OWNER_EMAIL.toLowerCase();
  if(!snap.exists()){
    const p={uid:user.uid,email:user.email,name:user.displayName||user.email,role:owner?'owner':'supervisor',status:owner?'active':'pending',createdAt:serverTimestamp()};
    await setDoc(ref,p); return p;
  }
  let p=snap.data();
  const authName=String(user.displayName||'').trim();
  const storedName=String(p.name||'').trim();
  const needsNameSync=authName && (!storedName || storedName===user.email || storedName.includes('@'));
  const patch={};
  if(owner&&(p.role!=='owner'||p.status!=='active')){patch.role='owner';patch.status='active';}
  if(needsNameSync)patch.name=authName;
  if(Object.keys(patch).length){await updateDoc(ref,{...patch,updatedAt:serverTimestamp()});p={...p,...patch};}
  return p;
}
function subscribe(){
  listeners.splice(0).forEach(x=>x());
  listeners.push(onSnapshot(doc(db,'publicStats','current'),s=>{if(s.exists())state.stats=s.data();notify();}));
  listeners.push(onSnapshot(query(collection(db,'sales'),orderBy('createdAt','desc'),limit(800)),s=>{state.sales=s.docs.map(d=>({id:d.id,...d.data()}));notify();}));
  if(state.profile.role==='owner'){
    listeners.push(onSnapshot(query(collection(db,'purchases'),orderBy('createdAt','desc'),limit(800)),s=>{state.purchases=s.docs.map(d=>({id:d.id,...d.data()}));notify();}));
    listeners.push(onSnapshot(query(collection(db,'expenses'),orderBy('createdAt','desc'),limit(800)),s=>{state.expenses=s.docs.map(d=>({id:d.id,...d.data()}));notify();}));
    listeners.push(onSnapshot(query(collection(db,'users'),orderBy('createdAt','desc')),s=>{state.users=s.docs.map(d=>({id:d.id,...d.data()}));notify();}));
  }
}
const api={
  state,
  role:()=>state.profile?.role||'loading',
  mine:()=>state.profile?.role==='owner'?state.sales:state.sales.filter(x=>x.createdBy===state.user?.uid),
  logout:()=>signOut(auth),
  addSale:async d=>addDoc(collection(db,'sales'),{...d,status:'pending',createdBy:state.user.uid,createdByName:(state.profile.name&&!String(state.profile.name).includes('@')?state.profile.name:(state.user.displayName||String(state.user.email||'').split('@')[0])),createdByEmail:state.user.email,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}),
  addPurchase:async d=>runTransaction(db,async tx=>{const sref=doc(db,'publicStats','current'),pref=doc(collection(db,'purchases')),ss=await tx.get(sref),cur=Number(ss.data()?.stockDiamonds||0);tx.set(pref,{...d,createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()});tx.set(sref,{stockDiamonds:cur+Number(d.diamonds||0),lastUpdatedAt:serverTimestamp()},{merge:true});}),
  addExpense:async d=>addDoc(collection(db,'expenses'),{...d,createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()}),
  decide:async(id,status)=>runTransaction(db,async tx=>{const sref=doc(db,'sales',id),stref=doc(db,'publicStats','current'),ss=await tx.get(sref);if(!ss.exists())throw new Error('العملية غير موجودة');const sale=ss.data();if(sale.status!=='pending')return;const patch={status,approvedBy:state.user.uid,approvedByEmail:state.user.email,approvedAt:serverTimestamp(),updatedAt:serverTimestamp()};if(status==='approved'){const st=await tx.get(stref),cur=Number(st.data()?.stockDiamonds||0),qty=Number(sale.diamonds||0);if(cur<qty)throw new Error('المخزون غير كافٍ');tx.set(stref,{stockDiamonds:cur-qty,lastUpdatedAt:serverTimestamp()},{merge:true});patch.stockDeducted=qty;}tx.update(sref,patch);}),
  setUserStatus:(uid,status)=>updateDoc(doc(db,'users',uid),{status,updatedAt:serverTimestamp()}),
  setUserName:(uid,name)=>updateDoc(doc(db,'users',uid),{name:String(name||'').trim(),updatedAt:serverTimestamp()})
};
window.DOT_CLOUD=api;
onAuthStateChanged(auth,async user=>{
  if(!user){location.replace('./index.html');return;}
  state.user=user;state.profile=await ensureProfile(user);
  if(state.profile.role!=='owner'&&state.profile.status!=='active'){alert('حساب المشرف بانتظار تفعيل المالك.');await signOut(auth);return;}
  state.ready=true;subscribe();notify();window.dispatchEvent(new CustomEvent('dot-cloud-ready',{detail:state}));
});
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js?v=25.5.0').catch(console.warn)}

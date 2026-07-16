import { firebaseConfig, OWNER_EMAIL } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { user:null, profile:null, sales:[], purchases:[], expenses:[], users:[], stats:{stockDiamonds:0}, ready:false, sync:{status:navigator.onLine?'connected':'offline',lastSync:null} };

const listeners=[];
function setSync(status,emit=true){
  state.sync={status,lastSync:status==='connected'?new Date().toISOString():(state.sync?.lastSync||null)};
  if(emit)notify();
}
window.addEventListener('online',()=>setSync('connected'));
window.addEventListener('offline',()=>setSync('offline'));


const notify=()=>window.dispatchEvent(new CustomEvent('dot-cloud-update',{detail:state}));
const approvedSummary=x=>({
  id:String(x.id||''),
  orderNumber:String(x.orderNumber||''),
  saleDate:String(x.saleDate||'').slice(0,10),
  diamonds:Number(x.diamonds||0),
  amount:Number(x.amount||0),
  payment:String(x.payment||''),
  reference:String(x.reference||''),
  notes:String(x.notes||''),
  createdBy:String(x.createdBy||''),
  createdByName:String(x.createdByName||''),
  createdByEmail:String(x.createdByEmail||''),
  status:'approved',
  sharedApproved:true
});
const approvedSignature=rows=>JSON.stringify((rows||[]).map(x=>[
  x.id,x.saleDate,Number(x.diamonds||0),Number(x.amount||0),x.payment,x.createdBy,x.createdByName
]));
let approvedSyncTimer=null;
async function syncApprovedSnapshot(rows){
  if(state.profile?.role!=='owner')return;
  const approved=(rows||[]).filter(x=>x.status==='approved').slice(0,500).map(approvedSummary);
  const current=Array.isArray(state.stats?.approvedSales)?state.stats.approvedSales:[];
  if(approvedSignature(approved)===approvedSignature(current))return;
  clearTimeout(approvedSyncTimer);
  approvedSyncTimer=setTimeout(async()=>{
    try{
      await setDoc(doc(db,'publicStats','current'),{
        approvedSales:approved,
        approvedSalesUpdatedAt:serverTimestamp()
      },{merge:true});
    }catch(e){console.error('approved sales snapshot sync',e)}
  },250);
}


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
  const ownSales=new Map();
  const publishSupervisor=()=>{
    const merged=new Map();
    const shared=Array.isArray(state.stats?.approvedSales)?state.stats.approvedSales:[];
    shared.forEach(x=>merged.set(String(x.id||x.orderNumber),{...x,status:'approved',sharedApproved:true}));
    ownSales.forEach((v,k)=>merged.set(k,v));
    state.sales=[...merged.values()].sort((a,b)=>{
      const av=a.createdAt?.toMillis?.()||Date.parse(a.saleDate||'')||0;
      const bv=b.createdAt?.toMillis?.()||Date.parse(b.saleDate||'')||0;
      return bv-av;
    });
    notify();
  };

  listeners.push(onSnapshot(doc(db,'publicStats','current'),s=>{
    if(s.exists())state.stats=s.data();
    state.sync={status:'connected',lastSync:new Date().toISOString()};
    if(state.profile.role==='supervisor')publishSupervisor();
    else notify();
  }));

  if(state.profile.role==='owner'){
    listeners.push(onSnapshot(query(collection(db,'sales'),orderBy('createdAt','desc'),limit(800)),s=>{
      state.sales=s.docs.map(d=>({id:d.id,...d.data()}));
      state.sync={status:'connected',lastSync:new Date().toISOString()};
      syncApprovedSnapshot(state.sales);
      notify();
    }));
  }else{
    listeners.push(onSnapshot(query(collection(db,'sales'),where('createdBy','==',state.user.uid),limit(800)),s=>{
      ownSales.clear();
      for(const d of s.docs)ownSales.set(d.id,{id:d.id,...d.data()});
      state.sync={status:'connected',lastSync:new Date().toISOString()};
      publishSupervisor();
    },e=>console.error('own sales subscription',e)));
  }

  if(state.profile.role==='owner'){
    listeners.push(onSnapshot(query(collection(db,'purchases'),orderBy('createdAt','desc'),limit(800)),s=>{state.purchases=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
    listeners.push(onSnapshot(query(collection(db,'expenses'),orderBy('createdAt','desc'),limit(800)),s=>{state.expenses=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
    listeners.push(onSnapshot(query(collection(db,'users'),orderBy('createdAt','desc')),s=>{state.users=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
  }
}


const cleanSaleInput=d=>({
  saleDate:String(d.saleDate||'').slice(0,10),
  diamonds:Number(d.diamonds||0),
  amount:Number(d.amount||0),
  payment:String(d.payment||'المتجر'),
  reference:String(d.reference||'').trim(),
  notes:String(d.notes||'').trim()
});
const saleSnapshot=(id,s)=>({
  id,
  orderNumber:String(s.orderNumber||''),
  saleDate:String(s.saleDate||'').slice(0,10),
  diamonds:Number(s.diamonds||0),
  amount:Number(s.amount||0),
  payment:String(s.payment||''),
  reference:String(s.reference||''),
  notes:String(s.notes||''),
  status:String(s.status||'pending'),
  createdBy:String(s.createdBy||''),
  createdByName:String(s.createdByName||''),
  createdByEmail:String(s.createdByEmail||'')
});
const appendAudit=(sale,entry)=>{
  const current=Array.isArray(sale.auditTrail)?sale.auditTrail:[];
  return [...current.slice(-24),entry];
};
const actorInfo=()=>({
  uid:state.user?.uid||'',
  email:state.user?.email||'',
  name:state.profile?.name||state.user?.displayName||state.user?.email||'',
  role:state.profile?.role||''
});
async function submitChangeRequest(targetSale,requestType,proposedSale=null){
  const actor=actorInfo();
  const request={
    requestType,
    targetSaleId:targetSale.id,
    targetOrderNumber:targetSale.orderNumber||'',
    targetSnapshot:saleSnapshot(targetSale.id,targetSale),
    proposedSale:requestType==='edit'?cleanSaleInput(proposedSale):null,
    saleDate:new Date().toISOString().slice(0,10),
    diamonds:0,
    amount:0,
    payment:'طلب تعديل',
    reference:targetSale.orderNumber||'',
    notes:requestType==='edit'?'طلب تعديل عملية':'طلب إلغاء عملية',
    status:'pending',
    createdBy:state.user.uid,
    createdByName:actor.name,
    createdByEmail:actor.email,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  };
  return addDoc(collection(db,'sales'),request);
}
async function updateSaleRecord(id,changes){
  const next=cleanSaleInput(changes);
  if(!next.saleDate)throw new Error('تاريخ العملية مطلوب.');
  if(next.diamonds<=0)throw new Error('كمية الألماس يجب أن تكون أكبر من صفر.');
  if(next.amount<0)throw new Error('قيمة البيع غير صحيحة.');
  const target=state.sales.find(x=>String(x.id)===String(id));
  if(!target)throw new Error('العملية غير موجودة.');
  if(state.profile?.role!=='owner'){
    if(target.createdBy!==state.user?.uid)throw new Error('لا يمكنك تعديل عملية ليست لك.');
    if(target.status!=='pending')throw new Error('يمكن طلب تعديل العملية المعلّقة فقط.');
    await submitChangeRequest(target,'edit',next);
    return {requestSubmitted:true};
  }
  return runTransaction(db,async tx=>{
    const sref=doc(db,'sales',id),stref=doc(db,'publicStats','current');
    const ss=await tx.get(sref);
    if(!ss.exists())throw new Error('العملية غير موجودة.');
    const old=ss.data();
    if(old.requestType)throw new Error('لا يمكن تعديل طلب تغيير كعملية بيع.');
    const patch={...next,updatedAt:serverTimestamp(),lastEditedBy:state.user.uid,lastEditedByEmail:state.user.email};
    const auditEntry={action:'updated',at:new Date().toISOString(),actor:actorInfo(),before:saleSnapshot(id,old),after:{...saleSnapshot(id,{...old,...next}),status:old.status}};
    patch.auditTrail=appendAudit(old,auditEntry);
    if(old.status==='approved'){
      const st=await tx.get(stref),data=st.data()||{};
      const cur=Number(data.stockDiamonds||0);
      const restored=cur+Number(old.diamonds||0);
      const newStock=restored-next.diamonds;
      if(newStock<0)throw new Error('المخزون غير كافٍ بعد التعديل.');
      const updatedSale={id,...old,...patch,status:'approved'};
      const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
      const approvedSales=[approvedSummary(updatedSale),...current.filter(x=>String(x.id)!==String(id))].slice(0,500);
      tx.set(stref,{stockDiamonds:newStock,approvedSales,lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
    }
    tx.update(sref,patch);
  });
}
async function cancelSaleRecord(id){
  const target=state.sales.find(x=>String(x.id)===String(id));
  if(!target)throw new Error('العملية غير موجودة.');
  if(state.profile?.role!=='owner'){
    if(target.createdBy!==state.user?.uid)throw new Error('لا يمكنك إلغاء عملية ليست لك.');
    if(target.status!=='pending')throw new Error('يمكن طلب إلغاء العملية المعلّقة فقط.');
    await submitChangeRequest(target,'cancel');
    return {requestSubmitted:true};
  }
  return runTransaction(db,async tx=>{
    const sref=doc(db,'sales',id),stref=doc(db,'publicStats','current');
    const ss=await tx.get(sref);
    if(!ss.exists())throw new Error('العملية غير موجودة.');
    const sale=ss.data();
    if(sale.requestType)throw new Error('لا يمكن إلغاء طلب تغيير بهذه الطريقة.');
    if(sale.status==='cancelled')return;
    const patch={
      status:'cancelled',
      cancelledAt:serverTimestamp(),
      cancelledBy:state.user.uid,
      cancelledByEmail:state.user.email,
      updatedAt:serverTimestamp(),
      auditTrail:appendAudit(sale,{action:'cancelled',at:new Date().toISOString(),actor:actorInfo(),before:saleSnapshot(id,sale)})
    };
    if(sale.status==='approved'){
      const st=await tx.get(stref),data=st.data()||{},cur=Number(data.stockDiamonds||0);
      const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
      tx.set(stref,{
        stockDiamonds:cur+Number(sale.diamonds||0),
        approvedSales:current.filter(x=>String(x.id)!==String(id)),
        lastUpdatedAt:serverTimestamp(),
        approvedSalesUpdatedAt:serverTimestamp()
      },{merge:true});
    }
    tx.update(sref,patch);
  });
}

const api={
  state,
  role:()=>state.profile?.role||'loading',
  mine:()=>{const regular=state.sales.filter(x=>!x.requestType);return state.profile?.role==='owner'?regular:regular.filter(x=>x.status==='approved'||x.createdBy===state.user?.uid)},
  changeRequests:()=>state.sales.filter(x=>x.requestType),
  logout:()=>signOut(auth),
  addSale:async d=>addDoc(collection(db,'sales'),{...d,status:'pending',createdBy:state.user.uid,createdByName:(state.profile.name&&!String(state.profile.name).includes('@')?state.profile.name:(state.user.displayName||String(state.user.email||'').split('@')[0])),createdByEmail:state.user.email,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}),
  updateSale:updateSaleRecord,
  cancelSale:cancelSaleRecord,
  addPurchase:async d=>runTransaction(db,async tx=>{const sref=doc(db,'publicStats','current'),pref=doc(collection(db,'purchases')),ss=await tx.get(sref),cur=Number(ss.data()?.stockDiamonds||0);tx.set(pref,{...d,createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()});tx.set(sref,{stockDiamonds:cur+Number(d.diamonds||0),lastUpdatedAt:serverTimestamp()},{merge:true});}),
  addExpense:async d=>addDoc(collection(db,'expenses'),{...d,createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()}),
  decide:async(id,status,reason='')=>runTransaction(db,async tx=>{
    reason=String(reason||'').trim();
    if(status==='rejected'&&!reason)throw new Error('سبب الرفض مطلوب.');
    const sref=doc(db,'sales',id),stref=doc(db,'publicStats','current'),ss=await tx.get(sref);
    if(!ss.exists())throw new Error('العملية غير موجودة');
    const sale=ss.data();
    if(sale.status!=='pending')return;
    if(sale.requestType){
      const requestPatch={status,approvedBy:state.user.uid,approvedByEmail:state.user.email,approvedAt:serverTimestamp(),updatedAt:serverTimestamp(),rejectionReason:status==='rejected'?reason:''};
      if(status==='approved'){
        const targetRef=doc(db,'sales',sale.targetSaleId),targetSnap=await tx.get(targetRef);
        if(!targetSnap.exists())throw new Error('العملية الأصلية غير موجودة.');
        const target=targetSnap.data();
        if(sale.requestType==='edit'){
          const next=cleanSaleInput(sale.proposedSale||{});
          if(!next.saleDate||next.diamonds<=0)throw new Error('بيانات التعديل غير صحيحة.');
          const targetPatch={...next,updatedAt:serverTimestamp(),lastEditedBy:state.user.uid,lastEditedByEmail:state.user.email};
          targetPatch.auditTrail=appendAudit(target,{action:'edit_request_approved',at:new Date().toISOString(),actor:actorInfo(),requestId:id,before:saleSnapshot(sale.targetSaleId,target),after:{...saleSnapshot(sale.targetSaleId,{...target,...next}),status:target.status}});
          if(target.status==='approved'){
            const st=await tx.get(stref),data=st.data()||{},cur=Number(data.stockDiamonds||0);
            const newStock=cur+Number(target.diamonds||0)-Number(next.diamonds||0);
            if(newStock<0)throw new Error('المخزون غير كافٍ بعد التعديل.');
            const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
            const approvedSales=[approvedSummary({id:sale.targetSaleId,...target,...targetPatch,status:'approved'}),...current.filter(x=>String(x.id)!==String(sale.targetSaleId))].slice(0,500);
            tx.set(stref,{stockDiamonds:newStock,approvedSales,lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
          }
          tx.update(targetRef,targetPatch);
        }else if(sale.requestType==='cancel'){
          if(target.status==='approved'){
            const st=await tx.get(stref),data=st.data()||{},cur=Number(data.stockDiamonds||0);
            const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
            tx.set(stref,{stockDiamonds:cur+Number(target.diamonds||0),approvedSales:current.filter(x=>String(x.id)!==String(sale.targetSaleId)),lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
          }
          tx.update(targetRef,{
            status:'cancelled',
            cancelledAt:serverTimestamp(),
            cancelledBy:state.user.uid,
            cancelledByEmail:state.user.email,
            updatedAt:serverTimestamp(),
            auditTrail:appendAudit(target,{action:'cancel_request_approved',at:new Date().toISOString(),actor:actorInfo(),requestId:id,before:saleSnapshot(sale.targetSaleId,target)})
          });
        }
      }
      tx.update(sref,requestPatch);
      return;
    }
    const patch={status,approvedBy:state.user.uid,approvedByEmail:state.user.email,approvedAt:serverTimestamp(),updatedAt:serverTimestamp(),rejectionReason:status==='rejected'?reason:''};
    if(status==='approved'){
      const st=await tx.get(stref),data=st.data()||{},cur=Number(data.stockDiamonds||0),qty=Number(sale.diamonds||0);
      if(cur<qty)throw new Error('المخزون غير كافٍ');
      const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
      const summary=approvedSummary({id,...sale,status:'approved'});
      const approvedSales=[summary,...current.filter(x=>String(x.id)!==String(id))].slice(0,500);
      tx.set(stref,{stockDiamonds:cur-qty,approvedSales,lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
      patch.stockDeducted=qty;
    }
    tx.update(sref,patch);
  }),
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
if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js?v=25.12.0').catch(console.warn)}

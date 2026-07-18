import { firebaseConfig, OWNER_EMAIL } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, runTransaction, writeBatch } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { user:null, profile:null, sales:[], purchases:[], expenses:[], stockMovements:[], users:[], stats:{stockDiamonds:0}, ready:false, sync:{status:navigator.onLine?'connected':'offline',lastSync:null} };

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
    listeners.push(onSnapshot(query(collection(db,'sales'),orderBy('createdAt','desc')),s=>{
      state.sales=s.docs.map(d=>({id:d.id,...d.data()}));
      state.sync={status:'connected',lastSync:new Date().toISOString()};
      syncApprovedSnapshot(state.sales);
      notify();
    }));
  }else{
    listeners.push(onSnapshot(query(collection(db,'sales'),where('createdBy','==',state.user.uid)),s=>{
      ownSales.clear();
      for(const d of s.docs)ownSales.set(d.id,{id:d.id,...d.data()});
      state.sync={status:'connected',lastSync:new Date().toISOString()};
      publishSupervisor();
    },e=>console.error('own sales subscription',e)));
  }

  if(state.profile.role==='owner'){
    listeners.push(onSnapshot(query(collection(db,'purchases'),orderBy('createdAt','desc')),s=>{state.purchases=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
    listeners.push(onSnapshot(query(collection(db,'expenses'),orderBy('createdAt','desc')),s=>{state.expenses=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
    listeners.push(onSnapshot(query(collection(db,'stockMovements'),orderBy('createdAt','desc')),s=>{state.stockMovements=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
    listeners.push(onSnapshot(query(collection(db,'users'),orderBy('createdAt','desc')),s=>{state.users=s.docs.map(d=>({id:d.id,...d.data()}));state.sync={status:'connected',lastSync:new Date().toISOString()};notify();}));
  }
}


const cleanText=(value,max=500)=>String(value||'').trim().slice(0,max);
const cleanSaleInput=d=>({
  saleDate:String(d.saleDate||'').slice(0,10),
  diamonds:Number(d.diamonds||0),
  amount:Number(d.amount||0),
  payment:cleanText(d.payment||'المتجر',40),
  reference:cleanText(d.reference,120),
  notes:cleanText(d.notes,1000)
});
const stockMovement=(type,quantity,before,after,sourceId,extra={})=>({
  type,
  quantity:Number(quantity||0),
  balanceBefore:Number(before||0),
  balanceAfter:Number(after||0),
  sourceId:String(sourceId||''),
  actor:actorInfo(),
  createdAt:serverTimestamp(),
  ...extra
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
      const mref=doc(collection(db,'stockMovements'));
      tx.set(mref,stockMovement('sale_edit',Number(old.diamonds||0)-Number(next.diamonds||0),cur,newStock,id,{saleId:id,orderNumber:String(old.orderNumber||''),reason:'تعديل عملية معتمدة'}));
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
      const newStock=cur+Number(sale.diamonds||0);
      tx.set(stref,{
        stockDiamonds:newStock,
        approvedSales:current.filter(x=>String(x.id)!==String(id)),
        lastUpdatedAt:serverTimestamp(),
        approvedSalesUpdatedAt:serverTimestamp()
      },{merge:true});
      const mref=doc(collection(db,'stockMovements'));
      tx.set(mref,stockMovement('sale_cancel',Number(sale.diamonds||0),cur,newStock,id,{saleId:id,orderNumber:String(sale.orderNumber||''),reason:'إلغاء عملية معتمدة'}));
    }
    tx.update(sref,patch);
  });
}

/* =========================================================
   Broadcaster Cloud Store — v44
   Firestore is the source of truth; localStorage is only cache.
   ========================================================= */
const BC_COLLECTIONS={
  broadcast:'broadcasterCommissions',
  aliases:'broadcasterAliases',
  imports:'importBatches',
  locks:'lockedMonths'
};
const broadcasterCloudState={
  ready:false,
  syncing:false,
  data:{broadcast:[],aliases:[],imports:[],locks:[],settings:{}},
  queue:Promise.resolve()
};
const plainValue=value=>{
  if(value===undefined)return null;
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(plainValue);
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(v!==undefined)out[k]=plainValue(v);
  }
  return out;
};
const stableValue=value=>{
  if(Array.isArray(value))return value.map(stableValue);
  if(value&&typeof value==='object'){
    const out={};
    for(const k of Object.keys(value).sort())out[k]=stableValue(value[k]);
    return out;
  }
  return value;
};
const stableJSON=value=>JSON.stringify(stableValue(plainValue(value)));
const safeDocId=(prefix,row,index)=>{
  const raw=String(row?.id||row?.month||`${prefix}_${index}`).trim();
  const clean=raw.replace(/[\/#?\[\]]/g,'_').slice(0,140);
  return clean||`${prefix}_${index}`;
};
const checksum32=value=>{
  const s=stableJSON(value);
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
};
async function commitOperations(ops){
  for(let i=0;i<ops.length;i+=400){
    const batch=writeBatch(db);
    for(const op of ops.slice(i,i+400)){
      if(op.type==='delete')batch.delete(op.ref);
      else batch.set(op.ref,op.data,{merge:false});
    }
    await batch.commit();
  }
}
async function readCollectionRows(name){
  const snap=await getDocs(collection(db,name));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function readBroadcasterCloud(){
  const [broadcast,aliases,imports,lockDocs,settingsSnap]=await Promise.all([
    readCollectionRows(BC_COLLECTIONS.broadcast),
    readCollectionRows(BC_COLLECTIONS.aliases),
    readCollectionRows(BC_COLLECTIONS.imports),
    readCollectionRows(BC_COLLECTIONS.locks),
    getDoc(doc(db,'appSettings','current'))
  ]);
  const locks=lockDocs.map(x=>String(x.month||x.id)).filter(Boolean).sort();
  return {
    broadcast:broadcast.sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    aliases:aliases.sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    imports:imports.sort((a,b)=>String(a.ts||'').localeCompare(String(b.ts||''))),
    locks,
    settings:settingsSnap.exists()?plainValue(settingsSnap.data()):{}
  };
}
async function replaceCloudRows(kind,rows){
  const collectionName=BC_COLLECTIONS[kind];
  if(!collectionName)throw new Error('نوع بيانات المذيعين غير معروف.');
  const cleanRows=Array.isArray(rows)?rows.map(plainValue):[];
  const current=Array.isArray(broadcasterCloudState.data[kind])?broadcasterCloudState.data[kind]:[];
  const currentMap=new Map(current.map((row,index)=>[safeDocId(kind,row,index),row]));
  const nextMap=new Map(cleanRows.map((row,index)=>[safeDocId(kind,row,index),row]));
  const ops=[];
  for(const [id,row] of nextMap){
    if(stableJSON(currentMap.get(id))!==stableJSON(row)){
      ops.push({type:'set',ref:doc(db,collectionName,id),data:{...row,id}});
    }
  }
  for(const id of currentMap.keys()){
    if(!nextMap.has(id))ops.push({type:'delete',ref:doc(db,collectionName,id)});
  }
  await commitOperations(ops);
  broadcasterCloudState.data[kind]=cleanRows;
  return {writes:ops.filter(x=>x.type==='set').length,deletes:ops.filter(x=>x.type==='delete').length};
}
async function replaceCloudLocks(locks){
  const rows=[...new Set((locks||[]).map(String).filter(Boolean))].sort().map(month=>({id:month,month}));
  return replaceCloudRows('locks',rows);
}
async function saveBroadcasterCloudDataset(kind,value){
  if(state.profile?.role!=='owner')throw new Error('هذه العملية متاحة للمالك فقط.');
  broadcasterCloudState.queue=broadcasterCloudState.queue.then(async()=>{
    broadcasterCloudState.syncing=true;
    try{
      let result;
      if(kind==='settings'){
        const clean=plainValue(value||{});
        if(stableJSON(clean)!==stableJSON(broadcasterCloudState.data.settings||{})){
          await setDoc(doc(db,'appSettings','current'),clean,{merge:false});
          broadcasterCloudState.data.settings=clean;
          result={writes:1,deletes:0};
        }else result={writes:0,deletes:0};
      }else if(kind==='locks'){
        result=await replaceCloudLocks(value);
        broadcasterCloudState.data.locks=[...new Set((value||[]).map(String).filter(Boolean))].sort();
      }else{
        result=await replaceCloudRows(kind,value);
      }
      return result;
    }finally{
      broadcasterCloudState.syncing=false;
    }
  });
  return broadcasterCloudState.queue;
}
async function migrateBroadcasterCloud(localPayload){
  if(state.profile?.role!=='owner')throw new Error('الترحيل متاح للمالك فقط.');
  const markerRef=doc(db,'migrations','broadcaster_v44');
  const marker=await getDoc(markerRef);
  if(marker.exists()&&marker.data()?.status==='complete'){
    const cloud=await readBroadcasterCloud();
    broadcasterCloudState.data=cloud;
    broadcasterCloudState.ready=true;
    return {source:'cloud',alreadyMigrated:true,data:cloud,verification:marker.data()?.verification||{}};
  }

  const local={
    broadcast:Array.isArray(localPayload?.broadcast)?plainValue(localPayload.broadcast):[],
    aliases:Array.isArray(localPayload?.aliases)?plainValue(localPayload.aliases):[],
    imports:Array.isArray(localPayload?.imports)?plainValue(localPayload.imports):[],
    locks:Array.isArray(localPayload?.locks)?plainValue(localPayload.locks):[],
    settings:plainValue(localPayload?.settings||{})
  };
  await setDoc(markerRef,{
    status:'running',
    version:'v44',
    startedAt:serverTimestamp(),
    ownerUid:state.user.uid,
    localCounts:{
      broadcast:local.broadcast.length,
      aliases:local.aliases.length,
      imports:local.imports.length,
      locks:local.locks.length
    },
    localChecksums:{
      broadcast:checksum32(local.broadcast),
      aliases:checksum32(local.aliases),
      imports:checksum32(local.imports),
      locks:checksum32(local.locks),
      settings:checksum32(local.settings)
    }
  },{merge:true});

  broadcasterCloudState.data={broadcast:[],aliases:[],imports:[],locks:[],settings:{}};
  await replaceCloudRows('broadcast',local.broadcast);
  await replaceCloudRows('aliases',local.aliases);
  await replaceCloudRows('imports',local.imports);
  await replaceCloudLocks(local.locks);
  await setDoc(doc(db,'appSettings','current'),local.settings,{merge:false});

  const cloud=await readBroadcasterCloud();
  const verification={
    counts:{
      local:{broadcast:local.broadcast.length,aliases:local.aliases.length,imports:local.imports.length,locks:local.locks.length},
      cloud:{broadcast:cloud.broadcast.length,aliases:cloud.aliases.length,imports:cloud.imports.length,locks:cloud.locks.length}
    },
    checksums:{
      local:{
        broadcast:checksum32(local.broadcast),aliases:checksum32(local.aliases),
        imports:checksum32(local.imports),locks:checksum32(local.locks),settings:checksum32(local.settings)
      },
      cloud:{
        broadcast:checksum32(cloud.broadcast),aliases:checksum32(cloud.aliases),
        imports:checksum32(cloud.imports),locks:checksum32(cloud.locks),settings:checksum32(cloud.settings)
      }
    }
  };
  const countOK=Object.keys(verification.counts.local).every(k=>verification.counts.local[k]===verification.counts.cloud[k]);
  const checksumOK=Object.keys(verification.checksums.local).every(k=>verification.checksums.local[k]===verification.checksums.cloud[k]);
  if(!countOK||!checksumOK){
    await setDoc(markerRef,{status:'verification_failed',verification,failedAt:serverTimestamp()},{merge:true});
    throw new Error('فشل التحقق من تطابق بيانات المذيعين بعد الرفع.');
  }

  await setDoc(markerRef,{
    status:'complete',
    completedAt:serverTimestamp(),
    version:'v44',
    verification
  },{merge:true});
  broadcasterCloudState.data=cloud;
  broadcasterCloudState.ready=true;
  return {source:'migration',alreadyMigrated:false,data:cloud,verification};
}
function subscribeBroadcasterCloud(){
  if(state.profile?.role!=='owner')return;
  const emit=()=>window.dispatchEvent(new CustomEvent('dot-broadcaster-cloud-update',{detail:plainValue(broadcasterCloudState.data)}));
  const bindRows=(kind,name,transform=null)=>{
    listeners.push(onSnapshot(collection(db,name),snap=>{
      let rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      broadcasterCloudState.data[kind]=transform?transform(rows):rows;
      if(broadcasterCloudState.ready)emit();
    },e=>console.error(`broadcaster ${kind} subscription`,e)));
  };
  bindRows('broadcast',BC_COLLECTIONS.broadcast);
  bindRows('aliases',BC_COLLECTIONS.aliases);
  bindRows('imports',BC_COLLECTIONS.imports);
  bindRows('locks',BC_COLLECTIONS.locks,rows=>rows.map(x=>String(x.month||x.id)).filter(Boolean).sort());
  listeners.push(onSnapshot(doc(db,'appSettings','current'),snap=>{
    broadcasterCloudState.data.settings=snap.exists()?plainValue(snap.data()):{};
    if(broadcasterCloudState.ready)emit();
  },e=>console.error('broadcaster settings subscription',e)));
}


const api={
  state,
  broadcasterCloud:broadcasterCloudState,
  migrateBroadcasterData:migrateBroadcasterCloud,
  saveBroadcasterDataset:saveBroadcasterCloudDataset,
  role:()=>state.profile?.role||'loading',
  mine:()=>{const regular=state.sales.filter(x=>!x.requestType);return state.profile?.role==='owner'?regular:regular.filter(x=>x.status==='approved'||x.createdBy===state.user?.uid)},
  changeRequests:()=>state.sales.filter(x=>x.requestType),
  logout:()=>signOut(auth),
  addSale:async d=>{const clean=cleanSaleInput(d);return addDoc(collection(db,'sales'),{...clean,orderNumber:cleanText(d.orderNumber,80),status:'pending',createdBy:state.user.uid,createdByName:(state.profile.name&&!String(state.profile.name).includes('@')?state.profile.name:(state.user.displayName||String(state.user.email||'').split('@')[0])),createdByEmail:state.user.email,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});},
  updateSale:updateSaleRecord,
  cancelSale:cancelSaleRecord,
  addPurchase:async d=>runTransaction(db,async tx=>{const sref=doc(db,'publicStats','current'),pref=doc(collection(db,'purchases')),mref=doc(collection(db,'stockMovements')),ss=await tx.get(sref),cur=Number(ss.data()?.stockDiamonds||0),qty=Number(d.diamonds||0),newStock=cur+qty;tx.set(pref,{...d,supplier:cleanText(d.supplier,160),notes:cleanText(d.notes,1000),createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()});tx.set(sref,{stockDiamonds:newStock,lastUpdatedAt:serverTimestamp()},{merge:true});tx.set(mref,stockMovement('purchase',qty,cur,newStock,pref.id,{purchaseId:pref.id,supplier:cleanText(d.supplier,160),amount:Number(d.amount||0)}));}),
  addExpense:async d=>addDoc(collection(db,'expenses'),{...d,category:cleanText(d.category,80),payee:cleanText(d.payee,160),payment:cleanText(d.payment,80),reference:cleanText(d.reference,120),createdBy:state.user.uid,createdByEmail:state.user.email,createdAt:serverTimestamp()}),
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
            const mref=doc(collection(db,'stockMovements'));
            tx.set(mref,stockMovement('sale_edit_request',Number(target.diamonds||0)-Number(next.diamonds||0),cur,newStock,sale.targetSaleId,{saleId:sale.targetSaleId,requestId:id,orderNumber:String(target.orderNumber||''),reason:'اعتماد طلب تعديل'}));
          }
          tx.update(targetRef,targetPatch);
        }else if(sale.requestType==='cancel'){
          if(target.status==='approved'){
            const st=await tx.get(stref),data=st.data()||{},cur=Number(data.stockDiamonds||0);
            const current=Array.isArray(data.approvedSales)?data.approvedSales:[];
            const newStock=cur+Number(target.diamonds||0);
            tx.set(stref,{stockDiamonds:newStock,approvedSales:current.filter(x=>String(x.id)!==String(sale.targetSaleId)),lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
            const mref=doc(collection(db,'stockMovements'));
            tx.set(mref,stockMovement('sale_cancel_request',Number(target.diamonds||0),cur,newStock,sale.targetSaleId,{saleId:sale.targetSaleId,requestId:id,orderNumber:String(target.orderNumber||''),reason:'اعتماد طلب إلغاء'}));
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
      const newStock=cur-qty;
      tx.set(stref,{stockDiamonds:newStock,approvedSales,lastUpdatedAt:serverTimestamp(),approvedSalesUpdatedAt:serverTimestamp()},{merge:true});
      const mref=doc(collection(db,'stockMovements'));
      tx.set(mref,stockMovement('sale_approved',-qty,cur,newStock,id,{saleId:id,orderNumber:String(sale.orderNumber||''),amount:Number(sale.amount||0)}));
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
  state.ready=true;subscribe();subscribeBroadcasterCloud();notify();window.dispatchEvent(new CustomEvent('dot-cloud-ready',{detail:state}));
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).catch(()=>{});
}
if('caches' in window){
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});
}

import { firebaseConfig, OWNER_UID, EMAIL_DOMAIN } from './config.js?v=1';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, collection, query, where, serverTimestamp, writeBatch, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ========== Firebase ========== */
const fbApp = initializeApp(firebaseConfig);
let auth;
try { auth = initializeAuth(fbApp, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }); } catch (e) { auth = getAuth(fbApp); }
let db;
try { db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); } catch (e) { db = initializeFirestore(fbApp, {}); }
const C = { clients: 'uk_clients', camps: 'uk_campaigns', sent: 'uk_sent', users: 'uk_users', set: 'uk_settings' };

/* ========== helpers ========== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toEn = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const normUser = s => toEn(String(s ?? '')).replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\s_.\-]+/g, '').toLowerCase();
const USER_OK = /^[a-z0-9ء-ي]{2,24}$/;
function toEmail(user) {
  const n = normUser(user);
  if (/^[a-z0-9]+$/.test(n)) return n + '@' + EMAIL_DOMAIN;
  let host = n; try { host = new URL('http://' + n + '.x').hostname.slice(0, -2); } catch (e) { }
  return 'u.' + host.replace(/^xn--/, '') + '@' + EMAIL_DOMAIN;
}
function authMsg(e) {
  const c = e && e.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-email')) return 'اسم المستخدم أو كلمة السر غير صحيحة';
  if (c.includes('too-many-requests')) return 'محاولات كتير، استنى دقايق وجرب تاني';
  if (c.includes('network')) return 'مفيش اتصال بالإنترنت';
  if (c.includes('weak-password')) return 'كلمة السر لازم تكون ٦ حروف أو أرقام على الأقل';
  if (c.includes('email-already-in-use')) return 'اسم المستخدم ده مستخدم قبل كده';
  if (c.includes('permission')) return 'مش مسموحلك بالعملية دي. اتأكد إن قواعد Firebase اتحدثت';
  return 'حصلت مشكلة، جرب تاني';
}
// رقم سعودي: 05xxxxxxxx / 5xxxxxxxx / +9665… / 009665… ← 9665xxxxxxxx
function normPhone(s) {
  let d = toEn(s).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  d = d.replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = '966' + d;
  else if (/^9660\d{9}$/.test(d)) d = '966' + d.slice(4);
  return /^\d{10,15}$/.test(d) ? d : '';
}
const showPhone = p => p && p.startsWith('966') && p.length === 12 ? '0' + p.slice(3, 5) + ' ' + p.slice(5, 8) + ' ' + p.slice(8) : '+' + p;
const RIYADH = 3 * 3600000;
const dayKey = (ms = Date.now()) => new Date(ms + RIYADH).toISOString().slice(0, 10);
const tsMs = t => t ? (t.toMillis ? t.toMillis() : (t.seconds ? t.seconds * 1000 : +t)) : 0;
const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d}/${+m}/${y}`; };
const fmtTs = t => { const ms = tsMs(t); if (!ms) return ''; const d = new Date(ms + RIYADH); return `${d.getUTCDate()}/${d.getUTCMonth() + 1} — ${((d.getUTCHours() + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, '0')} ${d.getUTCHours() < 12 ? 'ص' : 'م'}`; };
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
const initials = n => { const p = String(n || '').trim().split(/\s+/); return (p[0]?.[0] || '؟') + (p[1]?.[0] || ''); };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const native = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
let WaShareP = null;
const WaShare = () => { if (WaShareP) return WaShareP; try { const C = window.Capacitor; WaShareP = native() && C.registerPlugin ? C.registerPlugin('WaShare') : null; } catch (e) { WaShareP = null; } return WaShareP; };

const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/></svg>',
  mega: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
};

/* ========== state ========== */
const S = {
  user: null, role: null, myName: '', view: lsGet('uk.view', 'home'),
  clients: {}, camps: {}, users: {}, set: { types: [], plats: [], waPkg: 'auto' },
  sec: lsGet('uk.sec', 'social'), q: '', f: { type: '', status: '', plat: '', ok: '' },
  unsub: [], ready: false,
};
const DEF_TYPES = ['رخصة بناء', 'تصميم معماري', 'تصميم إنشائي', 'إشراف هندسي', 'رفع مساحي', 'دفاع مدني وسلامة', 'إلكتروميكانيك', 'تصميم 3D وواجهات', 'ترميم وتعديل', 'استشارة'];
const DEF_PLATS = ['تيك توك', 'إنستجرام', 'سناب شات', 'إكس', 'فيسبوك', 'يوتيوب', 'جوجل', 'واتساب', 'أخرى'];
const STATUS = { new: 'جديد', old: 'قديم', rep: 'متكرر' };
const SEC = { social: 'السوشيال ميديا', office: 'عملاء المكتب' };
const can = {
  send: () => S.role === 'owner' || S.role === 'sender',
  admin: () => S.role === 'owner',
  del: () => S.role === 'owner' || S.role === 'sender',
};
const types = () => (S.set.types && S.set.types.length ? S.set.types : DEF_TYPES);
const plats = () => (S.set.plats && S.set.plats.length ? S.set.plats : DEF_PLATS);

/* ========== theme ========== */
function applyTheme() {
  const t = lsGet('uk.theme', '');
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#141416' : '#f4f2ee';
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ========== toast & sheet ========== */
let toastT;
function toast(msg, ms = 2600) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
function sheet(html, { onClose } = {}) {
  closeSheet();
  const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div class="pane" role="dialog" aria-modal="true">${html}</div>`;
  s.addEventListener('click', e => { if (e.target === s) closeSheet(); });
  s._onClose = onClose; document.body.appendChild(s); document.body.style.overflow = 'hidden';
  const x = s.querySelector('[data-close]'); x && x.addEventListener('click', closeSheet);
  return s.querySelector('.pane');
}
function closeSheet() { const s = $('.sheet'); if (s) { s._onClose && s._onClose(); s.remove(); document.body.style.overflow = ''; } }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
function confirmBox(title, body, okText, danger = true, extra = '') {
  return new Promise(res => {
    const p = sheet(`<div class="hd"><h2>${title}</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div><div>${body}</div>${extra}<div class="row"><button class="btn ${danger ? 'red' : 'wa'} grow" id="cfOk">${okText}</button><button class="btn line grow" id="cfNo">إلغاء</button></div>`, { onClose: () => res(false) });
    p.querySelector('#cfNo').onclick = () => closeSheet();
    p.querySelector('#cfOk').onclick = () => { const v = extra ? [...p.querySelectorAll('input')].map(i => i.type === 'checkbox' ? i.checked : i.value) : true; const s = $('.sheet'); s._onClose = null; closeSheet(); res(v); };
  });
}

/* ========== login ========== */
function renderLogin(msg = '') {
  $('#app').innerHTML = `<div class="login"><form class="card" id="lf" novalidate>
    <img src="logo-192.png" alt="">
    <div><h1>عملائك</h1><p class="muted" style="text-align:center;margin:4px 0 0">شركة سعد مفرح الشمراني للاستشارات الهندسية</p></div>
    <label class="f">اسم المستخدم<input id="lu" autocomplete="username" required></label>
    <label class="f">كلمة السر<input id="lp" type="password" autocomplete="current-password" required></label>
    <div class="err" id="le">${esc(msg)}</div>
    <button class="btn red block" id="lb">دخول</button>
    <p class="muted" style="font-size:13px;text-align:center;margin:0">ادخل بنفس اسم المستخدم وكلمة السر بتوع تطبيق البصمة، أو الحساب اللي المدير عملهولك.</p>
  </form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const u = $('#lu').value.trim(), p = $('#lp').value;
    if (!u || !p) { $('#le').textContent = 'اكتب اسم المستخدم وكلمة السر'; return; }
    $('#lb').disabled = true; $('#le').textContent = '';
    try { await signInWithEmailAndPassword(auth, toEmail(u), p); } catch (er) { $('#le').textContent = authMsg(er); $('#lb').disabled = false; }
  };
}

/* ========== boot ========== */
onAuthStateChanged(auth, async u => {
  S.unsub.forEach(f => f()); S.unsub = []; S.ready = false;
  if (!u) { S.user = null; renderLogin(); return; }
  S.user = u;
  if (u.uid === OWNER_UID) { S.role = 'owner'; S.myName = 'الإدارة'; }
  else {
    let d = null; try { d = await getDoc(doc(db, C.users, u.uid)); } catch (e) { }
    const v = d && d.exists() ? d.data() : null;
    if (!v || v.active === false) { await signOut(auth); renderLogin('الحساب ده مش متضاف في «عملائك». اطلب من المدير يضيفك.'); return; }
    S.role = v.role === 'sender' ? 'sender' : 'staff'; S.myName = v.name || '';
  }
  shell(); subscribe();
});

function subscribe() {
  const err = e => { console.error(e); if (String(e && e.code).includes('permission')) toast('مفيش صلاحية لقراءة البيانات. حدّث قواعد Firebase', 5000); };
  S.unsub.push(onSnapshot(collection(db, C.clients), s => { const m = {}; s.forEach(d => m[d.id] = { id: d.id, ...d.data() }); S.clients = m; S.ready = true; render(); }, err));
  S.unsub.push(onSnapshot(doc(db, C.set, 'main'), d => { S.set = { types: [], plats: [], waPkg: 'auto', ...(d.exists() ? d.data() : {}) }; render(); }, err));
  if (can.send()) S.unsub.push(onSnapshot(collection(db, C.camps), s => { const m = {}; s.forEach(d => m[d.id] = { id: d.id, ...d.data() }); S.camps = m; render(); }, err));
  if (can.admin()) S.unsub.push(onSnapshot(collection(db, C.users), s => { const m = {}; s.forEach(d => m[d.id] = { id: d.id, ...d.data() }); S.users = m; if (S.view === 'set') render(); }, err));
}

/* ========== shell ========== */
const TABS = () => [['home', 'الرئيسية', I.home], ['clients', 'العملاء', I.users], ...(can.send() ? [['ads', 'الإعلانات', I.mega]] : []), ['follow', 'المتابعات', I.bell], ['set', 'الإعدادات', I.gear]];
function shell() {
  if (!TABS().some(t => t[0] === S.view)) S.view = 'home';
  $('#app').innerHTML = `<header class="top"><div class="wrap"><img src="logo-192.png" alt=""><div><h1>عملائك</h1><small>شركة الشمراني${S.myName ? ' — ' + esc(S.myName) : ''}</small></div><span class="sp"></span><button class="ib" id="thBtn" aria-label="تغيير المظهر">${I.moon}</button></div></header>
  <main><div class="wrap" id="main"></div></main>
  <nav class="nav"><div class="wrap">${TABS().map(([k, l, ic]) => `<button data-tab="${k}" class="${S.view === k ? 'on' : ''}">${ic}<span>${l}</span><span class="dot" data-dot="${k}" hidden></span></button>`).join('')}</div></nav>
  <button class="fab" id="fab" aria-label="إضافة عميل">${I.plus}</button>`;
  $$('.nav [data-tab]').forEach(b => b.onclick = () => { S.view = b.dataset.tab; lsSet('uk.view', S.view); $$('.nav [data-tab]').forEach(x => x.classList.toggle('on', x === b)); scrollTo(0, 0); render(); });
  $('#thBtn').onclick = () => { lsSet('uk.theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); applyTheme(); };
  $('#fab').onclick = () => clientForm();
  render();
}
function render() {
  const m = $('#main'); if (!m || !S.user) return;
  if (sending.active) return; // شاشة الإرسال مفتوحة
  const due = followDue().length, dot = $('[data-dot="follow"]'); if (dot) { dot.hidden = !due; dot.textContent = due; }
  $('#fab').hidden = !(S.view === 'clients' || S.view === 'home');
  ({ home: vHome, clients: vClients, ads: vAds, follow: vFollow, set: vSet }[S.view] || vHome)(m);
}

/* ========== home ========== */
function vHome(m) {
  const all = Object.values(S.clients), today = dayKey(), mon = today.slice(0, 7);
  const soc = all.filter(c => c.sec !== 'office').length, off = all.length - soc;
  const newM = all.filter(c => (c.first || '').startsWith(mon) || dayKey(tsMs(c.createdAt) || 0).startsWith(mon)).length;
  const cnt = {}; all.forEach(c => (c.types || []).forEach(t => cnt[t] = (cnt[t] || 0) + 1));
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6), mx = top[0]?.[1] || 1;
  const pc = {}; all.filter(c => c.sec !== 'office').forEach(c => { const p = c.plat || 'غير محدد'; pc[p] = (pc[p] || 0) + 1; });
  const ptop = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 5), pmx = ptop[0]?.[1] || 1;
  const due = followDue();
  const camps = Object.values(S.camps).sort((a, b) => tsMs(b.created) - tsMs(a.created)).slice(0, 3);
  m.innerHTML = `<div class="view">
   <div class="stats">
    <div class="stat r"><b>${all.length}</b><span>كل العملاء</span></div>
    <div class="stat"><b>${soc}</b><span>السوشيال ميديا</span></div>
    <div class="stat"><b>${off}</b><span>عملاء المكتب</span></div>
    <div class="stat"><b>${newM}</b><span>جدد الشهر ده</span></div>
   </div>
   ${due.length ? `<div class="card"><div class="sec-t"><h3>متابعات النهارده (${due.length})</h3><button class="btn sm line" data-go="follow">كل المتابعات</button></div><div class="list" style="margin-top:10px">${due.slice(0, 3).map(clientRow).join('')}</div></div>` : ''}
   <div class="grid2">
    <div class="card"><h3 style="margin-bottom:10px">أكتر أنواع المعاملات</h3>${top.length ? `<div class="bars">${top.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><span class="tr"><i style="width:${Math.max(4, v / mx * 100)}%"></i></span><em>${v}</em></div>`).join('')}</div>` : '<p class="muted" style="margin:0">لما تضيف عملاء هيظهر هنا توزيع المعاملات.</p>'}</div>
    <div class="card"><h3 style="margin-bottom:10px">منين بييجي عملاء السوشيال</h3>${ptop.length ? `<div class="bars">${ptop.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><span class="tr"><i style="width:${Math.max(4, v / pmx * 100)}%;background:var(--gray)"></i></span><em>${v}</em></div>`).join('')}</div>` : '<p class="muted" style="margin:0">مفيش عملاء سوشيال لسه.</p>'}</div>
   </div>
   ${can.send() ? `<div class="card"><div class="sec-t"><h3>آخر الإعلانات</h3><button class="btn sm red" id="hNew">${I.plus} إعلان جديد</button></div>${camps.length ? `<div class="list" style="margin-top:10px">${camps.map(campRow).join('')}</div>` : '<p class="muted" style="margin:8px 0 0">لسه مبعتش أي إعلان.</p>'}</div>` : ''}
   ${!all.length && S.ready ? `<div class="card empty"><b>ابدأ بإضافة أول عميل</b>اضغط زرار + تحت، أو استورد عملاءك القدام من ملف Excel من الإعدادات.</div>` : ''}
  </div>`;
  bindRows(m); $$('[data-go]', m).forEach(b => b.onclick = () => $(`.nav [data-tab="${b.dataset.go}"]`).click());
  const hn = $('#hNew', m); hn && (hn.onclick = () => campForm());
}

/* ========== clients ========== */
function matches(c, f = S.f, q = S.q) {
  if (f.type && !(c.types || []).includes(f.type)) return false;
  if (f.status && (c.status || 'new') !== f.status) return false;
  if (f.plat && c.plat !== f.plat) return false;
  if (f.ok === 'yes' && c.ok === false) return false;
  if (f.ok === 'no' && c.ok !== false) return false;
  if (q) { const s = normUser(q), d = toEn(q).replace(/\D/g, ''); const hay = normUser(`${c.name} ${c.need} ${c.notes} ${(c.types || []).join(' ')}`); if (!(hay.includes(s) || (d.length >= 3 && (c.phone || '').includes(d.replace(/^0/, ''))))) return false; }
  return true;
}
function clientRow(c) {
  const today = dayKey(), st = c.status || 'new';
  return `<div class="cl" data-cid="${esc(c.id)}">
   <div class="av ${c.sec === 'office' ? 'of' : ''}">${esc(initials(c.name))}</div>
   <div class="grow" data-open="${esc(c.id)}" style="cursor:pointer">
    <div class="nm">${esc(c.name || 'بدون اسم')}</div><div class="ph">${esc(showPhone(c.phone))}</div>
    ${c.need ? `<div class="need">${esc(c.need)}</div>` : ''}
    <div class="tags"><span class="tg ${st}">${STATUS[st]}</span>${c.sec === 'office' ? '<span class="tg">المكتب</span>' : `<span class="tg">${esc(c.plat || 'سوشيال')}</span>`}${(c.types || []).slice(0, 3).map(t => `<span class="tg">${esc(t)}</span>`).join('')}${c.ok === false ? '<span class="tg no">مش عايز إعلانات</span>' : ''}${c.lastDay === today ? '<span class="tg sent">اتبعتله النهارده</span>' : ''}</div>
   </div>
   <div class="acts"><a href="tel:+${esc(c.phone)}" aria-label="اتصال">${I.phone}</a><a class="w" href="https://wa.me/${esc(c.phone)}" target="_blank" rel="noopener" aria-label="واتساب">${I.wa}</a></div>
  </div>`;
}
function bindRows(r) { $$('[data-open]', r).forEach(e => e.onclick = () => clientView(e.dataset.open)); $$('[data-camp]', r).forEach(e => e.onclick = () => campView(e.dataset.camp)); }
function vClients(m) {
  const all = Object.values(S.clients);
  const nS = all.filter(c => c.sec !== 'office').length, nO = all.length - nS;
  const list = all.filter(c => (S.sec === 'all' || (S.sec === 'office' ? c.sec === 'office' : c.sec !== 'office')) && matches(c)).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
  const keepFocus = document.activeElement && document.activeElement.id === 'qIn';
  m.innerHTML = `<div class="view">
   <div class="seg" role="tablist"><button data-sec="social" class="${S.sec === 'social' ? 'on' : ''}">السوشيال ميديا<em>${nS}</em></button><button data-sec="office" class="${S.sec === 'office' ? 'on' : ''}">عملاء المكتب<em>${nO}</em></button><button data-sec="all" class="${S.sec === 'all' ? 'on' : ''}">الكل<em>${all.length}</em></button></div>
   <label class="search">${I.search}<input id="qIn" placeholder="دوّر بالاسم أو الرقم أو الطلب" value="${esc(S.q)}" aria-label="بحث"></label>
   <div class="filters">
    <select id="fType" aria-label="نوع المعاملة"><option value="">كل المعاملات</option>${types().map(t => `<option ${S.f.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <select id="fStatus" aria-label="الحالة"><option value="">كل الحالات</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${S.f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${S.sec !== 'office' ? `<select id="fPlat" aria-label="المنصة"><option value="">كل المنصات</option>${plats().map(t => `<option ${S.f.plat === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    <select id="fOk" aria-label="الإعلانات"><option value="">الإعلانات: الكل</option><option value="yes" ${S.f.ok === 'yes' ? 'selected' : ''}>موافق على الإعلانات</option><option value="no" ${S.f.ok === 'no' ? 'selected' : ''}>مش عايز إعلانات</option></select>
   </div>
   <div class="muted" style="font-size:13px">${list.length} عميل</div>
   <div class="list">${list.length ? list.slice(0, 300).map(clientRow).join('') : `<div class="card empty"><b>${all.length ? 'مفيش نتايج' : 'لسه مفيش عملاء'}</b>${all.length ? 'غيّر البحث أو الفلاتر.' : 'اضغط زرار + عشان تضيف أول عميل.'}</div>`}</div>
   ${list.length > 300 ? `<p class="muted" style="text-align:center">بيظهر أول 300. استخدم البحث عشان توصل للباقي.</p>` : ''}
  </div>`;
  $$('[data-sec]', m).forEach(b => b.onclick = () => { S.sec = b.dataset.sec; lsSet('uk.sec', S.sec); if (S.sec === 'office') S.f.plat = ''; render(); });
  const q = $('#qIn', m); q.oninput = () => { S.q = q.value; clearTimeout(q._t); q._t = setTimeout(render, 180); };
  if (keepFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  [['fType', 'type'], ['fStatus', 'status'], ['fPlat', 'plat'], ['fOk', 'ok']].forEach(([id, k]) => { const s = $('#' + id, m); s && (s.onchange = () => { S.f[k] = s.value; render(); }); });
  bindRows(m);
}

function clientForm(id = null) {
  const c = id ? S.clients[id] : { sec: S.sec === 'office' ? 'office' : 'social', status: 'new', ok: true, types: [], first: dayKey() };
  const p = sheet(`<div class="hd"><h2>${id ? 'تعديل عميل' : 'عميل جديد'}</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <form id="cf" class="view" novalidate>
    <div class="seg"><button type="button" data-s="social" class="${c.sec !== 'office' ? 'on' : ''}">السوشيال ميديا</button><button type="button" data-s="office" class="${c.sec === 'office' ? 'on' : ''}">عملاء المكتب</button></div>
    <div class="grid2"><label class="f">اسم العميل<input id="cName" value="${esc(c.name)}" required autocomplete="off"></label>
    <label class="f">رقم الجوال<input id="cPhone" value="${esc(c.phone ? '0' + c.phone.slice(3) : '')}" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" ${id ? 'disabled' : ''}></label></div>
    <div class="err" id="cPhErr" style="margin-top:-8px"></div>
    <label class="f" id="platW" ${c.sec === 'office' ? 'hidden' : ''}>جاي من أنهي منصة<select id="cPlat"><option value="">اختار</option>${plats().map(t => `<option ${c.plat === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <div class="f" style="display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:13.5px">نوع المعاملة<div class="chips" id="cTypes">${types().map(t => `<button type="button" class="chip ${(c.types || []).includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
    <label class="f">كان محتاج إيه<textarea id="cNeed" placeholder="مثلاً: رخصة بناء فيلا دورين في حي العارض، والأرض 600 متر">${esc(c.need)}</textarea></label>
    <div class="grid2"><label class="f">الحالة<select id="cStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${(c.status || 'new') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f">تاريخ أول تواصل<input id="cFirst" type="date" value="${esc(c.first || '')}"></label></div>
    <div class="grid2"><label class="f">تاريخ المتابعة الجاية (اختياري)<input id="cFollow" type="date" value="${esc(c.follow || '')}"></label>
    <label class="f">يستقبل إعلانات؟<select id="cOk"><option value="1" ${c.ok !== false ? 'selected' : ''}>أيوه، موافق</option><option value="0" ${c.ok === false ? 'selected' : ''}>لأ، مش عايز</option></select></label></div>
    <label class="f">ملاحظات<textarea id="cNotes" style="min-height:60px">${esc(c.notes)}</textarea></label>
    <div class="err" id="cErr"></div>
    <button class="btn red block" id="cSave">${id ? 'حفظ التعديل' : 'حفظ العميل'}</button>
   </form>`);
  let sec = c.sec === 'office' ? 'office' : 'social';
  $$('[data-s]', p).forEach(b => b.onclick = () => { sec = b.dataset.s; $$('[data-s]', p).forEach(x => x.classList.toggle('on', x === b)); $('#platW', p).hidden = sec === 'office'; });
  $$('#cTypes .chip', p).forEach(b => b.onclick = () => b.classList.toggle('on'));
  const ph = $('#cPhone', p);
  if (!id) ph.oninput = () => { const n = normPhone(ph.value), ex = n && S.clients[n]; $('#cPhErr', p).innerHTML = ex ? `الرقم ده متسجل قبل كده باسم «${esc(ex.name)}». <button type="button" class="btn sm line" id="goEx">افتح العميل</button>` : ''; const g = $('#goEx', p); g && (g.onclick = () => clientView(n)); };
  $('#cf', p).onsubmit = async e => {
    e.preventDefault();
    const name = $('#cName', p).value.trim(), phone = id || normPhone(ph.value);
    if (!name) { $('#cErr', p).textContent = 'اكتب اسم العميل'; return; }
    if (!phone) { $('#cErr', p).textContent = 'رقم الجوال مش صحيح. اكتبه بالشكل ده: 05xxxxxxxx'; return; }
    if (!id && S.clients[phone]) { $('#cErr', p).textContent = 'الرقم ده متسجل قبل كده'; return; }
    const d = {
      name, phone, sec, plat: sec === 'office' ? '' : $('#cPlat', p).value,
      types: $$('#cTypes .chip.on', p).map(b => b.textContent), need: $('#cNeed', p).value.trim(),
      status: $('#cStatus', p).value, first: $('#cFirst', p).value, follow: $('#cFollow', p).value,
      ok: $('#cOk', p).value === '1', notes: $('#cNotes', p).value.trim(), updatedAt: serverTimestamp(), upBy: S.myName,
    };
    if (!id) { d.createdAt = serverTimestamp(); d.by = S.myName; d.byUid = S.user.uid; }
    $('#cSave', p).disabled = true;
    try { await setDoc(doc(db, C.clients, phone), d, { merge: true }); closeSheet(); toast(id ? 'اتحفظ التعديل' : 'اتضاف العميل'); }
    catch (er) { $('#cErr', p).textContent = authMsg(er); $('#cSave', p).disabled = false; }
  };
  setTimeout(() => !id && $('#cName', p)?.focus(), 50);
}
function clientView(id) {
  const c = S.clients[id]; if (!c) return;
  const camps = (c.campsSent || []).map(k => S.camps[k]?.title).filter(Boolean);
  const p = sheet(`<div class="hd"><h2>${esc(c.name)}</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <div class="row"><a class="btn line grow" href="tel:+${esc(c.phone)}">${I.phone} اتصال</a><a class="btn wa grow" href="https://wa.me/${esc(c.phone)}" target="_blank" rel="noopener">${I.wa} واتساب</a></div>
   <div class="card scrollx" style="box-shadow:none"><table class="mini"><tbody>
    <tr><th>الجوال</th><td dir="ltr" style="text-align:right">${esc(showPhone(c.phone))}</td></tr>
    <tr><th>القسم</th><td>${c.sec === 'office' ? 'عملاء المكتب' : 'السوشيال ميديا' + (c.plat ? ' — ' + esc(c.plat) : '')}</td></tr>
    <tr><th>نوع المعاملة</th><td>${esc((c.types || []).join('، ') || '—')}</td></tr>
    <tr><th>كان محتاج</th><td style="white-space:pre-wrap">${esc(c.need || '—')}</td></tr>
    <tr><th>الحالة</th><td>${STATUS[c.status || 'new']}</td></tr>
    <tr><th>أول تواصل</th><td>${fmtDate(c.first) || '—'}</td></tr>
    <tr><th>المتابعة الجاية</th><td>${fmtDate(c.follow) || '—'}</td></tr>
    <tr><th>الإعلانات</th><td>${c.ok === false ? 'مش عايز إعلانات' : 'موافق'}</td></tr>
    <tr><th>آخر إعلان اتبعتله</th><td>${c.lastAt ? fmtTs(c.lastAt) : 'لسه'}</td></tr>
    ${camps.length ? `<tr><th>الإعلانات اللي وصلته</th><td>${esc(camps.join('، '))}</td></tr>` : ''}
    ${c.notes ? `<tr><th>ملاحظات</th><td style="white-space:pre-wrap">${esc(c.notes)}</td></tr>` : ''}
    <tr><th>أضافه</th><td>${esc(c.by || '—')}${c.createdAt ? ' — ' + fmtTs(c.createdAt) : ''}</td></tr>
   </tbody></table></div>
   <div class="row"><button class="btn line grow" id="vEdit">${I.edit} تعديل</button><button class="btn line grow" id="vMove">انقله لـ ${c.sec === 'office' ? 'السوشيال ميديا' : 'عملاء المكتب'}</button></div>
   ${can.del() ? `<button class="btn line block" id="vDel" style="color:var(--red)">حذف العميل</button>` : ''}`);
  $('#vEdit', p).onclick = () => clientForm(id);
  $('#vMove', p).onclick = async () => { const to = c.sec === 'office' ? 'social' : 'office'; try { await updateDoc(doc(db, C.clients, id), { sec: to, updatedAt: serverTimestamp(), upBy: S.myName }); closeSheet(); toast('اتنقل لـ ' + SEC[to]); } catch (e) { toast(authMsg(e)); } };
  const dl = $('#vDel', p); dl && (dl.onclick = async () => { if (await confirmBox('حذف العميل؟', `هيتمسح «${esc(c.name)}» وكل بياناته، ومش هينفع ترجعه.`, 'احذف')) { try { await deleteDoc(doc(db, C.clients, id)); toast('اتحذف العميل'); } catch (e) { toast(authMsg(e)); } } });
}

/* ========== follow-ups ========== */
function followDue() { const t = dayKey(); return Object.values(S.clients).filter(c => c.follow && c.follow <= t).sort((a, b) => a.follow.localeCompare(b.follow)); }
function vFollow(m) {
  const t = dayKey(), due = followDue(), up = Object.values(S.clients).filter(c => c.follow && c.follow > t).sort((a, b) => a.follow.localeCompare(b.follow)).slice(0, 30);
  const row = c => `<div class="cl"><div class="av ${c.sec === 'office' ? 'of' : ''}">${esc(initials(c.name))}</div><div class="grow" data-open="${esc(c.id)}" style="cursor:pointer"><div class="nm">${esc(c.name)}</div><div class="ph">${esc(showPhone(c.phone))}</div><div class="tags"><span class="tg ${c.follow < t ? 'lock' : 'new'}">${c.follow < t ? 'متأخرة من ' + fmtDate(c.follow) : c.follow === t ? 'النهارده' : fmtDate(c.follow)}</span>${(c.types || []).slice(0, 2).map(x => `<span class="tg">${esc(x)}</span>`).join('')}</div>${c.need ? `<div class="need">${esc(c.need)}</div>` : ''}</div><div class="acts"><a href="tel:+${esc(c.phone)}" aria-label="اتصال">${I.phone}</a><button data-done="${esc(c.id)}" aria-label="تمت المتابعة" title="تمت المتابعة">✓</button></div></div>`;
  m.innerHTML = `<div class="view"><h2>المتابعات</h2>
   <div class="card"><h3>المطلوب النهارده (${due.length})</h3><div class="list" style="margin-top:10px">${due.length ? due.map(row).join('') : '<p class="muted" style="margin:0">مفيش متابعات مطلوبة النهارده.</p>'}</div></div>
   <div class="card"><h3>الجاية</h3><div class="list" style="margin-top:10px">${up.length ? up.map(row).join('') : '<p class="muted" style="margin:0">حدد «تاريخ المتابعة الجاية» وانت بتضيف العميل أو بتعدله، والتطبيق هيفكرك هنا.</p>'}</div></div></div>`;
  bindRows(m);
  $$('[data-done]', m).forEach(b => b.onclick = async () => { try { await updateDoc(doc(db, C.clients, b.dataset.done), { follow: '', lastFollow: dayKey(), updatedAt: serverTimestamp() }); toast('تمت المتابعة'); } catch (e) { toast(authMsg(e)); } });
}

/* ========== campaigns ========== */
function campRow(k) {
  const tot = (k.ids || []).length, n = k.sentN || 0;
  return `<div class="cl camp" data-camp="${esc(k.id)}" style="cursor:pointer">${k.img ? `<img src="${k.img}" alt="">` : `<div class="av">${I.img}</div>`}<div class="grow"><div class="nm">${esc(k.title || 'إعلان')}</div><div class="muted" style="font-size:13px">${fmtTs(k.created)} — ${n} من ${tot}</div><div class="prog" style="margin-top:6px"><i style="width:${tot ? n / tot * 100 : 0}%"></i></div></div></div>`;
}
function vAds(m) {
  const list = Object.values(S.camps).sort((a, b) => tsMs(b.created) - tsMs(a.created));
  m.innerHTML = `<div class="view"><div class="sec-t"><h2>الإعلانات</h2><button class="btn red" id="aNew">${I.plus} إعلان جديد</button></div>
   <div class="okbox">الإرسال آمن على رقمك: التطبيق بيجهز الصورة والكلام لكل عميل، وانت اللي بتضغط «إرسال» في واتساب. أي عميل اتبعتله بيتقفل، ومش بيوصله نفس الإعلان مرتين، ولا أي إعلان تاني في نفس اليوم.</div>
   <div class="list">${list.length ? list.map(campRow).join('') : '<div class="card empty"><b>مفيش إعلانات لسه</b>اعمل أول إعلان: صورة وتحتها كلام، واختار العملاء اللي هيوصلهم.</div>'}</div></div>`;
  $('#aNew', m).onclick = () => campForm(); bindRows(m);
}
async function compressImage(file, max = 1280, q = .82) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = im.naturalWidth, h = im.naturalHeight; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    let out = cv.toDataURL('image/jpeg', q); while (out.length > 900000 && q > .4) { q -= .1; out = cv.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
function audience(a) {
  return Object.values(S.clients).filter(c => c.ok !== false
    && (!a.sec || a.sec === 'all' || (a.sec === 'office' ? c.sec === 'office' : c.sec !== 'office'))
    && (!a.types?.length || (c.types || []).some(t => a.types.includes(t)))
    && (!a.status?.length || a.status.includes(c.status || 'new'))
    && (!a.plat || c.plat === a.plat));
}
function campForm() {
  const a = { sec: 'all', types: [], status: [], plat: '' }; let img = '';
  const p = sheet(`<div class="hd"><h2>إعلان جديد</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <label class="f">اسم الإعلان (ليك انت بس)<input id="kTitle" placeholder="مثلاً: عرض رخص البناء — نوفمبر"></label>
   <div><div style="font-weight:600;font-size:13.5px;margin-bottom:5px">صورة الإعلان</div><label class="drop" id="kDrop">${I.img}<div>اضغط واختار الصورة</div><input type="file" id="kImg" accept="image/*" hidden></label><div id="kPrevImg"></div></div>
   <label class="f">الكلام اللي تحت الصورة<textarea id="kText" style="min-height:120px" placeholder="أهلاً أستاذ {الاسم}،&#10;شركة الشمراني للاستشارات الهندسية..."></textarea></label>
   <div class="row"><button type="button" class="chip" id="kName">+ اسم العميل {الاسم}</button><span class="muted" style="font-size:12.5px">بيتحط مكانه الاسم الأول لكل عميل</span></div>
   <div class="card" style="box-shadow:none;display:flex;flex-direction:column;gap:10px"><h3>مين هيوصله الإعلان</h3>
    <div class="seg" id="kSec"><button data-v="all" class="on">الكل</button><button data-v="social">السوشيال ميديا</button><button data-v="office">عملاء المكتب</button></div>
    <div><div class="muted" style="font-size:13px;margin-bottom:4px">نوع المعاملة (لو مختارتش حاجة = الكل)</div><div class="chips" id="kTypes">${types().map(t => `<button type="button" class="chip">${esc(t)}</button>`).join('')}</div></div>
    <div><div class="muted" style="font-size:13px;margin-bottom:4px">الحالة</div><div class="chips" id="kStatus">${Object.entries(STATUS).map(([k, v]) => `<button type="button" class="chip" data-v="${k}">${v}</button>`).join('')}</div></div>
    <label class="f" id="kPlatW">المنصة<select id="kPlat"><option value="">كل المنصات</option>${plats().map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
    <div class="okbox" id="kCount"></div>
   </div>
   <div class="err" id="kErr"></div>
   <button class="btn red block" id="kSave">حفظ الإعلان وابدأ الإرسال</button>`);
  const upd = () => { const n = audience(a).length; $('#kCount', p).textContent = `هيوصل لـ ${n} عميل (العملاء اللي قالوا «مش عايز إعلانات» مش محسوبين).`; };
  $$('#kSec button', p).forEach(b => b.onclick = () => { a.sec = b.dataset.v; $$('#kSec button', p).forEach(x => x.classList.toggle('on', x === b)); $('#kPlatW', p).hidden = a.sec === 'office'; if (a.sec === 'office') { a.plat = ''; $('#kPlat', p).value = ''; } upd(); });
  $$('#kTypes .chip', p).forEach(b => b.onclick = () => { b.classList.toggle('on'); a.types = $$('#kTypes .chip.on', p).map(x => x.textContent); upd(); });
  $$('#kStatus .chip', p).forEach(b => b.onclick = () => { b.classList.toggle('on'); a.status = $$('#kStatus .chip.on', p).map(x => x.dataset.v); upd(); });
  $('#kPlat', p).onchange = e => { a.plat = e.target.value; upd(); };
  $('#kName', p).onclick = () => { const t = $('#kText', p), i = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, i) + '{الاسم}' + t.value.slice(i); t.focus(); };
  $('#kImg', p).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { img = await compressImage(f); $('#kPrevImg', p).innerHTML = `<div class="adprev" style="margin-top:8px"><img src="${img}" alt="صورة الإعلان"></div>`; $('#kDrop', p).querySelector('div').textContent = 'غيّر الصورة'; } catch (er) { $('#kErr', p).textContent = 'مقدرتش أفتح الصورة دي. جرّب صورة JPG أو PNG.'; } };
  upd();
  $('#kSave', p).onclick = async () => {
    const title = $('#kTitle', p).value.trim() || 'إعلان ' + fmtDate(dayKey()), text = $('#kText', p).value.trim();
    if (!img && !text) { $('#kErr', p).textContent = 'حط صورة أو اكتب كلام الإعلان'; return; }
    const ids = audience(a).map(c => c.id);
    if (!ids.length) { $('#kErr', p).textContent = 'مفيش عملاء بالاختيارات دي'; return; }
    $('#kSave', p).disabled = true;
    try {
      const r = await addDoc(collection(db, C.camps), { title, img, text, aud: a, ids, sentN: 0, created: serverTimestamp(), by: S.myName, byUid: S.user.uid, ignoreDaily: false });
      closeSheet(); toast('اتحفظ الإعلان'); startSend(r.id);
    } catch (er) { $('#kErr', p).textContent = er && String(er.message || '').includes('longer than') ? 'الصورة كبيرة. اختار صورة أصغر.' : authMsg(er); $('#kSave', p).disabled = false; }
  };
}
function campView(id) {
  const k = S.camps[id]; if (!k) return;
  const tot = (k.ids || []).length, n = k.sentN || 0;
  const p = sheet(`<div class="hd"><h2>${esc(k.title)}</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <div class="adprev">${k.img ? `<img src="${k.img}" alt="صورة الإعلان">` : ''}${k.text ? `<p>${esc(k.text)}</p>` : ''}</div>
   <div class="counter"><span>اتبعت لـ ${n} من ${tot}</span><span>${fmtTs(k.created)}${k.by ? ' — ' + esc(k.by) : ''}</span></div>
   <div class="prog"><i style="width:${tot ? n / tot * 100 : 0}%"></i></div>
   <button class="btn wa block" id="kGo">${I.wa} ${n ? 'كمّل الإرسال' : 'ابدأ الإرسال'}</button>
   <div class="row"><button class="btn line grow" id="kList">مين اتبعتله</button><button class="btn line grow" id="kReset">${I.undo} إعادة الإعلان من الأول</button></div>
   <button class="btn line block" id="kDel" style="color:var(--red)">حذف الإعلان</button>`);
  $('#kGo', p).onclick = () => { closeSheet(); startSend(id); };
  $('#kList', p).onclick = () => sentList(id);
  $('#kReset', p).onclick = async () => {
    const r = await confirmBox('إعادة الإعلان من الأول؟', 'كل العملاء اللي اتبعتلهم الإعلان ده هيرجعوا متاحين تبعتلهم تاني.', 'أعد الإعلان', true,
      `<label class="row" style="font-size:14px;gap:10px"><input type="checkbox" id="rDaily" style="width:20px;height:20px"> اسمح أبعت النهارده للعملاء اللي وصلهم إعلان النهارده</label>`);
    if (!r) return;
    try {
      const ids = await sentIds(id); const b = writeBatch(db); let i = 0, bs = [b];
      ids.forEach(cid => { if (i && i % 450 === 0) bs.push(writeBatch(db)); bs[bs.length - 1].delete(doc(db, C.sent, id + '_' + cid)); i++; });
      bs[bs.length - 1].update(doc(db, C.camps, id), { sentN: 0, resetAt: serverTimestamp(), ignoreDaily: !!r[0] });
      for (const x of bs) await x.commit(); closeSheet(); toast('الإعلان رجع من الأول');
    } catch (e) { toast(authMsg(e)); }
  };
  $('#kDel', p).onclick = async () => { if (await confirmBox('حذف الإعلان؟', 'هيتمسح الإعلان وسجل الإرسال بتاعه. العملاء نفسهم مش هيتمسحوا.', 'احذف')) { try { const ids = await sentIds(id); const b = writeBatch(db); ids.slice(0, 450).forEach(cid => b.delete(doc(db, C.sent, id + '_' + cid))); b.delete(doc(db, C.camps, id)); await b.commit(); toast('اتحذف الإعلان'); } catch (e) { toast(authMsg(e)); } } };
}
function sentIds(camp) { return new Promise((res, rej) => { const u = onSnapshot(query(collection(db, C.sent), where('camp', '==', camp)), s => { u(); const a = []; s.forEach(d => a.push(d.data().cid)); res(a); }, rej); }); }
async function sentList(id) {
  const k = S.camps[id]; const done = new Set(await sentIds(id)); const today = dayKey();
  const rows = (k.ids || []).map(cid => S.clients[cid]).filter(Boolean);
  sheet(`<div class="hd"><h2>${esc(k.title)}</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <div class="counter"><span>✓ اتبعتله: ${done.size}</span><span>فاضل: ${rows.length - done.size}</span></div>
   <div class="list">${rows.map(c => `<div class="cl"><div class="av ${c.sec === 'office' ? 'of' : ''}">${esc(initials(c.name))}</div><div class="grow"><div class="nm">${esc(c.name)}</div><div class="ph">${esc(showPhone(c.phone))}</div><div class="tags">${done.has(c.id) ? '<span class="tg sent">✓ اتبعتله</span>' : c.ok === false ? '<span class="tg no">مش عايز إعلانات</span>' : c.lastDay === today && !k.ignoreDaily ? '<span class="tg lock">وصله إعلان تاني النهارده</span>' : '<span class="tg">لسه</span>'}</div></div></div>`).join('')}</div>`);
}

/* ========== sending ========== */
const sending = { active: false };
function waPkgName() { return S.set.waPkg || 'auto'; }
async function startSend(id) {
  const k = S.camps[id] || (await getDoc(doc(db, C.camps, id))).data(); if (!k) return;
  sending.active = true; sending.id = id; sending.k = { id, ...k }; sending.skip = new Set(); sending.session = 0; sending.last = null; sending.done = new Set(await sentIds(id).catch(() => []));
  $('#fab').hidden = true; scrollTo(0, 0); sendStep();
}
function sendQueue() {
  const k = sending.k, today = dayKey();
  const all = (k.ids || []).map(c => S.clients[c]).filter(Boolean);
  const avail = [], locked = [];
  all.forEach(c => {
    if (sending.done.has(c.id)) return;
    if (c.ok === false) { locked.push(c); return; }
    if (c.lastDay === today && c.lastCamp !== k.id && !k.ignoreDaily) { locked.push(c); return; }
    if (c.lastDay === today && c.lastCamp === k.id && !k.ignoreDaily && tsMs(c.lastAt) > tsMs(k.resetAt)) { locked.push(c); return; }
    avail.push(c);
  });
  avail.sort((a, b) => (sending.skip.has(a.id) ? 1 : 0) - (sending.skip.has(b.id) ? 1 : 0));
  return { all, avail, locked };
}
function msgFor(c) { return (sending.k.text || '').replace(/\{الاسم\}/g, firstName(c.name)).replace(/\{الاسم_كامل\}/g, c.name || ''); }
function sendStep() {
  const m = $('#main'); const k = sending.k; const { all, avail, locked } = sendQueue();
  const done = sending.done.size, total = all.length;
  const head = `<div class="sec-t"><h2>إرسال: ${esc(k.title)}</h2><button class="btn sm line" id="sStop">خروج</button></div>
   <div class="counter"><span>اتبعت ${done} من ${total}</span><span>${locked.length ? `${locked.length} مقفول النهارده` : ''}</span></div><div class="prog"><i style="width:${total ? done / total * 100 : 0}%"></i></div>`;
  if (sending.rest && Date.now() < sending.rest) {
    const left = Math.ceil((sending.rest - Date.now()) / 1000);
    m.innerHTML = `<div class="view">${head}<div class="card rest"><div class="muted">استراحة قصيرة بعد ${sending.session} رسايل، عشان الإرسال يفضل طبيعي وآمن</div><b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b><button class="btn line" id="sSkipRest">كمّل من غير استراحة</button></div></div>`;
    $('#sStop').onclick = stopSend; $('#sSkipRest').onclick = () => { sending.rest = 0; sendStep(); };
    clearTimeout(sending.t); sending.t = setTimeout(sendStep, 1000); return;
  }
  const c = avail[0];
  if (!c) {
    m.innerHTML = `<div class="view">${head}<div class="card empty"><b>${done >= total ? 'خلص الإرسال ✓' : 'مفيش حد متاح دلوقتي'}</b>${done >= total ? 'كل العملاء في الإعلان ده وصلهم.' : `فاضل ${total - done} عميل مقفولين، لأنهم وصلهم إعلان النهارده أو مش عايزين إعلانات. ممكن تكمّل بكرة من نفس الإعلان.`}</div><button class="btn block line" id="sBack">رجوع للإعلانات</button></div>`;
    $('#sStop').onclick = stopSend; $('#sBack').onclick = stopSend; return;
  }
  const img = k.img, text = msgFor(c), nat = native();
  m.innerHTML = `<div class="view">${head}
   <div class="card sendbox">
    <div class="row"><div class="av ${c.sec === 'office' ? 'of' : ''}">${esc(initials(c.name))}</div><div class="grow"><div class="big">${esc(c.name)}</div><div class="ph muted" dir="ltr" style="text-align:right">${esc(showPhone(c.phone))}</div></div></div>
    <div class="tags">${(c.types || []).map(t => `<span class="tg">${esc(t)}</span>`).join('')}${sending.skip.has(c.id) ? '<span class="tg lock">اتخطيته قبل كده</span>' : ''}</div>
    ${!nat && img ? `<div class="hint">${isIOS() ? 'على الآيفون واتساب مش بيقبل الصورة من التطبيق. احفظ الصورة مرة واحدة من زرار «حفظ الصورة»، وبعد ما تفتح المحادثة ضيفها من الصور وابعت.' : 'من المتصفح: الكلام بيتكتب جاهز. الصورة بتتنسخ لوحدها، الصقها في المحادثة (Ctrl+V أو ضغطة مطولة ← لصق). في تطبيق الأندرويد الصورة والكلام بيتحطوا مع بعض.'}</div>` : ''}
    <button class="btn wa block" id="sSend" style="min-height:54px;font-size:17px">${I.wa} افتح واتساب وابعت لـ ${esc(firstName(c.name))}</button>
    <div class="row"><button class="btn line grow" id="sSkip">تخطّي دلوقتي</button>${sending.last ? `<button class="btn line grow" id="sUndo">${I.undo} ${esc(firstName(S.clients[sending.last]?.name || ''))} ما اتبعتلوش</button>` : ''}${!nat && img ? `<button class="btn line grow" id="sSave">${I.down} حفظ الصورة</button>` : ''}</div>
    <div class="adprev sm">${img ? `<img src="${img}" alt="صورة الإعلان">` : ''}${text ? `<p>${esc(text)}</p>` : ''}</div>
   </div>
   <p class="muted" style="font-size:13px;text-align:center;margin:0">أول ما تضغط الزرار، العميل بيتعلّم ✓ ومش هيظهر تاني. لو ما بعتلوش، اضغط «ما اتبعتلوش» عشان يرجع.</p>
  </div>`;
  $('#sStop').onclick = stopSend;
  $('#sSkip').onclick = () => { sending.skip.add(c.id); const q = sendQueue().avail; if (q.length > 1 || !q.length) sendStep(); else toast('ده آخر عميل متاح'); };
  const u = $('#sUndo'); u && (u.onclick = undoLast);
  const sv = $('#sSave'); sv && (sv.onclick = () => { const a = document.createElement('a'); a.href = img; a.download = (k.title || 'اعلان') + '.jpg'; document.body.appendChild(a); a.click(); a.remove(); });
  $('#sSend').onclick = () => sendOne(c, text);
}
async function sendOne(c, text) {
  const k = sending.k, today = dayKey();
  // 1) نعلّم العميل الأول (حتى لو التطبيق اتقفل بعد كده)
  const prev = { lastDay: c.lastDay || '', lastAt: c.lastAt || null, lastCamp: c.lastCamp || '' };
  sending.done.add(c.id); sending.last = c.id; sending.prev = prev; sending.session++;
  const b = writeBatch(db);
  b.set(doc(db, C.sent, k.id + '_' + c.id), { camp: k.id, cid: c.id, day: today, at: serverTimestamp(), by: S.myName, byUid: S.user.uid });
  b.update(doc(db, C.clients, c.id), { lastDay: today, lastAt: serverTimestamp(), lastCamp: k.id, campsSent: [...new Set([...(c.campsSent || []), k.id])] });
  b.update(doc(db, C.camps, k.id), { sentN: sending.done.size, lastSend: serverTimestamp() });
  b.commit().catch(e => toast(authMsg(e), 5000));
  // 2) نفتح واتساب
  try {
    if (WaShare()) {
      await WaShare().send({ phone: c.phone, text, image: k.img ? k.img.split(',')[1] : '', pkg: waPkgName() });
    } else {
      if (k.img && navigator.clipboard && window.ClipboardItem && !isIOS()) {
        try { const blob = await (await fetch(k.img)).blob(); const png = await toPng(blob); await navigator.clipboard.write([new ClipboardItem({ [png.type]: png })]); } catch (e) { }
      }
      const url = `https://wa.me/${c.phone}${text ? '?text=' + encodeURIComponent(text) : ''}`;
      const w = window.open(url, '_blank'); if (!w) location.href = url;
    }
  } catch (e) { toast('مقدرتش أفتح واتساب: ' + (e.message || e), 5000); }
  if (sending.session % 10 === 0) sending.rest = Date.now() + 120000;
  sendStep();
}
async function toPng(blob) {
  const bmp = await createImageBitmap(blob); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
  return await new Promise(r => cv.toBlob(r, 'image/png'));
}
async function undoLast() {
  const id = sending.last, k = sending.k; if (!id) return;
  sending.done.delete(id); sending.session = Math.max(0, sending.session - 1); sending.last = null;
  const pv = sending.prev || {}; const c = S.clients[id] || {};
  const b = writeBatch(db);
  b.delete(doc(db, C.sent, k.id + '_' + id));
  b.update(doc(db, C.clients, id), { lastDay: pv.lastDay || '', lastAt: pv.lastAt || deleteField(), lastCamp: pv.lastCamp || '', campsSent: (c.campsSent || []).filter(x => x !== k.id) });
  b.update(doc(db, C.camps, k.id), { sentN: sending.done.size });
  b.commit().catch(e => toast(authMsg(e), 5000));
  toast('رجع لقايمة الإرسال'); sendStep();
}
function stopSend() { sending.active = false; clearTimeout(sending.t); S.view = 'ads'; lsSet('uk.view', 'ads'); $$('.nav [data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === 'ads')); render(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden && sending.active) sendStep(); });

/* ========== settings ========== */
function vSet(m) {
  const pkg = waPkgName();
  m.innerHTML = `<div class="view"><h2>الإعدادات</h2>
   <div class="card"><div class="row between"><div><b>${esc(S.myName || '—')}</b><div class="muted" style="font-size:13px">${S.role === 'owner' ? 'المالك — كل الصلاحيات' : S.role === 'sender' ? 'يضيف عملاء ويبعت إعلانات' : 'يضيف ويعدل عملاء'}</div></div><button class="btn line sm" id="sOut">تسجيل خروج</button></div></div>
   ${native() ? `<div class="card"><h3>واتساب اللي بتبعت منه</h3><div class="seg" id="sPkg" style="margin-top:10px"><button data-v="auto" class="${pkg === 'auto' ? 'on' : ''}">تلقائي</button><button data-v="com.whatsapp" class="${pkg === 'com.whatsapp' ? 'on' : ''}">واتساب العادي</button><button data-v="com.whatsapp.w4b" class="${pkg === 'com.whatsapp.w4b' ? 'on' : ''}">واتساب بيزنس</button></div></div>` : ''}
   <div class="card"><h3>العملاء القدام من Excel</h3><p class="muted" style="margin:6px 0 10px;font-size:13.5px">الملف يكون فيه عمود للاسم وعمود للجوال. لو فيه أعمدة «نوع المعاملة» و«كان محتاج» و«ملاحظات» و«القسم» و«المنصة» هتتقرا كمان.</p>
    <div class="row"><label class="btn red grow" style="cursor:pointer">${I.up} استيراد من Excel<input type="file" id="xIn" accept=".xlsx,.xls,.csv" hidden></label>${can.del() ? `<button class="btn line grow" id="xOut">${I.down} تصدير كل العملاء</button>` : ''}</div></div>
   ${can.send() ? listEditor('أنواع المعاملات', 'types', types()) + listEditor('منصات السوشيال ميديا', 'plats', plats()) : ''}
   ${can.admin() ? usersCard() : ''}
   <p class="muted" style="text-align:center;font-size:12.5px">عملائك — شركة سعد مفرح الشمراني للاستشارات الهندسية · إصدار 1</p>
  </div>`;
  $('#sOut', m).onclick = async () => { if (await confirmBox('تسجيل خروج؟', 'هتحتاج تدخل باسم المستخدم وكلمة السر تاني.', 'خروج', false)) signOut(auth); };
  $$('#sPkg button', m).forEach(b => b.onclick = () => setDoc(doc(db, C.set, 'main'), { waPkg: b.dataset.v }, { merge: true }).then(() => toast('اتحفظ')).catch(e => toast(authMsg(e))));
  $('#xIn', m).onchange = e => { const f = e.target.files[0]; if (f) importExcel(f); e.target.value = ''; };
  const xo = $('#xOut', m); xo && (xo.onclick = exportExcel);
  bindListEditors(m); bindUsers(m);
}
function listEditor(title, key, arr) {
  return `<div class="card" data-le="${key}"><h3>${title}</h3><div class="chips" style="margin:10px 0">${arr.map((t, i) => `<span class="chip">${esc(t)} <button data-rm="${i}" aria-label="حذف ${esc(t)}" style="border:0;background:none;cursor:pointer;color:var(--sub);padding:0 2px">×</button></span>`).join('')}</div><div class="row"><input class="inp grow" placeholder="ضيف جديد" style="flex:1"><button class="btn sm line" data-add>إضافة</button></div></div>`;
}
function bindListEditors(m) {
  $$('[data-le]', m).forEach(card => {
    const key = card.dataset.le, cur = () => key === 'types' ? types() : plats();
    const save = arr => setDoc(doc(db, C.set, 'main'), { [key]: arr }, { merge: true }).catch(e => toast(authMsg(e)));
    $$('[data-rm]', card).forEach(b => b.onclick = () => { const a = [...cur()]; a.splice(+b.dataset.rm, 1); save(a); });
    const inp = $('input', card), add = () => { const v = inp.value.trim(); if (!v) return; if (cur().includes(v)) { toast('موجود قبل كده'); return; } save([...cur(), v]); inp.value = ''; };
    $('[data-add]', card).onclick = add; inp.onkeydown = e => { if (e.key === 'Enter') add(); };
  });
}
function usersCard() {
  const us = Object.values(S.users).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<div class="card"><h3>الموظفين اللي بيستخدموا التطبيق</h3>
   <div class="list" style="margin:10px 0">${us.length ? us.map(u => `<div class="cl"><div class="av of">${esc(initials(u.name))}</div><div class="grow"><div class="nm">${esc(u.name)}</div><div class="muted" style="font-size:13px">${esc(u.user || '')} — ${u.role === 'sender' ? 'يضيف ويبعت إعلانات' : 'يضيف ويعدل عملاء بس'}${u.active === false ? ' — موقوف' : ''}</div></div><div class="acts"><button data-utog="${esc(u.id)}" title="${u.active === false ? 'تفعيل' : 'إيقاف'}" aria-label="${u.active === false ? 'تفعيل' : 'إيقاف'}">${u.active === false ? '▶' : '⏸'}</button></div></div>`).join('') : '<p class="muted" style="margin:0">انت بس اللي بتستخدم التطبيق دلوقتي.</p>'}</div>
   <details><summary class="btn line block" style="list-style:none">${I.plus} إضافة موظف</summary>
    <div class="view" style="margin-top:10px"><div class="grid2"><label class="f">الاسم<input id="uName"></label><label class="f">اسم المستخدم<input id="uUser" autocomplete="off"></label></div>
    <div class="grid2"><label class="f">كلمة السر<input id="uPass" type="text" autocomplete="off"></label><label class="f">الصلاحية<select id="uRole"><option value="staff">يضيف ويعدل عملاء بس</option><option value="sender">يضيف عملاء ويبعت إعلانات</option></select></label></div>
    <p class="muted" style="font-size:12.5px;margin:0">لو الموظف عنده حساب في البصمة، اكتب نفس اسم المستخدم بتاعه، وهو يدخل بنفس كلمة سره، والخانة دي هتتجاهل.</p>
    <div class="err" id="uErr"></div><button class="btn red" id="uAdd">إضافة الموظف</button></div></details></div>`;
}
let secondary;
function bindUsers(m) {
  $$('[data-utog]', m).forEach(b => b.onclick = async () => { const u = S.users[b.dataset.utog]; try { await updateDoc(doc(db, C.users, u.id), { active: u.active === false }); } catch (e) { toast(authMsg(e)); } });
  const add = $('#uAdd', m); if (!add) return;
  add.onclick = async () => {
    const name = $('#uName', m).value.trim(), user = $('#uUser', m).value.trim(), pass = $('#uPass', m).value, role = $('#uRole', m).value, er = $('#uErr', m);
    if (!name) { er.textContent = 'اكتب اسم الموظف'; return; }
    if (!USER_OK.test(normUser(user))) { er.textContent = 'اسم المستخدم من ٢ لـ ٢٤ حرف: عربي أو إنجليزي وأرقام بس'; return; }
    add.disabled = true; er.textContent = '';
    try {
      if (!secondary) { const a2 = initializeApp(firebaseConfig, 'secondary'); secondary = getAuth(a2); }
      let uid;
      try { if (pass.length < 6) throw { code: 'weak-password' }; uid = (await createUserWithEmailAndPassword(secondary, toEmail(user), pass)).user.uid; }
      catch (e) {
        if (String(e.code).includes('email-already-in-use')) {
          // حساب موجود من البصمة: نجيب الـ uid من الموظفين
          let found = null; try { const s = await new Promise((res, rej) => { const u = onSnapshot(query(collection(db, 'employees'), where('num', '==', normUser(user))), x => { u(); res(x); }, rej); }); s.forEach(d => found = d.id); } catch (x) { }
          if (!found) throw { code: 'email-already-in-use' }; uid = found;
        } else throw e;
      }
      try { await signOut(secondary); } catch (e) { }
      await setDoc(doc(db, C.users, uid), { name, user: normUser(user), role, active: true, created: serverTimestamp() });
      toast('اتضاف الموظف'); render();
    } catch (e) { er.textContent = String(e.code || '').includes('weak-password') ? 'كلمة السر لازم تكون ٦ حروف أو أرقام على الأقل' : authMsg(e); add.disabled = false; }
  };
}

/* ========== Excel ========== */
let XLSXp;
function loadXLSX() { return XLSXp || (XLSXp = new Promise((res, rej) => { if (window.XLSX) return res(window.XLSX); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { XLSXp = null; rej(new Error('net')); }; document.head.appendChild(s); })); }
const COLS = { name: ['الاسم', 'اسم', 'name', 'العميل'], phone: ['الجوال', 'جوال', 'رقم', 'الهاتف', 'هاتف', 'موبايل', 'phone', 'mobile', 'tel', 'واتساب'], types: ['نوع', 'المعامله', 'معامله', 'type', 'الخدمه'], need: ['محتاج', 'الطلب', 'طلب', 'need', 'التفاصيل'], notes: ['ملاحظ', 'note'], sec: ['القسم', 'المصدر', 'source'], plat: ['المنصه', 'platform'], status: ['الحاله', 'status'] };
async function importExcel(file) {
  let X; try { X = await loadXLSX(); } catch (e) { toast('محتاج إنترنت عشان أقرا ملف Excel'); return; }
  let rows; try { const isCsv = /\.(csv|txt)$/i.test(file.name); const wb = isCsv ? X.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', raw: true }) : X.read(await file.arrayBuffer(), { type: 'array' }); rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); } catch (e) { toast('مقدرتش أقرا الملف ده'); return; }
  rows = rows.filter(r => r.some(v => String(v).trim()));
  if (!rows.length) { toast('الملف فاضي'); return; }
  // الصف اللي فيه العناوين: أول صف فيه كلمة من أسماء الأعمدة
  let hi = rows.findIndex(r => r.some(v => Object.values(COLS).flat().some(k => normUser(v).includes(normUser(k)))));
  const map = {}; const head = hi >= 0 ? rows[hi].map(v => normUser(v)) : [];
  if (hi >= 0) for (const [k, keys] of Object.entries(COLS)) { const i = head.findIndex((h, j) => !Object.values(map).includes(j) && keys.some(x => h.includes(normUser(x)))); if (i >= 0) map[k] = i; }
  const body = rows.slice(hi >= 0 ? hi + 1 : 0);
  if (map.phone == null) { const counts = (body[0] || []).map((_, j) => body.slice(0, 30).filter(r => normPhone(r[j])).length); const j = counts.indexOf(Math.max(...counts)); if (counts[j] > 0) map.phone = j; }
  if (map.name == null) { const j = (body[0] || []).findIndex((_, j) => j !== map.phone && body.slice(0, 10).some(r => /[ء-ي]/.test(r[j]))); if (j >= 0) map.name = j; }
  if (map.phone == null) { toast('مش لاقي عمود فيه أرقام جوالات في الملف', 4000); return; }
  const out = [], bad = [], dup = [], seen = new Set();
  body.forEach((r, n) => {
    const ph = normPhone(r[map.phone]); const name = String(r[map.name] ?? '').trim();
    if (!ph) { bad.push(n); return; } if (seen.has(ph)) return; seen.add(ph);
    if (S.clients[ph]) { dup.push(ph); return; }
    const secRaw = normUser(r[map.sec] ?? ''), sec = /مكتب|office/.test(secRaw) ? 'office' : /سوشيال|social|تيك|انست|سناب/.test(secRaw) ? 'social' : '';
    const stRaw = normUser(r[map.status] ?? ''), st = /قديم|old/.test(stRaw) ? 'old' : /متكرر|rep/.test(stRaw) ? 'rep' : 'new';
    const tRaw = String(r[map.types] ?? '').trim();
    out.push({ phone: ph, name: name || 'عميل', types: tRaw ? tRaw.split(/[،,\/|+]+/).map(s => s.trim()).filter(Boolean) : [], need: String(r[map.need] ?? '').trim(), notes: String(r[map.notes] ?? '').trim(), sec, plat: String(r[map.plat] ?? '').trim(), status: st });
  });
  const colName = k => map[k] != null ? esc(rows[hi]?.[map[k]] || ('عمود ' + (map[k] + 1))) : '—';
  const p = sheet(`<div class="hd"><h2>استيراد العملاء</h2><button class="ib" data-close aria-label="إغلاق">${I.x}</button></div>
   <div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="stat r"><b>${out.length}</b><span>جديد هيتضاف</span></div><div class="stat"><b>${dup.length}</b><span>موجود قبل كده</span></div><div class="stat"><b>${bad.length}</b><span>رقم مش صحيح</span></div></div>
   <div class="card scrollx" style="box-shadow:none"><table class="mini"><tbody><tr><th>الاسم</th><td>${colName('name')}</td></tr><tr><th>الجوال</th><td>${colName('phone')}</td></tr><tr><th>نوع المعاملة</th><td>${colName('types')}</td></tr><tr><th>كان محتاج</th><td>${colName('need')}</td></tr><tr><th>القسم</th><td>${colName('sec')}</td></tr></tbody></table></div>
   <label class="f">العملاء اللي مكتوبش قسمهم يروحوا فين<select id="iSec"><option value="office">عملاء المكتب</option><option value="social">السوشيال ميديا</option></select></label>
   <label class="f">حالتهم<select id="iSt"><option value="keep">زي ما هي في الملف (أو جديد)</option><option value="old">كلهم قدام</option></select></label>
   <div class="scrollx"><table class="mini"><thead><tr><th>الاسم</th><th>الجوال</th><th>المعاملة</th></tr></thead><tbody>${out.slice(0, 8).map(c => `<tr><td>${esc(c.name)}</td><td dir="ltr">${esc(showPhone(c.phone))}</td><td>${esc(c.types.join('، '))}</td></tr>`).join('')}</tbody></table>${out.length > 8 ? `<p class="muted" style="font-size:13px">و${out.length - 8} عميل تاني…</p>` : ''}</div>
   <div class="err" id="iErr"></div><button class="btn red block" id="iGo" ${out.length ? '' : 'disabled'}>ضيف ${out.length} عميل</button>`);
  $('#iGo', p).onclick = async () => {
    const dsec = $('#iSec', p).value, allOld = $('#iSt', p).value === 'old'; $('#iGo', p).disabled = true;
    try {
      for (let i = 0; i < out.length; i += 400) {
        const b = writeBatch(db);
        out.slice(i, i + 400).forEach(c => b.set(doc(db, C.clients, c.phone), { ...c, sec: c.sec || dsec, plat: (c.sec || dsec) === 'office' ? '' : c.plat, status: allOld ? 'old' : c.status, ok: true, first: '', follow: '', createdAt: serverTimestamp(), by: S.myName + ' (Excel)', byUid: S.user.uid }));
        await b.commit(); $('#iGo', p).textContent = `اتضاف ${Math.min(out.length, i + 400)} من ${out.length}…`;
      }
      closeSheet(); toast(`اتضاف ${out.length} عميل`);
    } catch (e) { $('#iErr', p).textContent = authMsg(e); $('#iGo', p).disabled = false; }
  };
}
async function exportExcel() {
  let X; try { X = await loadXLSX(); } catch (e) { toast('محتاج إنترنت عشان أعمل ملف Excel'); return; }
  const rows = Object.values(S.clients).sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)).map(c => ({ 'الاسم': c.name, 'الجوال': '0' + (c.phone || '').slice(3), 'القسم': c.sec === 'office' ? 'المكتب' : 'سوشيال ميديا', 'المنصة': c.plat || '', 'نوع المعاملة': (c.types || []).join('، '), 'كان محتاج': c.need || '', 'الحالة': STATUS[c.status || 'new'], 'أول تواصل': c.first || '', 'المتابعة': c.follow || '', 'يستقبل إعلانات': c.ok === false ? 'لا' : 'نعم', 'ملاحظات': c.notes || '', 'آخر إعلان': c.lastDay || '' }));
  const ws = X.utils.json_to_sheet(rows); ws['!cols'] = [20, 14, 12, 12, 24, 40, 8, 12, 12, 10, 30, 12].map(w => ({ wch: w }));
  const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; X.utils.book_append_sheet(wb, ws, 'العملاء');
  X.writeFile(wb, `عملاء الشمراني ${dayKey()}.xlsx`);
}

/* ========== service worker ========== */
if ('serviceWorker' in navigator && location.protocol === 'https:' && !native()) navigator.serviceWorker.register('sw.js').catch(() => { });

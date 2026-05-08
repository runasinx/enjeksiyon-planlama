const LS_KEY = 'enjeksiyon_planlama_v1';
const AUTH_KEY = 'enjeksiyon_planlama_auth_v1';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let sessionTimer = null;
// Güvenlik: giriş bilgisi kalıcı tutulmaz; tarayıcı kapatılıp açılınca tekrar giriş istenir.
localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY);
const USERS_KEY = 'enjeksiyon_planlama_users_v1';
const DEFAULT_USERS = [
  { username: 'admin', password: '1234', role: 'admin', label: 'Admin', permissions: ['*'] },
  { username: 'kullanici', password: '1234', role: 'user', label: 'Kullanıcı', permissions: ['dashboard','plan'] },
  { username: 'planlama', password: '1234', role: 'planning', label: 'Planlama', permissions: ['dashboard','plan','products','finished','settings'] },
  { username: 'uretim', password: '1234', role: 'production', label: 'Üretim', permissions: ['dashboard','plan','finished'] },
  { username: 'goruntu', password: '1234', role: 'viewer', label: 'Sadece Görüntüleme', permissions: ['dashboard','plan','finished','products'] }
];
const VIEW_PERMISSIONS = [
  { key:'dashboard', label:'Makine Genel Durumu' },
  { key:'plan', label:'Planlama' },
  { key:'finished', label:'Biten Ürünler / Siparişler' },
  { key:'products', label:'Ürünler' },
  { key:'settings', label:'Excel / Ayarlar' },
  { key:'users', label:'Kullanıcı Yönetimi' }
];
const API_MODE = location.protocol !== 'file:';
async function apiJson(url, options={}){
  if(!API_MODE) return null;
  try{
    const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...options });
    if(!res.ok) throw new Error(res.statusText);
    return await res.json();
  }catch(err){
    console.warn('Sunucu bağlantısı yok, yerel kayıt kullanılacak:', err);
    return null;
  }
}
async function loadPersistentData(){
  const data = await apiJson('/api/state');
  if(data){ state = data; localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  const serverUsers = await apiJson('/api/users');
  if(serverUsers){ users = serverUsers; localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
}
function persistState(){
  if(API_MODE) apiJson('/api/state', { method:'POST', body: JSON.stringify(state) });
}
function persistUsers(){
  if(API_MODE) apiJson('/api/users', { method:'POST', body: JSON.stringify(users) });
}

let users = JSON.parse(localStorage.getItem(USERS_KEY) || 'null') || structuredClone(DEFAULT_USERS);
let currentUser = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null');
let state = JSON.parse(localStorage.getItem(LS_KEY) || 'null') || structuredClone(window.INITIAL_DATA);
const DEFAULT_PLAN_SETTINGS = { skipSaturday: true, skipSunday: true, skipHolidays: true };
state.settings = { ...DEFAULT_PLAN_SETTINGS, ...(state.settings || {}) };
const MACHINE_DEFINITIONS = [
  { no:1, brand:'Yuzimi', ton:260 },
  { no:2, brand:'Jonwai', ton:120 },
  { no:3, brand:'Yuzimi', ton:260 },
  { no:4, brand:'Yuzimi', ton:260 },
  { no:5, brand:'Ekin', ton:160 },
  { no:6, brand:'Bole', ton:160 },
  { no:7, brand:'Yuzimi', ton:260 },
  { no:8, brand:'Haitian', ton:200 },
  { no:9, brand:'Engel', ton:80 }
];
const machines = MACHINE_DEFINITIONS.map(m=>`MAKİNE ${m.no} - ${m.brand} ${m.ton} Ton`);
function machineNumber(value){
  const raw = String(value || '').toLocaleUpperCase('tr-TR').replace(/İ/g,'I').trim();
  const m = raw.match(/(?:MAKINE|MAKİNE|MACHINE)?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
function normalizeMachineName(value){
  const no = machineNumber(value);
  if(!no) return '';
  const found = MACHINE_DEFINITIONS.find(m=>m.no===no);
  return found ? `MAKİNE ${found.no} - ${found.brand} ${found.ton} Ton` : '';
}
function machineMeta(machine){
  const no = machineNumber(machine);
  return MACHINE_DEFINITIONS.find(m=>m.no===no) || null;
}
function machineShortName(machine){
  const meta = machineMeta(machine);
  return meta ? `MAKİNE ${meta.no}` : String(machine || '');
}
function machineDetailName(machine){
  const meta = machineMeta(machine);
  return meta ? `${meta.brand} ${meta.ton} Ton` : '';
}
function parseMachineList(value){
  if(Array.isArray(value)) return value.map(normalizeMachineName).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  return String(value || '').split(/[;,|\n]+/).map(normalizeMachineName).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
}
function getProductMachineList(product){
  if(!product) return [];
  const list = parseMachineList(product.machines || product.uygunMakineler || product['Uygun Makineler']);
  return list.length ? list : machines.slice();
}
function machineListText(list){ return (list && list.length ? list : machines).join(', '); }

function selectedValues(input){
  if(!input) return [];
  if(input.selectedOptions) return [...input.selectedOptions].map(o=>o.value);
  return [...input.querySelectorAll('input[type="checkbox"]:checked')].map(o=>o.value);
}
function renderMachineSelectPanel(container, selected=[]){
  if(!container) return;
  const selectedSet = new Set((selected && selected.length ? selected : machines).map(m=>normalizeMachineName(m) || m));
  container.innerHTML = `
    <div class="machine-select-search"><input type="search" placeholder="Makine ara..." aria-label="Makine ara"></div>
    <div class="machine-select-list">
      ${machines.map(m=>`
        <label class="machine-select-item" data-search="${escapeHtml((machineShortName(m)+' '+machineDetailName(m)).toLocaleLowerCase('tr-TR'))}">
          <input type="checkbox" value="${escapeHtml(m)}" ${selectedSet.has(m) ? 'checked' : ''}>
          <span class="machine-checkmark">✓</span>
          <span class="machine-select-name"><strong>${escapeHtml(machineShortName(m))}</strong> - ${escapeHtml(machineDetailName(m))}</span>
        </label>`).join('')}
    </div>`;
  const search = container.querySelector('input[type="search"]');
  const items = [...container.querySelectorAll('.machine-select-item')];
  search.addEventListener('input', ()=>{
    const q = search.value.toLocaleLowerCase('tr-TR').trim();
    items.forEach(item=>{ item.style.display = !q || item.dataset.search.includes(q) ? '' : 'none'; });
  });
}

function machineOptionsHtml(selected=[]){
  const selectedSet = new Set((selected || []).map(m=>normalizeMachineName(m) || m));
  return machines.map(m=>{
    const isSelected = selectedSet.has(m);
    return `<option value="${escapeHtml(m)}" ${isSelected?'selected':''}>${escapeHtml(machineShortName(m))} - ${escapeHtml(machineDetailName(m))}</option>`;
  }).join('');
}
function earliestMachineForProduct(product, startLimit=null){
  const eligible = getProductMachineList(product);
  const now = startLimit && !isNaN(startLimit) ? new Date(startLimit) : new Date();
  const options = eligible.map(machine=>{
    const last = lastEndForMachine(machine);
    const available = last && last > now ? last : now;
    return { machine, available, last };
  }).sort((a,b)=>a.available-b.available || machines.indexOf(a.machine)-machines.indexOf(b.machine));
  return options[0] || { machine: machines[0], available: now, last:null };
}
function applyAutoMachineForProduct(force=true){
  const input = $('input[name="product"]');
  const machineSelect = $('select[name="machine"]');
  const startInput = $('input[name="start"]');
  const hint = $('#productMachineHint');
  if(!input || !machineSelect || !startInput) return;
  const product = state.products.find(x=>String(x.kod) === String(input.value).trim());
  if(!product){ if(hint) hint.textContent=''; return; }
  const best = earliestMachineForProduct(product, new Date());
  if(force){
    machineSelect.value = best.machine;
    startInput.value = toInputDateTime(best.available);
    const colorSelect = $('select[name="color"]');
    const productColor = String(product.boya_kodu || product.boyaKodu || product['Boya Kodu'] || '').trim();
    if(colorSelect && productColor){
      const exists = [...colorSelect.options].some(o=>String(o.value) === productColor);
      if(!exists){
        const opt = document.createElement('option');
        opt.value = productColor;
        opt.textContent = productColor;
        colorSelect.appendChild(opt);
      }
      colorSelect.value = productColor;
    }
  }
  if(hint){
    const list = getProductMachineList(product);
    hint.textContent = `${product.kod} için uygun makineler: ${machineListText(list)}. En erken uygun: ${best.machine} - ${fmtDateTime(best.available)}.`;
  }
  setSuggestedStart(false);
}
const STATUSES = ['Planlandı','Üretimde','Bitti','İptal'];
let selectedDashboardMachine = null;
let planEditMode = false;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const num = v => Number(String(v ?? 0).replace(',', '.')) || 0;
const fmt = n => new Intl.NumberFormat('tr-TR').format(Math.round(num(n)));
const escapeHtml = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function excelDateToDate(serial){ const utc = Math.round((num(serial)-25569)*86400*1000); return new Date(utc); }
function fmtExcelDate(serial){ if(!serial) return ''; return excelDateToDate(serial).toLocaleDateString('tr-TR'); }
function fmtExcelTime(serial){ if(serial===null || serial===undefined || serial==='') return ''; const d=excelDateToDate(Math.floor(num(serial))+num(serial)%1); return d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}); }
function fmtDateTime(d){ return d && !isNaN(d) ? d.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : ''; }
function toInputDateTime(d){ if(!d || isNaN(d)) return ''; const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,16); }

function parseTextDateTime(text){
  if(!text) return null;
  const direct = new Date(text);
  if(!isNaN(direct)) return direct;
  const m = String(text).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})(?:[\s,]+(\d{1,2}):(\d{2}))?/);
  if(!m) return null;
  return new Date(Number(m[3]), Number(m[2])-1, Number(m[1]), Number(m[4]||0), Number(m[5]||0));
}
function parsePlanDate(p, kind='start'){
  if(kind==='start'){
    if(p.startISO) return new Date(p.startISO);
    if(p['Başlangıç Tarihi']) return excelDateToDate(num(p['Başlangıç Tarihi']) + num(p['Başlangıç Saati']||0)%1);
    if(p.startText){ const d=parseTextDateTime(p.startText); if(d && !isNaN(d)) return d; }
  }else{
    if(p.endISO) return new Date(p.endISO);
    if(p['Bitiş Tarihi']) return excelDateToDate(num(p['Bitiş Tarihi']) + num(p['Bitiş Saati']||0)%1);
    if(p.endText){ const d=parseTextDateTime(p.endText); if(d && !isNaN(d)) return d; }
  }
  return null;
}
function diffText(from, to){
  if(!from || !to || isNaN(from) || isNaN(to)) return '';
  let mins = Math.round((to - from) / 60000), sign = mins < 0 ? '-' : '';
  mins = Math.abs(mins);
  const days = Math.floor(mins/1440), hours = Math.floor((mins%1440)/60), minutes = mins%60;
  const parts=[]; if(days) parts.push(`${days} gün`); if(hours) parts.push(`${hours} saat`); if(minutes || !parts.length) parts.push(`${minutes} dk`);
  return sign + parts.join(' ');
}

function isAdmin(){ return currentUser?.role === 'admin' || currentUser?.permissions?.includes('*'); }
function defaultPermissionsForRole(role){
  if(role === 'admin') return ['*'];
  if(role === 'planning') return ['dashboard','plan','products','finished','settings'];
  if(role === 'production') return ['dashboard','plan','finished'];
  if(role === 'viewer') return ['dashboard','plan','finished','products'];
  return ['dashboard','plan'];
}
function normalizeUser(u){
  const role = u.role || 'user';
  const permissions = Array.isArray(u.permissions) ? u.permissions : defaultPermissionsForRole(role);
  return { ...u, role, permissions, label: u.label || roleLabel(role) };
}
users = users.map(normalizeUser);
function passwordIsStrong(p){ return String(p || '').length >= 8 && /[A-ZÇĞİÖŞÜ]/.test(p) && /[a-zçğıöşü]/.test(p) && /\d/.test(p); }
function saveUsers(){ users = users.map(normalizeUser); localStorage.setItem(USERS_KEY, JSON.stringify(users)); persistUsers(); }
function roleLabel(role){ return ({admin:'Admin', planning:'Planlama', production:'Üretim', viewer:'Sadece Görüntüleme', user:'Özel Kullanıcı'})[role] || 'Kullanıcı'; }
function resetSessionTimer(){
  if(sessionTimer) clearTimeout(sessionTimer);
  if(!currentUser) return;
  sessionTimer = setTimeout(()=>{ logout('Oturum süresi doldu. Lütfen tekrar giriş yapın.'); }, SESSION_TIMEOUT_MS);
}
['click','keydown','mousemove','touchstart'].forEach(ev=>document.addEventListener(ev, resetSessionTimer, { passive:true }));
function activeUsers(){ return users.filter(u=>!u.deleted).map(normalizeUser); }
function currentAccount(){ return activeUsers().find(u=>u.username === currentUser?.username) || currentUser; }
function userPermissions(u){
  u = normalizeUser(u || {});
  if(u.role === 'admin' || u.permissions.includes('*')) return VIEW_PERMISSIONS.map(v=>v.key);
  return u.permissions || [];
}
function canAccessView(view, user=currentAccount()){
  if(!user) return false;
  user = normalizeUser(user);
  if(user.role === 'admin' || user.permissions.includes('*')) return true;
  return user.permissions.includes(view);
}
function hasPermission(view){ return canAccessView(view); }
function permissionLabelList(u){
  const perms = userPermissions(u);
  return VIEW_PERMISSIONS.filter(v=>perms.includes(v.key)).map(v=>v.label).join(', ') || 'Yetki yok';
}
function showLogin(message=''){
  $('#loginScreen').hidden = false;
  $$('.app-shell').forEach(el=>el.hidden=true);
  const err = $('#loginError');
  const safeMessage = (typeof message === 'string') ? message : '';
  if(err){ err.hidden = !safeMessage; err.textContent = safeMessage; }
}
function showApp(){
  $('#loginScreen').hidden = true;
  $$('.app-shell').forEach(el=>el.hidden=false);
  applyPermissions();
  renderAll();
}
function applyPermissions(){
  const account = currentAccount();
  $$('.nav').forEach(btn=>{ btn.hidden = !canAccessView(btn.dataset.view, account); });
  $$('[data-permission]').forEach(el=>{ el.hidden = !canAccessView(el.dataset.permission, account); });
  $$('[data-admin-only="true"]').forEach(el=>{ el.hidden = !isAdmin(); });
  $('#userBadge').textContent = currentUser ? `${currentUser.label} girişi` : '';
  const active = $('.nav.active');
  if(active && !canAccessView(active.dataset.view, account)) activateView('dashboard');
}
function activateView(view){
  if(!canAccessView(view)) view = 'dashboard';
  $$('.nav').forEach(b=>b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v=>v.classList.toggle('active', v.id === view));
  const btn = $(`.nav[data-view="${view}"]`);
  if(btn) $('#pageTitle').textContent = btn.textContent;
  const printBtn = $('#openMachinePrintModal');
  if(printBtn) printBtn.hidden = view !== 'dashboard';
  const resetBtn = $('#resetData');
  if(resetBtn) resetBtn.hidden = true;
}
function handleLogin(e){
  if(e && typeof e.preventDefault === 'function') e.preventDefault();
  const form = (e && e.target && e.target.closest) ? e.target.closest('#loginForm') : $('#loginForm');
  if(!form) return false;
  const username = String(form.querySelector('[name="username"]')?.value || '').trim();
  const password = String(form.querySelector('[name="password"]')?.value || '').trim();
  const fallbackUsers = [
    { username:'admin', password:'1234', role:'admin', label:'Admin', permissions:['*'] },
    { username:'kullanici', password:'1234', role:'user', label:'Kullanıcı', permissions:['dashboard','plan'] }
  ];
  const allUsers = [...activeUsers(), ...fallbackUsers.map(normalizeUser)];
  const account = allUsers.find(u => String(u.username).trim() === username && String(u.password).trim() === password);
  if(!account){
    showLogin('Kullanıcı adı veya şifre hatalı.');
    return false;
  }
  currentUser = { role: account.role, label: account.label || roleLabel(account.role), username: account.username, permissions: normalizeUser(account).permissions };
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
  const err = $('#loginError');
  if(err){ err.hidden = true; err.textContent = ''; }
  showApp();
  resetSessionTimer();
  return false;
}

function attachLoginHandler(){
  const form = $('#loginForm');
  if(!form || form.dataset.loginBound === '1') return;
  form.dataset.loginBound = '1';
  form.addEventListener('submit', handleLogin);
  $('#loginSubmitBtn')?.addEventListener('click', (ev)=>{ ev.preventDefault(); handleLogin({ preventDefault(){}, target: form }); });
}
attachLoginHandler();
document.addEventListener('DOMContentLoaded', attachLoginHandler);
function logout(message=''){
  currentUser = null;
  if(sessionTimer) clearTimeout(sessionTimer);
  localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY);
  activateView('dashboard');
  showLogin(message);
}

function save(){ state.settings = { ...DEFAULT_PLAN_SETTINGS, ...(state.settings || {}) }; localStorage.setItem(LS_KEY, JSON.stringify(state)); persistState(); $('#lastUpdated').textContent = 'Son güncelleme: ' + new Date().toLocaleString('tr-TR'); }
function renderPlanSettings(){
  state.settings = { ...DEFAULT_PLAN_SETTINGS, ...(state.settings || {}) };
  const sat = $('#skipSaturday'), sun = $('#skipSunday'), hol = $('#skipHolidays');
  if(sat) sat.checked = !!state.settings.skipSaturday;
  if(sun) sun.checked = !!state.settings.skipSunday;
  if(hol) hol.checked = !!state.settings.skipHolidays;
  const note = $('#planningRulesNote');
  if(note){
    const active = [];
    if(state.settings.skipSaturday) active.push('Cumartesi');
    if(state.settings.skipSunday) active.push('Pazar');
    if(state.settings.skipHolidays) active.push('Resmi/Dini tatiller');
    note.textContent = active.length ? `Planlama hesabına alınmayacak günler: ${active.join(', ')}.` : 'Tüm günler üretim hesabına dahil edilecek.';
  }
}
function clearTable(table){ table.innerHTML=''; }
function makeTable(table, headers, rows){
  clearTable(table); const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r=>`<tr class="status-${statusClass(r.Durum)}">${headers.map(h=>`<td>${escapeHtml(r[h] ?? '')}</td>`).join('')}</tr>`).join('');
  table.append(thead, tbody);
}

function makeDashboardStatusTable(table, headers, rows){
  clearTable(table);
  const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r=>`<tr class="status-${statusClass(r.Durum)}">${headers.map(h=>{
    if(h==='Durum'){
      const current = r.Durum || 'Planlandı';
      const statusOptions = ['Üretimde','Bitti'];
      const placeholder = current==='Üretimde' ? '' : `<option value="${escapeHtml(current)}" selected disabled>${escapeHtml(current)}</option>`;
      return `<td><select class="dashboard-status-select status-${statusClass(current)}" data-index="${r._idx}">${placeholder}${statusOptions.map(st=>`<option value="${st}" ${st===current?'selected':''}>${st}</option>`).join('')}</select></td>`;
    }
    return `<td>${escapeHtml(r[h] ?? '')}</td>`;
  }).join('')}</tr>`).join('');
  table.append(thead, tbody);
  $$('#recentTable .dashboard-status-select').forEach(sel=>sel.addEventListener('change', onStatusChange));
}

function statusClass(status){ return String(status||'Planlandı').toLocaleLowerCase('tr-TR').replace('ı','i').replace('ü','u').replace('ş','s').replace('ğ','g').replace('ç','c').replace('ö','o'); }
function productBoyaKoduByKod(kod){
  const product = state.products.find(x=>String(x.kod || '').trim() === String(kod || '').trim());
  return product ? String(product.boya_kodu || product.boyaKodu || product['Boya Kodu'] || '').trim() : '';
}
function planBoyaKodu(p){
  return String(p?.['Boya Kodu'] || p?.Boya || productBoyaKoduByKod(p?.['Ürün Kodu']) || '').trim();
}
function planToRow(p,idx){
  const start = parsePlanDate(p,'start'), end = parsePlanDate(p,'end'), production = p.productionISO ? new Date(p.productionISO) : null;
  return {
    '#': p['Sıra'] || idx+1,
    Makine:normalizeMachineName(p.Makine) || p.Makine,
    'Ürün Kodu':p['Ürün Kodu'],
    'Ürün Adı':p['Ürün Adı'],
    'Kalıp':p['Kalıp No'],
    Göz:p['Göz'],
    'Çevrim sn':p['Çevrim (sn)'],
    Adet:p['Adet'],
    Boya:planBoyaKodu(p),
    'Planlanan Başlangıç': fmtDateTime(start),
    'Planlanan Bitiş': fmtDateTime(end),
    'Üretime Alınma': fmtDateTime(production),
    'Plan/Üretim Farkı': p.productionDiff || (production ? diffText(start, production) : ''),
    'Üretim Başlama Notu': p.productionNote || '',
    'Bitti Tarihi': p.finishedISO ? fmtDateTime(new Date(p.finishedISO)) : '',
    'Bitiş Notu': p.finishNote || '',
    Durum:p['Durum'] || 'Planlandı'
  };
}
function isValidPlanObject(p){
  const machine = normalizeMachineName(p?.Makine);
  const kod = String(p?.['Ürün Kodu'] || '').trim();
  const ad = String(p?.['Ürün Adı'] || '').trim();
  const adet = num(p?.Adet);
  const combined = `${kod} ${ad}`.toLocaleLowerCase('tr-TR');
  const looksLikeNote = combined.includes('giriş yapılacak') || combined.includes('mavi alan') || combined.includes('otomatik hesaplanır') || combined.includes('başlangıç...');
  return !!machine && !!kod && !!ad && adet > 0 && !looksLikeNote;
}
function normalizeStateMachines(){
  if(!Array.isArray(state.plans)) state.plans = [];
  state.plans.forEach(p=>{
    const normalized = normalizeMachineName(p.Makine);
    if(normalized) p.Makine = normalized;
  });
  if(Array.isArray(state.products)){
    state.products.forEach(p=>{
      p.boya_kodu = String(p.boya_kodu || p.boyaKodu || p['Boya Kodu'] || p.boya || '').trim();
      if(p.machines || p.uygunMakineler || p['Uygun Makineler']){
        const list = parseMachineList(p.machines || p.uygunMakineler || p['Uygun Makineler']);
        p.machines = list.length ? list : machines.slice();
      }
    });
  }
}
function cleanInvalidPlans(){
  normalizeStateMachines();
  const before = state.plans.length;
  state.plans = state.plans.filter(isValidPlanObject);
  return before !== state.plans.length;
}
function normalizedPlans(){ return state.plans.filter(isValidPlanObject).map(planToRow); }
function activePlans(){ return normalizedPlans().filter(p=>p.Durum !== 'Bitti'); }
function finishedPlans(){ return normalizedPlans().filter(p=>p.Durum === 'Bitti'); }
function dashboardPlansForSelected(plans){
  return selectedDashboardMachine ? plans.filter(p=>p.Makine===selectedDashboardMachine) : plans;
}
function updateDashboardSelectedTitle(count){
  const title = $('#selectedMachineTitle');
  const clear = $('#clearMachineFilter');
  if(!title || !clear) return;
  if(selectedDashboardMachine){
    title.textContent = `${selectedDashboardMachine} Planlanan İşler (${count})`;
    clear.hidden = false;
  }else{
    title.textContent = `Yakın Üretim Planı`;
    clear.hidden = true;
  }
}
function renderDashboard(){
  const plans = state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx})).filter((r,idx)=>isValidPlanObject(state.plans[r._idx])).filter(p=>p.Durum !== 'Bitti');
  const selectedPlans = selectedDashboardMachine ? plans.filter(p=>p.Makine===selectedDashboardMachine) : plans;
  $('#kpiPlans').textContent = fmt(selectedPlans.length);
  $('#kpiQty').textContent = fmt(selectedPlans.reduce((a,p)=>a+num(p.Adet),0));
  const kpiMachine = $('#kpiMachine');
  if(kpiMachine) kpiMachine.textContent = selectedDashboardMachine || 'Tümü';
  const kpiMachineStatus = $('#kpiMachineStatus');
  if(kpiMachineStatus){
    let statusText = 'Genel';
    let statusClass = 'status-general';
    if(selectedDashboardMachine){
      const hasProduction = selectedPlans.some(p => p.Durum === 'Üretimde');
      const hasPlanned = selectedPlans.some(p => p.Durum === 'Planlandı');
      const hasCancelledOnly = selectedPlans.length && selectedPlans.every(p => p.Durum === 'İptal');
      if(hasProduction){ statusText = 'Üretimde'; statusClass = 'status-working'; }
      else if(hasPlanned){ statusText = 'Planlandı'; statusClass = 'status-planned'; }
      else if(hasCancelledOnly){ statusText = 'İptal'; statusClass = 'status-cancelled'; }
      else { statusText = 'Boşta'; statusClass = 'status-idle'; }
    }
    kpiMachineStatus.textContent = statusText;
    kpiMachineStatus.className = statusClass;
  }
  const dashboardActive = $('#dashboard')?.classList.contains('active');
  if(dashboardActive) $('#pageTitle').textContent = selectedDashboardMachine ? `${selectedDashboardMachine} Genel Durumu` : 'Makine Genel Durumu';
  const q = ($('#dashboardSearch').value||'').toLocaleLowerCase('tr-TR');
  const max = Math.max(1,...machines.map(m=>plans.filter(p=>p.Makine===m).reduce((a,p)=>a+num(p.Adet),0)));
  $('#machineSummary').innerHTML = machines.map(m=>{
    const rows = plans.filter(p=>p.Makine===m && JSON.stringify(p).toLocaleLowerCase('tr-TR').includes(q));
    const qty = rows.reduce((a,p)=>a+num(p.Adet),0), pct=Math.min(100,qty/max*100);
    const active = rows.filter(p=>p.Durum==='Üretimde').length;
    const isSelected = selectedDashboardMachine === m;
    return `<button type="button" class="machine-card ${isSelected?'selected':''}" data-machine="${escapeHtml(m)}" title="${escapeHtml(m)} planlanan işleri göster"><h4>${escapeHtml(machineShortName(m))}</h4><div class="machine-detail">${escapeHtml(machineDetailName(m))}</div><div>${rows.length} iş · ${fmt(qty)} adet · ${active} üretimde</div><div class="bar"><i style="width:${pct}%"></i></div><small>Planları görmek için tıklayın</small></button>`;
  }).join('');
  $$('#machineSummary .machine-card').forEach(card=>card.addEventListener('click',()=>{
    selectedDashboardMachine = card.dataset.machine;
    renderDashboard();
    $('#recentTable')?.scrollIntoView({behavior:'smooth', block:'start'});
  }));
  const tablePlans = sortPlanRowsForDisplay(dashboardPlansForSelected(plans));
  updateDashboardSelectedTitle(tablePlans.length);
  makeDashboardStatusTable($('#recentTable'), ['Makine','Ürün Kodu','Ürün Adı','Adet','Boya','Planlanan Başlangıç','Planlanan Bitiş','Üretime Alınma','Plan/Üretim Farkı','Durum'], selectedDashboardMachine ? tablePlans : tablePlans.slice(0,12));
}
function renderPlan(){
  const q = ($('#planSearch').value||'').toLocaleLowerCase('tr-TR');
  const rows = sortPlanRowsForDisplay(state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>isValidPlanObject(state.plans[r._idx]))
    .filter(r=>r.Durum !== 'Bitti')
    .filter(r=>JSON.stringify(r).toLocaleLowerCase('tr-TR').includes(q)));
  const headers = ['#','Makine','Ürün Kodu','Ürün Adı','Kalıp','Göz','Çevrim sn','Adet','Boya','Planlanan Başlangıç','Planlanan Bitiş','Üretime Alınma','Plan/Üretim Farkı','Üretim Başlama Notu','Durum'];
  const visibleHeaders = planEditMode ? [...headers, 'Düzenle'] : headers;
  const table = $('#planTable'); clearTable(table);
  const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${visibleHeaders.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r=>`<tr class="status-${statusClass(r.Durum)}">${visibleHeaders.map(h=>{
    if(h==='Durum'){
      return `<td><select class="status-select status-${statusClass(r.Durum)}" data-index="${r._idx}">${STATUSES.map(s=>`<option value="${s}" ${s===r.Durum?'selected':''}>${s}</option>`).join('')}</select></td>`;
    }
    if(h==='Düzenle'){
      return `<td><div class="row-actions"><button type="button" class="primary small-btn plan-edit-row" data-index="${r._idx}">Düzenle</button></div></td>`;
    }
    return `<td>${escapeHtml(r[h] ?? '')}</td>`;
  }).join('')}</tr>`).join('');
  table.append(thead, tbody);
  $$('#planTable .status-select').forEach(sel=>sel.addEventListener('change', onStatusChange));
  $$('#planTable .plan-edit-row').forEach(btn=>btn.addEventListener('click',()=>openPlanEditModal(Number(btn.dataset.index))));
}
function renderFinished(){
  const table = $('#finishedTable');
  if(!table) return;
  const q = ($('#finishedSearch')?.value||'').toLocaleLowerCase('tr-TR');
  const rows = state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>r.Durum === 'Bitti')
    .filter(r=>JSON.stringify(r).toLocaleLowerCase('tr-TR').includes(q));
  const headers = ['#','Makine','Ürün Kodu','Ürün Adı','Kalıp','Göz','Çevrim sn','Adet','Boya','Planlanan Başlangıç','Planlanan Bitiş','Üretime Alınma','Plan/Üretim Farkı','Üretim Başlama Notu','Bitti Tarihi','Bitiş Notu','Durum'];
  clearTable(table);
  const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(r=>`<tr class="status-${statusClass(r.Durum)}">${headers.map(h=>{
    if(h==='Durum'){
      return `<td><select class="status-select status-${statusClass(r.Durum)}" data-index="${r._idx}">${STATUSES.map(s=>`<option value="${s}" ${s===r.Durum?'selected':''}>${s}</option>`).join('')}</select></td>`;
    }
    return `<td>${escapeHtml(r[h] ?? '')}</td>`;
  }).join('')}</tr>`).join('');
  table.append(thead, tbody);
  $$('#finishedTable .status-select').forEach(sel=>sel.addEventListener('change', onStatusChange));
}
function renderProducts(){
  const q = ($('#productSearch').value||'').toLocaleLowerCase('tr-TR');
  const rows = state.products.map((p,idx)=>({...p, _idx:idx})).filter(p=>JSON.stringify(p).toLocaleLowerCase('tr-TR').includes(q));
  const headers = ['Ürün Kodu','Ürün Adı','Kalıp No','Göz','Çevrim sn','Uygun Makineler','İşlem'];
  const table = $('#productTable'); clearTable(table);
  const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(p=>`<tr>
    <td>${escapeHtml(p.kod)}</td>
    <td>${escapeHtml(p.ad)}</td>
    <td>${escapeHtml(p.kalip)}</td>
    <td>${escapeHtml(p.goz)}</td>
    <td>${escapeHtml(p.cevrim)}</td>
    <td class="machine-list"><div class="machine-cell-actions">${getProductMachineList(p).map(m=>`<span class="machine-token small-btn" title="${escapeHtml(m)}">${escapeHtml(machineShortName(m))}<small>${escapeHtml(machineDetailName(m))}</small></span>`).join('')}</div></td>
    <td>${hasPermission('products') ? `<div class="product-machine-actions"><button type="button" class="primary small-btn edit-product" data-index="${p._idx}">Düzenle</button><button type="button" class="secondary small-btn edit-product-machines" data-index="${p._idx}">Makine Ata</button><button type="button" class="danger small-btn delete-product" data-index="${p._idx}">Sil</button></div>` : '<span class="muted">Yetki yok</span>'}</td>
  </tr>`).join('');
  table.append(thead, tbody);
  $$('#productTable .delete-product').forEach(btn=>btn.addEventListener('click',()=>deleteProduct(Number(btn.dataset.index))));
  $$('#productTable .edit-product').forEach(btn=>btn.addEventListener('click',()=>editProduct(Number(btn.dataset.index))));
  $$('#productTable .edit-product-machines').forEach(btn=>btn.addEventListener('click',()=>editProductMachines(Number(btn.dataset.index))));
  setupProductTopScroll();
}
function setupProductTopScroll(){
  const top = $('#productTopScroll'), bottom = $('#productTableWrap'), spacer = $('#productTopScrollSpacer'), table = $('#productTable');
  if(!top || !bottom || !spacer || !table) return;
  spacer.style.width = `${table.scrollWidth}px`;
  top.onscroll = () => { bottom.scrollLeft = top.scrollLeft; };
  bottom.onscroll = () => { top.scrollLeft = bottom.scrollLeft; };
}
function showMachinePicker(product, currentList, sameMoldCount){
  return new Promise(resolve=>{
    let modal = $('#machinePickerModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'machinePickerModal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card">
          <h3 id="machinePickerTitle">Makine Seç</h3>
          <p id="machinePickerInfo" class="note mini-note"></p>
          <div id="machinePickerList" class="machine-picker-list"></div>
          <div class="modal-actions">
            <button type="button" id="machinePickerSave">Kaydet</button>
            <button type="button" id="machinePickerCancel" class="secondary">Vazgeç</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    $('#machinePickerTitle').textContent = `${product.kod} için uygun makineler`;
    $('#machinePickerInfo').textContent = product.kalip ? `Kalıp No: ${product.kalip}. Kaydedince aynı kalıp numarasına sahip ${sameMoldCount} ürüne otomatik uygulanır.` : 'Bu ürün için uygun makineleri seçin.';
    const selectedSet = new Set((currentList || []).map(m=>normalizeMachineName(m) || m));
    $('#machinePickerList').innerHTML = machines.map(m=>`
      <label class="machine-picker-item">
        <input type="checkbox" value="${escapeHtml(m)}" ${selectedSet.has(m) ? 'checked' : ''} />
        <span><strong>${escapeHtml(machineShortName(m))}</strong><small>${escapeHtml(machineDetailName(m))}</small></span>
      </label>`).join('');
    modal.hidden = false;
    const cleanup = value => {
      modal.hidden = true;
      $('#machinePickerSave').onclick = null;
      $('#machinePickerCancel').onclick = null;
      resolve(value);
    };
    $('#machinePickerSave').onclick = () => cleanup([...$('#machinePickerList').querySelectorAll('input:checked')].map(i=>i.value));
    $('#machinePickerCancel').onclick = () => cleanup(null);
  });
}
async function editProduct(index){
  if(!hasPermission('products')) return alert('Bu işlem için Ürünler yetkisi gerekir.');
  const product = state.products[index];
  if(!product) return alert('Ürün bulunamadı.');
  let modal = $('#productEditModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'productEditModal';
    modal.className = 'modal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-card plan-edit-card" role="dialog" aria-modal="true">
        <div class="timing-note-head">
          <div><h3>Ürünü Düzenle</h3><p class="note mini-note">Ürün bilgilerini güncelleyebilirsiniz.</p></div>
          <button type="button" class="icon-btn" data-product-edit-close title="Kapat">×</button>
        </div>
        <div class="grid two">
          <label>Ürün Kodu<input type="text" data-product-edit-kod disabled /></label>
          <label>Ürün Adı<input type="text" data-product-edit-ad required /></label>
          <label>Kalıp No<input type="text" data-product-edit-kalip required /></label>
          <label>Göz<input type="number" min="1" data-product-edit-goz required /></label>
          <label>Çevrim sn<input type="number" min="1" data-product-edit-cevrim required /></label>
        </div>
        <p class="timing-note-error" hidden data-product-edit-error>Ürün adı, kalıp, göz ve çevrim bilgileri geçerli olmalıdır.</p>
        <div class="modal-actions">
          <button type="button" class="btn secondary" data-product-edit-cancel>İptal</button>
          <button type="button" class="btn primary" data-product-edit-save>Kaydet</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  const kod = modal.querySelector('[data-product-edit-kod]');
  const ad = modal.querySelector('[data-product-edit-ad]');
  const kalip = modal.querySelector('[data-product-edit-kalip]');
  const goz = modal.querySelector('[data-product-edit-goz]');
  const cevrim = modal.querySelector('[data-product-edit-cevrim]');
  const error = modal.querySelector('[data-product-edit-error]');
  kod.value = product.kod || '';
  ad.value = product.ad || '';
  kalip.value = product.kalip || '';
  goz.value = product.goz || 1;
  cevrim.value = product.cevrim || 1;
  error.hidden = true;
  modal.hidden = false;
  const cleanup = ()=>{
    modal.hidden = true;
    saveBtn.removeEventListener('click', onSave);
    cancelBtn.removeEventListener('click', cleanup);
    closeBtn.removeEventListener('click', cleanup);
  };
  const onSave = ()=>{
    const newAd = String(ad.value || '').trim();
    const newKalip = String(kalip.value || '').trim();
    const newGoz = num(goz.value);
    const newCevrim = num(cevrim.value);
    if(!newAd || !newKalip || newGoz <= 0 || newCevrim <= 0){ error.hidden = false; return; }
    product.ad = newAd;
    product.kalip = newKalip;
    product.goz = newGoz;
    product.cevrim = newCevrim;
    state.plans.forEach(plan=>{
      if(String(plan['Ürün Kodu'] || '') === String(product.kod || '')){
        plan['Ürün Adı'] = product.ad;
        plan['Kalıp No'] = product.kalip;
        plan['Göz'] = product.goz;
        plan['Çevrim (sn)'] = product.cevrim;
      }
    });
    save(); renderAll(); cleanup();
  };
  const saveBtn = modal.querySelector('[data-product-edit-save]');
  const cancelBtn = modal.querySelector('[data-product-edit-cancel]');
  const closeBtn = modal.querySelector('[data-product-edit-close]');
  saveBtn.addEventListener('click', onSave);
  cancelBtn.addEventListener('click', cleanup);
  closeBtn.addEventListener('click', cleanup);
  setTimeout(()=>ad.focus(), 50);
}

async function editProductMachines(index){
  if(!hasPermission('products')) return alert('Bu işlem için Ürünler yetkisi gerekir.');
  const p = state.products[index];
  if(!p) return;
  const current = getProductMachineList(p);
  const sameMold = state.products.filter(x => String(x.kalip || '').trim().toLocaleLowerCase('tr-TR') === String(p.kalip || '').trim().toLocaleLowerCase('tr-TR'));
  const list = await showMachinePicker(p, current, sameMold.length);
  if(list === null) return;
  if(!list.length) return alert('En az bir makine seçin.');

  const moldKey = String(p.kalip || '').trim().toLocaleLowerCase('tr-TR');
  let updatedCount = 0;
  state.products.forEach(product => {
    const productMoldKey = String(product.kalip || '').trim().toLocaleLowerCase('tr-TR');
    if(moldKey && productMoldKey === moldKey){
      product.machines = [...list];
      updatedCount++;
    }
  });
  if(!moldKey){
    p.machines = list;
    updatedCount = 1;
  }

  save(); renderProducts(); setupForm(); applyAutoMachineForProduct(false);
  alert(moldKey ? `${p.kalip} kalıp numarasına sahip ${updatedCount} ürüne makine atandı.` : `${p.kod} ürününe makine atandı.`);
}
function deleteProduct(index){
  if(!hasPermission('products')) return alert('Bu işlem için Ürünler yetkisi gerekir.');
  const p = state.products[index];
  if(!p) return;
  const used = state.plans.some(plan => plan['Ürün Kodu'] === p.kod);
  const msg = used ? `${p.kod} planlarda kullanılmış. Yine de silinsin mi?` : `${p.kod} ürünü silinsin mi?`;
  if(!confirm(msg)) return;
  state.products.splice(index, 1);
  save(); setupForm(); renderProducts();
}
function renderUsers(){
  const table = $('#userTable');
  if(!table) return;
  const headers = ['Kullanıcı Adı','Rol','Ad / Etiket','Sayfa Yetkileri','İşlem'];
  clearTable(table);
  const thead=document.createElement('thead'), tbody=document.createElement('tbody');
  thead.innerHTML = `<tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = activeUsers().map(u=>{
    const perms = userPermissions(u);
    const disabled = u.username === 'admin' ? 'disabled' : '';
    const permissionChecks = VIEW_PERMISSIONS.map(v=>`<label class="mini-check"><input type="checkbox" class="user-permission" data-username="${escapeHtml(u.username)}" data-permission="${v.key}" ${perms.includes(v.key)?'checked':''} ${disabled} /> ${escapeHtml(v.label)}</label>`).join('');
    const action = u.username === 'admin' ? '<span class="muted">Ana admin tüm yetkilidir</span>' : `<button type="button" class="danger small-btn delete-user" data-username="${escapeHtml(u.username)}">Sil</button>`;
    return `<tr><td>${escapeHtml(u.username)}</td><td><strong>${escapeHtml(roleLabel(u.role))}</strong></td><td>${escapeHtml(u.label || roleLabel(u.role))}</td><td><div class="permission-grid">${permissionChecks}</div></td><td>${action}</td></tr>`;
  }).join('');
  table.append(thead, tbody);
  $$('#userTable .delete-user').forEach(btn=>btn.addEventListener('click',()=>deleteUser(btn.dataset.username)));
  $$('#userTable .user-permission').forEach(chk=>chk.addEventListener('change',()=>updateUserPermission(chk.dataset.username, chk.dataset.permission, chk.checked)));
}
function updateUserPermission(username, permission, checked){
  if(!canAccessView('users')) return alert('Bu işlem için kullanıcı yönetimi yetkisi gerekir.');
  const u = users.find(x=>x.username === username);
  if(!u || username === 'admin') return;
  u.role = u.role || 'user';
  u.permissions = Array.isArray(u.permissions) ? u.permissions.filter(p=>p !== '*') : [];
  if(checked && !u.permissions.includes(permission)) u.permissions.push(permission);
  if(!checked) u.permissions = u.permissions.filter(p=>p !== permission);
  if(!u.permissions.length){
    alert('Kullanıcıda en az bir yetki kalmalı.');
    u.permissions.push(permission);
    renderUsers();
    return;
  }
  saveUsers();
  if(currentUser?.username === username){ currentUser.permissions = u.permissions; sessionStorage.setItem(AUTH_KEY, JSON.stringify(currentUser)); applyPermissions(); }
}
function deleteUser(username){
  if(!hasPermission('users')) return alert('Bu işlem için Kullanıcı Yönetimi yetkisi gerekir.');
  if(username === currentUser?.username) return alert('Aktif kullanıcı kendisini silemez.');
  if(confirm(`${username} kullanıcısı silinsin mi?`)){
    users = users.filter(u=>u.username !== username);
    saveUsers();
    renderUsers();
  }
}
function calculateFinish(start, qty, eyes, cycleSec, grossHours, meal, tea){
  const workMinutes = Math.ceil((qty / Math.max(1,eyes)) * cycleSec / 60);
  return calculateFinishByWorkMinutes(start, workMinutes, grossHours, meal, tea);
}
function holidayType(text){
  const t = String(text || '').toLocaleLowerCase('tr-TR');
  return (t.includes('ramazan') || t.includes('kurban')) ? 'religious' : 'official';
}
function workRulesForPlan(plan={}){
  state.settings = { ...DEFAULT_PLAN_SETTINGS, ...(state.settings || {}) };
  const globalHolidayWork = !state.settings.skipHolidays;
  return {
    saturday: plan.workSaturday ?? !state.settings.skipSaturday,
    sunday: plan.workSunday ?? !state.settings.skipSunday,
    officialHoliday: plan.workOfficialHoliday ?? globalHolidayWork,
    religiousHoliday: plan.workReligiousHoliday ?? globalHolidayWork
  };
}
function calculateFinishByWorkMinutes(start, workMinutes, grossHours, meal, tea, planRules={}){
  const rules = workRulesForPlan(planRules || {});
  const gross = Math.max(1, num(grossHours || 8));
  const netMinutesPerDay = Math.max(60, gross*60 - num(meal) - num(tea));
  let remaining = Math.max(1, Math.ceil(workMinutes));
  let d = new Date(start);
  const holidays = new Map((state.holidays || []).map(h=>[fmtExcelDate(h.serial), h.aciklama || '']));
  function isOff(x){
    const day=x.getDay();
    if(!rules.sunday && day===0) return true;
    if(!rules.saturday && day===6) return true;
    const holidayName = holidays.get(x.toLocaleDateString('tr-TR'));
    if(holidayName){
      const type = holidayType(holidayName);
      if(type === 'religious' && !rules.religiousHoliday) return true;
      if(type === 'official' && !rules.officialHoliday) return true;
    }
    return false;
  }
  function nextWorkDay(x){
    const n = new Date(x);
    n.setDate(n.getDate()+1);
    n.setHours(gross >= 24 ? 0 : 8,0,0,0);
    while(isOff(n)){ n.setDate(n.getDate()+1); n.setHours(gross >= 24 ? 0 : 8,0,0,0); }
    return n;
  }
  while(remaining>0){
    if(isOff(d)){ d = nextWorkDay(d); continue; }
    let dayStart, dayEnd;
    if(gross >= 24){
      // 24 saat seçilince gün içinde 22 saat net çalışma kabul edilir (90 dk yemek + 30 dk çay).
      dayStart = new Date(d); dayStart.setHours(0,0,0,0);
      dayEnd = new Date(dayStart.getTime()+netMinutesPerDay*60000);
      if(d < dayStart) d = dayStart;
      if(d >= dayEnd){ d = nextWorkDay(d); continue; }
    }else{
      dayStart = new Date(d); dayStart.setHours(8,0,0,0);
      dayEnd = new Date(dayStart.getTime()+netMinutesPerDay*60000);
      if(d < dayStart) d = dayStart;
      if(d >= dayEnd){ d = nextWorkDay(d); continue; }
    }
    const available = Math.max(0, Math.floor((dayEnd-d)/60000));
    if(!available){ d = nextWorkDay(d); continue; }
    const use=Math.min(available,remaining);
    d = new Date(d.getTime()+use*60000);
    remaining -= use;
  }
  return d;
}
function netMinutesForPlan(p){
  const gross = num(p.grossHours || 8);
  const meal = num(p.meal ?? (gross >= 24 ? 90 : 45));
  const tea = num(p.tea ?? (gross >= 24 ? 30 : 15));
  return Math.max(60, gross*60 - meal - tea);
}
function plannedDaysForPlan(p){
  if(num(p.plannedDays) > 0) return num(p.plannedDays);
  return Math.max(1, Math.ceil(planDurationMinutes(p) / netMinutesForPlan(p)));
}
function lastEndForMachine(machine){
  const normalized = normalizeMachineName(machine) || machine;
  return state.plans.filter(p=>(normalizeMachineName(p.Makine) || p.Makine)===normalized).map(p=>parsePlanDate(p,'end')).filter(Boolean).sort((a,b)=>b-a)[0] || null;
}
function setSuggestedStart(force=false){
  const machine = $('select[name="machine"]')?.value;
  const input = $('input[name="start"]'); if(!machine || !input) return;
  const lastEnd = lastEndForMachine(machine);
  const suggested = lastEnd || new Date();
  if(force || !input.value) input.value = toInputDateTime(suggested);
  $('#startHint').textContent = lastEnd ? `Bu makinedeki önceki planın bitişi dikkate alındı: ${fmtDateTime(lastEnd)}` : 'Bu makinede önceki plan yok; başlangıç için güncel tarih/saat önerildi.';
}
function setupForm(){
  const productList=$('#productList'); productList.innerHTML=state.products.map(p=>`<option value="${escapeHtml(p.kod)}">${escapeHtml(p.ad)}</option>`).join('');
  const sel=$('select[name="machine"]');
  const selected = sel.value || machines[0];
  sel.innerHTML=machines.map(m=>`<option ${m===selected?'selected':''}>${m}</option>`).join('');
  const color=$('select[name="color"]'); const selectedColor=color.value || '';
  color.innerHTML='<option value="">Seçiniz</option>'+state.colors.map(c=>`<option value="${escapeHtml(c.kod)}" ${c.kod===selectedColor?'selected':''}>${escapeHtml(c.kod)} - ${escapeHtml(c.aciklama)}</option>`).join('');
  const productMachines = $('#productMachinesSelect');
  renderMachineSelectPanel(productMachines, machines);
  setSuggestedStart(!($('input[name="start"]').value));
}
function recalcAllMachineQueues(){
  machines.forEach(machine=>{
    const indexes = activeMachineIndexes(machine);
    if(!indexes.length) return;
    const first = state.plans[indexes[0]];
    const start = (first && first['Durum'] === 'Üretimde' && first.productionISO) ? new Date(first.productionISO) : (parsePlanDate(first,'start') || new Date());
    recalcMachineQueue(machine, indexes[0], start);
  });
}
function renderAll(){ cleanInvalidPlans(); recalcAllMachineQueues(); setupForm(); setupPrintControls(); renderPlanSettings(); renderDashboard(); renderPlan(); renderFinished(); renderProducts(); renderUsers(); renderMachinePrint(); save(); }

function planDurationMinutes(p){
  // Üretim süresi her zaman ürün bilgilerine göre hesaplanır:
  // (Adet / Göz) * Çevrim(sn). Eski bitiş tarihi hatalıysa onu süre hesabına katmayız.
  const qty = num(p.Adet);
  const eyes = num(p['Göz']);
  const cycle = num(p['Çevrim (sn)']);
  if(qty > 0 && eyes > 0 && cycle > 0){
    return Math.max(1, Math.ceil((qty / Math.max(1, eyes)) * cycle / 60));
  }
  const start = parsePlanDate(p,'start'), end = parsePlanDate(p,'end');
  if(start && end && !isNaN(start) && !isNaN(end) && end > start) return Math.max(1, Math.round((end-start)/60000));
  return 1;
}
function setPlanDates(p, start, end){
  p.startISO = start.toISOString();
  p.endISO = end.toISOString();
  p.startText = fmtDateTime(start);
  p.endText = fmtDateTime(end);
}
function refreshPlanOrderNumbers(){
  state.plans.forEach((p,i)=>{ p['Sıra'] = i + 1; });
}
function activeMachineIndexes(machine){
  const normalized = normalizeMachineName(machine) || machine;
  return state.plans
    .map((p,i)=>({p,i}))
    .filter(x=>(normalizeMachineName(x.p.Makine) || x.p.Makine) === normalized && x.p['Durum'] !== 'Bitti')
    .sort((a,b)=>{
      // Ekranda ve hesaplamada üretimde olan iş her zaman makinenin ilk işi kabul edilir.
      if(a.p['Durum'] === 'Üretimde' && b.p['Durum'] !== 'Üretimde') return -1;
      if(b.p['Durum'] === 'Üretimde' && a.p['Durum'] !== 'Üretimde') return 1;
      const as=parsePlanDate(a.p,'start') || new Date(8640000000000000);
      const bs=parsePlanDate(b.p,'start') || new Date(8640000000000000);
      return as-bs || a.i-b.i;
    })
    .map(x=>x.i);
}
function promotePlanToMachineTop(index){
  const plan = state.plans[index];
  if(!plan) return index;
  const machine = plan.Makine;
  const normalized = normalizeMachineName(machine) || machine;
  const picked = state.plans[index];
  const before = state.plans.slice(0, index);
  const after = state.plans.slice(index + 1);
  const otherPlans = before.concat(after);
  const insertAt = otherPlans.findIndex(p=>(normalizeMachineName(p.Makine) || p.Makine) === normalized && p['Durum'] !== 'Bitti');
  if(insertAt === -1) state.plans = otherPlans.concat([picked]);
  else state.plans = otherPlans.slice(0, insertAt).concat([picked], otherPlans.slice(insertAt));
  refreshPlanOrderNumbers();
  return state.plans.indexOf(picked);
}
function recalcMachineQueue(machine, firstIndex=null, startFrom=null){
  let indexes = activeMachineIndexes(machine);
  if(firstIndex !== null && indexes.includes(firstIndex)) indexes = [firstIndex, ...indexes.filter(i=>i!==firstIndex)];
  if(!indexes.length) return;
  let cursor = startFrom || parsePlanDate(state.plans[indexes[0]], 'start') || new Date();
  indexes.forEach((idx, pos)=>{
    const plan = state.plans[idx];
    if(pos === 0 && plan['Durum'] === 'Üretimde'){
      cursor = plan.productionISO ? new Date(plan.productionISO) : cursor;
    }
    const workMinutes = num(plan.plannedDays) > 0 ? Math.round(num(plan.plannedDays) * netMinutesForPlan(plan)) : planDurationMinutes(plan);
    const end = calculateFinishByWorkMinutes(cursor, workMinutes, num(plan.grossHours || 8), num(plan.meal ?? (num(plan.grossHours || 8) >= 24 ? 90 : 45)), num(plan.tea ?? (num(plan.grossHours || 8) >= 24 ? 30 : 15)), plan);
    setPlanDates(plan, cursor, end);
    cursor = end;
  });
  refreshPlanOrderNumbers();
}
function sortPlanRowsForDisplay(rows){
  return rows.sort((a,b)=>{
    if(a.Durum === 'Üretimde' && b.Durum !== 'Üretimde') return -1;
    if(b.Durum === 'Üretimde' && a.Durum !== 'Üretimde') return 1;
    const as = parsePlanDate(state.plans[a._idx], 'start') || new Date(8640000000000000);
    const bs = parsePlanDate(state.plans[b._idx], 'start') || new Date(8640000000000000);
    return as-bs || a._idx-b._idx;
  });
}
function movePlanInMachineQueue(index, direction){
  if(!hasPermission('plan')) return alert('Bu işlem için Planlama yetkisi gerekir.');
  const plan = state.plans[index];
  if(!plan) return;
  const normalized = normalizeMachineName(plan.Makine) || plan.Makine;
  let indexes = state.plans.map((p,i)=>({p,i}))
    .filter(x=>(normalizeMachineName(x.p.Makine) || x.p.Makine) === normalized && x.p['Durum'] !== 'Bitti')
    .sort((a,b)=>{
      const as=parsePlanDate(a.p,'start') || new Date(8640000000000000);
      const bs=parsePlanDate(b.p,'start') || new Date(8640000000000000);
      return as-bs || a.i-b.i;
    }).map(x=>x.i);
  const pos = indexes.indexOf(index);
  if(pos < 0) return;
  if(direction === 'first') indexes = [index, ...indexes.filter(i=>i!==index)];
  if(direction === 'up' && pos > 0){ [indexes[pos-1], indexes[pos]] = [indexes[pos], indexes[pos-1]]; }
  if(direction === 'down' && pos < indexes.length-1){ [indexes[pos+1], indexes[pos]] = [indexes[pos], indexes[pos+1]]; }
  let cursor = parsePlanDate(state.plans[indexes[0]], 'start') || new Date();
  indexes.forEach(idx=>{
    const p = state.plans[idx];
    const workMinutes = num(p.plannedDays) > 0 ? Math.round(num(p.plannedDays) * netMinutesForPlan(p)) : planDurationMinutes(p);
    const end = calculateFinishByWorkMinutes(cursor, workMinutes, num(p.grossHours || 8), num(p.meal ?? (num(p.grossHours || 8) >= 24 ? 90 : 45)), num(p.tea ?? (num(p.grossHours || 8) >= 24 ? 30 : 15)), p);
    setPlanDates(p, cursor, end);
    cursor = end;
  });
  save(); renderDashboard(); renderPlan();
}
function setupBreakAutoUpdate(){
  const form = $('#planForm');
  if(!form) return;
  const gross = form.querySelector('[name="grossHours"]');
  const meal = form.querySelector('input[name="meal"]');
  const tea = form.querySelector('input[name="tea"]');
  if(!gross || !meal || !tea) return;
  gross.addEventListener('change',()=>{
    const h = num(gross.value);
    // 24 saat çalışma düzeninde molalar sabit: 90 dk yemek + 30 dk çay.
    // 0 yapılmaz; böylece net çalışma süresi 22 saat olarak hesaplanır.
    if(h >= 24){ meal.value = 90; tea.value = 30; }
    else if((num(meal.value) === 90 && num(tea.value) === 30) || (num(meal.value) === 0 && num(tea.value) === 0)){
      meal.value = 45;
      tea.value = 15;
    }
  });
}
function openTimingNoteModal({kind, planned, actual, timing, difference}){
  return new Promise(resolve=>{
    let modal = $('#timingNoteModal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'timingNoteModal';
      modal.className = 'modal-backdrop timing-note-backdrop';
      modal.hidden = true;
      modal.innerHTML = `
        <div class="modal-card timing-note-card" role="dialog" aria-modal="true" aria-labelledby="timingNoteTitle">
          <div class="timing-note-head">
            <div>
              <h3 id="timingNoteTitle">Sebep / Not Girişi</h3>
              <p id="timingNoteSub" class="note mini-note"></p>
            </div>
            <button type="button" class="icon-btn" data-timing-close title="Kapat">×</button>
          </div>
          <div class="timing-note-info">
            <div><span>Planlı Tarih</span><strong data-timing-planned></strong></div>
            <div><span>Gerçekleşen</span><strong data-timing-actual></strong></div>
            <div><span>Fark</span><strong data-timing-diff></strong></div>
          </div>
          <label class="field-label" for="timingNoteText">Not <b>*</b></label>
          <textarea id="timingNoteText" class="timing-note-text" rows="5" placeholder="Sebebi yazın..."></textarea>
          <p class="timing-note-error" hidden>Not yazmadan devam edemezsiniz.</p>
          <div class="modal-actions">
            <button type="button" class="btn secondary" data-timing-cancel>İptal</button>
            <button type="button" class="btn primary" data-timing-save>Kaydet</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    const label = kind === 'start' ? 'üretime başlama' : 'bitiş';
    const title = modal.querySelector('#timingNoteTitle');
    const sub = modal.querySelector('#timingNoteSub');
    const textarea = modal.querySelector('#timingNoteText');
    const error = modal.querySelector('.timing-note-error');
    title.textContent = `Planlı ${label} tarihinden ${timing} işlem`;
    sub.textContent = `1 saatten fazla erken/geç durumlarda not zorunludur.`;
    modal.querySelector('[data-timing-planned]').textContent = fmtDateTime(planned);
    modal.querySelector('[data-timing-actual]').textContent = fmtDateTime(actual);
    modal.querySelector('[data-timing-diff]').textContent = difference;
    textarea.value = '';
    error.hidden = true;
    modal.hidden = false;
    setTimeout(()=>textarea.focus(), 50);

    const cleanup = result=>{
      modal.hidden = true;
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      textarea.removeEventListener('input', onInput);
      resolve(result);
    };
    const onInput = ()=>{ if(textarea.value.trim()) error.hidden = true; };
    const onSave = ()=>{
      const val = textarea.value.trim();
      if(!val){ error.hidden = false; textarea.focus(); return; }
      cleanup(val);
    };
    const onCancel = ()=>cleanup(null);
    const saveBtn = modal.querySelector('[data-timing-save]');
    const cancelBtn = modal.querySelector('[data-timing-cancel]');
    const closeBtn = modal.querySelector('[data-timing-close]');
    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    textarea.addEventListener('input', onInput);
  });
}
async function requireTimingNote(kind, planned, actual){
  const diff = Math.round((actual - planned) / 60000);
  // Planlı tarihten +/- 1 saat içinde başlama veya bitiş yapılırsa not istenmez.
  if(!planned || isNaN(planned) || Math.abs(diff) <= 60) return '';
  const timing = diff > 0 ? 'geç' : 'erken';
  const difference = diffText(planned, actual);
  const note = await openTimingNoteModal({kind, planned, actual, timing, difference});
  if(note === null){
    alert('1 saatten fazla erken/geç işlem yapıldığında not yazılması zorunludur. Durum değiştirilmedi.');
    return null;
  }
  return `${timing.toLocaleUpperCase('tr-TR')} (${difference}) - ${note}`;
}
function openPlanEditModal(index){
  const p = state.plans[index];
  if(!p) return alert('Plan bulunamadı.');
  let modal = $('#planEditModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'planEditModal';
    modal.className = 'modal-backdrop plan-edit-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-card plan-edit-card" role="dialog" aria-modal="true" aria-labelledby="planEditTitle">
        <div class="timing-note-head">
          <div>
            <h3 id="planEditTitle">Planlanmış İşi Düzenle</h3>
            <p class="note mini-note" data-plan-edit-info></p>
          </div>
          <button type="button" class="icon-btn" data-plan-edit-close title="Kapat">×</button>
        </div>
        <div class="grid two">
          <label>Ürün Adedi
            <input type="number" min="1" step="1" data-plan-edit-qty />
          </label>
          <label>Boya Kodu / Kg
            <input type="text" data-plan-edit-color />
          </label>
          <fieldset class="plan-work-days">
            <legend>Çalışılacak Günler</legend>
            <label class="check-card compact"><input type="checkbox" data-plan-edit-saturday /> <span>Cumartesi</span></label>
            <label class="check-card compact"><input type="checkbox" data-plan-edit-sunday /> <span>Pazar</span></label>
            <label class="check-card compact"><input type="checkbox" data-plan-edit-official /> <span>Resmi Tatil</span></label>
            <label class="check-card compact"><input type="checkbox" data-plan-edit-religious /> <span>Dini Tatil</span></label>
          </fieldset>
          <label>Günlük Brüt Saat
            <select data-plan-edit-gross><option value="10">10 Saat</option><option value="12">12 Saat</option><option value="24">24 Saat</option></select>
          </label>
        </div>
        <p class="timing-note-error" hidden data-plan-edit-error>Adet ve günlük brüt saat geçerli olmalıdır.</p>
        <div class="modal-actions">
          <button type="button" class="btn secondary" data-plan-edit-cancel>İptal</button>
          <button type="button" class="btn primary" data-plan-edit-save>Kaydet</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  const info = modal.querySelector('[data-plan-edit-info]');
  const qty = modal.querySelector('[data-plan-edit-qty]');
  const color = modal.querySelector('[data-plan-edit-color]');
  const saturday = modal.querySelector('[data-plan-edit-saturday]');
  const sunday = modal.querySelector('[data-plan-edit-sunday]');
  const official = modal.querySelector('[data-plan-edit-official]');
  const religious = modal.querySelector('[data-plan-edit-religious]');
  const gross = modal.querySelector('[data-plan-edit-gross]');
  const error = modal.querySelector('[data-plan-edit-error]');
  info.textContent = `${p.Makine || ''} • ${p['Ürün Kodu'] || ''} - ${p['Ürün Adı'] || ''}`;
  qty.value = p['Adet'] || 1;
  color.value = p['Boya Kodu'] || '';
  const rules = workRulesForPlan(p);
  saturday.checked = !!rules.saturday;
  sunday.checked = !!rules.sunday;
  official.checked = !!rules.officialHoliday;
  religious.checked = !!rules.religiousHoliday;
  gross.value = ['10','12','24'].includes(String(p.grossHours)) ? String(p.grossHours) : '10';
  error.hidden = true;
  modal.hidden = false;
  setTimeout(()=>qty.focus(), 50);
  const cleanup = ()=>{
    modal.hidden = true;
    saveBtn.removeEventListener('click', onSave);
    cancelBtn.removeEventListener('click', cleanup);
    closeBtn.removeEventListener('click', cleanup);
  };
  const onSave = ()=>{
    const newQty = num(qty.value);
    const newGross = num(gross.value);
    if(newQty <= 0 || ![10,12,24].includes(newGross)){ error.hidden = false; qty.focus(); return; }
    p['Adet'] = newQty;
    p['Boya Kodu'] = color.value.trim();
    p.grossHours = newGross;
    p.meal = newGross >= 24 ? 90 : 45;
    p.tea = newGross >= 24 ? 30 : 15;
    p.workSaturday = !!saturday.checked;
    p.workSunday = !!sunday.checked;
    p.workOfficialHoliday = !!official.checked;
    p.workReligiousHoliday = !!religious.checked;
    delete p.plannedDays;
    const start = parsePlanDate(p,'start') || new Date();
    const workMinutes = planDurationMinutes(p);
    const end = calculateFinishByWorkMinutes(start, workMinutes, p.grossHours, p.meal, p.tea, p);
    setPlanDates(p, start, end);
    recalcMachineQueue(p.Makine, index, start);
    save();
    renderDashboard(); renderPlan(); renderFinished();
    cleanup();
  };
  const saveBtn = modal.querySelector('[data-plan-edit-save]');
  const cancelBtn = modal.querySelector('[data-plan-edit-cancel]');
  const closeBtn = modal.querySelector('[data-plan-edit-close]');
  saveBtn.addEventListener('click', onSave);
  cancelBtn.addEventListener('click', cleanup);
  closeBtn.addEventListener('click', cleanup);
}
async function onStatusChange(e){
  const idx = Number(e.target.dataset.index), p = state.plans[idx], status = e.target.value, oldStatus = p['Durum'] || 'Planlandı';
  const now = new Date();
  if(status === 'Üretimde'){
    const planned = parsePlanDate(p,'start');
    const note = await requireTimingNote('start', planned, now);
    if(note === null){ renderDashboard(); renderPlan(); renderFinished(); return; }
    p.productionISO = now.toISOString();
    p.productionText = fmtDateTime(now);
    p.productionDiff = diffText(planned, now);
    p.productionNote = note || '';
    p['Durum'] = status;
    const newIndex = promotePlanToMachineTop(idx);
    recalcMachineQueue(p.Makine, newIndex, now);
    selectedDashboardMachine = p.Makine;
  }
  if(status === 'Bitti'){
    const plannedEnd = parsePlanDate(p,'end');
    const note = await requireTimingNote('finish', plannedEnd, now);
    if(note === null){ p['Durum'] = oldStatus; renderDashboard(); renderPlan(); renderFinished(); return; }
    p.finishedISO = now.toISOString();
    p.finishedText = fmtDateTime(now);
    p.finishNote = note || '';
  }else{
    delete p.finishedISO; delete p.finishedText; delete p.finishNote;
  }
  if(status === 'Planlandı'){
    delete p.productionISO; delete p.productionText; delete p.productionDiff; delete p.productionNote;
  }
  p['Durum'] = status;
  save(); renderDashboard(); renderPlan(); renderFinished();
}
$$('.nav').forEach(btn=>btn.addEventListener('click',()=>activateView(btn.dataset.view)));
['dashboardSearch','planSearch','productSearch','finishedSearch'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{renderDashboard();renderPlan();renderFinished();renderProducts();}));
$('#clearMachineFilter')?.addEventListener('click',()=>{ selectedDashboardMachine=null; renderDashboard(); });
['skipSaturday','skipSunday','skipHolidays'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{
  state.settings = { ...DEFAULT_PLAN_SETTINGS, ...(state.settings || {}) };
  state.settings[id] = $('#'+id).checked;
  save(); renderPlanSettings(); setSuggestedStart(true);
}));
$('input[name="product"]')?.addEventListener('input',()=>applyAutoMachineForProduct(false));
$('input[name="product"]')?.addEventListener('change',()=>applyAutoMachineForProduct(true));
$('select[name="machine"]').addEventListener('change',()=>setSuggestedStart(true));
$('#planForm').addEventListener('submit',e=>{
  e.preventDefault(); const f=Object.fromEntries(new FormData(e.target).entries()); const p=state.products.find(x=>x.kod===f.product);
  if(!p){ alert('Ürün bulunamadı. Ürün kodunu listeden seçin.'); return; }
  const best = earliestMachineForProduct(p, new Date(f.start));
  f.machine = best.machine;
  const previousEnd = lastEndForMachine(f.machine);
  let start = new Date(f.start);
  if(best.available && start < best.available) start = new Date(best.available);
  if(previousEnd && start < previousEnd) start = new Date(previousEnd);
  const gh = num(f.grossHours); const mealMins = gh >= 24 ? 90 : num(f.meal); const teaMins = gh >= 24 ? 30 : num(f.tea);
  const newPlan = {'Sıra': state.plans.length+1, Makine:f.machine, 'Ürün Kodu':p.kod,'Ürün Adı':p.ad,'Kalıp No':p.kalip,'Göz':p.goz,'Çevrim (sn)':p.cevrim,'Adet':num(f.quantity),'Boya Kodu':String(f.color || p.boya_kodu || p.boyaKodu || p['Boya Kodu'] || '').trim(),'Durum':'Planlandı', grossHours:gh, meal:mealMins, tea:teaMins, workSaturday:!state.settings.skipSaturday, workSunday:!state.settings.skipSunday, workOfficialHoliday:!state.settings.skipHolidays, workReligiousHoliday:!state.settings.skipHolidays};
  const workMinutes = planDurationMinutes(newPlan);
  const end=calculateFinishByWorkMinutes(start, workMinutes, gh, mealMins, teaMins, newPlan);
  setPlanDates(newPlan, start, end);
  state.plans.push(newPlan);
  recalcMachineQueue(f.machine, state.plans.length-1, start);
  renderAll(); e.target.reset(); setupForm(); setSuggestedStart(true);
});

function minutesOverlap(aStart, aEnd, bStart, bEnd){
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, Math.round((end-start)/60000));
}
function setupPrintControls(){
  const machineSel = $('#printMachine');
  if(!machineSel) return;
  const current = machineSel.value || machines[0];
  machineSel.innerHTML = machines.map(m=>`<option value="${escapeHtml(m)}" ${m===current?'selected':''}>${escapeHtml(machineShortName(m)+' - '+machineDetailName(m))}</option>`).join('');
  const date = $('#printDate');
  if(date && !date.value){
    const d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    date.value = d.toISOString().slice(0,10);
  }
}
function printWindowContent(html){
  const w = window.open('', '_blank');
  if(!w){ alert('Yazdırma penceresi engellendi. Tarayıcı açılır pencere iznini kontrol edin.'); return; }
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Makine Bazlı Plan</title><link rel="stylesheet" href="style.css"></head><body class="print-only-body">${html}<script>window.onload=()=>{window.print();};<\/script></body></html>`);
  w.document.close();
}
function currentPrintRange(){
  const dateText = $('#printDate')?.value;
  const base = dateText ? new Date(dateText+'T00:00:00') : new Date();
  const shift = $('#printShift')?.value || 'all';
  let start = new Date(base), end = new Date(base);
  if(shift === 'day'){ start.setHours(8,0,0,0); end.setHours(20,0,0,0); }
  else if(shift === 'night'){ start.setHours(20,0,0,0); end.setDate(end.getDate()+1); end.setHours(8,0,0,0); }
  else { start.setHours(0,0,0,0); end.setDate(end.getDate()+1); end.setHours(0,0,0,0); }
  return {start,end,base,shift};
}
function updatePrintScopeUi(){
  const scope = $('#printScope')?.value || 'all';
  $$('.print-date-option').forEach(el=>{ el.hidden = scope !== 'date'; });
}
function plansForPrint(){
  const machine = $('#printMachine')?.value || machines[0];
  const type = $('#printPlanType')?.value || 'all';
  const scope = $('#printScope')?.value || 'all';
  const {start,end} = currentPrintRange();
  return state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>r.Makine === machine && r.Durum !== 'Bitti')
    .filter(r=>{
      if(type === 'working') return r.Durum === 'Üretimde';
      if(type === 'planned') return r.Durum === 'Planlandı';
      return true;
    })
    .filter(r=>{
      if(scope !== 'date') return true;
      const ps = parsePlanDate(state.plans[r._idx],'start');
      const pe = parsePlanDate(state.plans[r._idx],'end');
      return ps && pe && minutesOverlap(ps, pe, start, end) > 0;
    })
    .sort((a,b)=>(parsePlanDate(state.plans[a._idx],'start')||0)-(parsePlanDate(state.plans[b._idx],'start')||0));
}
function renderMachinePrint(){
  const sheet = $('#machinePrintSheet');
  if(!sheet) return;
  setupPrintControls();
  updatePrintScopeUi();
  const machine = $('#printMachine')?.value || machines[0];
  const {start,end,base,shift} = currentPrintRange();
  const rows = plansForPrint();
  const totalQty = rows.reduce((a,r)=>a+num(r.Adet),0);
  const totalMinutes = rows.reduce((a,r)=>{
    const p = state.plans[r._idx];
    const ps = parsePlanDate(p,'start'), pe = parsePlanDate(p,'end');
    return a + (ps && pe ? minutesOverlap(ps, pe, start, end) : 0);
  },0);
  const shiftText = shift === 'day' ? 'Gündüz Vardiyası (08:00 - 20:00)' : shift === 'night' ? 'Gece Vardiyası (20:00 - 08:00)' : 'Tüm Gün';
  const planTypeText = ($('#printPlanType option:checked')?.textContent || 'Tüm Planlar');
  const scopeText = ($('#printScope option:checked')?.textContent || 'Makinenin Tüm Planları');
  const gross = rows[0] ? (state.plans[rows[0]._idx].grossHours || '-') + ' Saat' : '-';
  const showSignature = $('#printShowSignature')?.checked ?? true;
  const showBarcode = $('#printShowBarcode')?.checked ?? true;
  sheet.innerHTML = `
    <div class="print-page">
      <div class="print-head">
        <div class="print-logo"><strong>BOYBAK</strong><span>PLASTİK ENJEKSİYON</span></div>
        <h2>MAKİNE BAZLI GÜNLÜK PLAN</h2>
        ${showBarcode ? '<div class="qr-box">QR</div>' : ''}
      </div>
      <div class="print-info-grid">
        <div><b>Makine</b><span>${escapeHtml(machineShortName(machine)+' - '+machineDetailName(machine))}</span></div>
        <div><b>Tarih</b><span>${base.toLocaleDateString('tr-TR')}</span></div>
        <div><b>Günlük Brüt Saat</b><span>${escapeHtml(gross)}</span></div>
        <div><b>Vardiya</b><span>${escapeHtml(shiftText)}</span></div>
        <div><b>Kapsam</b><span>${escapeHtml(scopeText)}</span></div>
        <div><b>Plan Türü</b><span>${escapeHtml(planTypeText)}</span></div>
        <div><b>Toplam Planlanan Adet</b><span>${fmt(totalQty)}</span></div>
      </div>
      <table class="print-table">
        <thead><tr><th>Sıra</th><th>İş Emri</th><th>Ürün Adı</th><th>Boya Kodu</th><th>Göz</th><th>Çevrim</th><th>Adet</th><th>Başlangıç</th><th>Bitiş</th><th>Süre</th><th>Durum</th></tr></thead>
        <tbody>${rows.length ? rows.map((r,i)=>{
          const p=state.plans[r._idx]; const ps=parsePlanDate(p,'start'), pe=parsePlanDate(p,'end');
          return `<tr class="status-${statusClass(r.Durum)}"><td>${i+1}</td><td>${escapeHtml(r['Ürün Kodu'])}</td><td>${escapeHtml(r['Ürün Adı'])}</td><td>${escapeHtml(r['Boya'] || planBoyaKodu(p) || '')}</td><td>${escapeHtml(r['Göz'])}</td><td>${escapeHtml(r['Çevrim sn'])}</td><td>${escapeHtml(r['Adet'])}</td><td>${fmtDateTime(ps)}</td><td>${fmtDateTime(pe)}</td><td>${diffText(ps,pe)}</td><td><span class="print-status">${escapeHtml(r.Durum)}</span></td></tr>`;
        }).join('') : '<tr><td colspan="11" class="empty-print">Seçilen makine için plan bulunamadı.</td></tr>'}</tbody>
      </table>
      <div class="print-summary">
        <div><b>Toplam Süre</b><span>${Math.floor(totalMinutes/60)}sa ${totalMinutes%60}dk</span></div>
        <div><b>Toplam Planlanan Adet</b><span>${fmt(totalQty)}</span></div>
        <div><b>Toplam İş Emri</b><span>${fmt(rows.length)}</span></div>
      </div>
      ${showSignature ? '<div class="signature-grid"><div><b>Açıklamalar</b><p>Planlanan süreler molalar ve çalışma günü kurallarına göre hesaplanır.</p><p>Üretim süreleri makine performansına göre değişiklik gösterebilir.</p></div><div><b>Operatör</b><p>Ad Soyad: ____________________</p><p>İmza: ____________________</p></div><div><b>Onay</b><p>Ad Soyad: ____________________</p><p>İmza / Kaşe: ________________</p></div></div>' : ''}
      <div class="print-foot"><span>Basım Tarihi: ${fmtDateTime(new Date())}</span>${showBarcode ? '<span class="barcode">||||||||||||||||||||||||</span>' : ''}</div>
    </div>`;
}

function csvEscape(value){ return `"${String(value ?? '').replaceAll('\"','\"\"')}"`; }
function downloadCsv(filename, rows){
  const headers = Object.keys(rows[0] || {});
  if(!headers.length) return alert('Dışa aktarılacak kayıt bulunamadı.');
  const csv = [headers.join(';'), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function downloadExcel(filename, rows, sheetName='Veriler'){
  const headers = Object.keys(rows[0] || {});
  if(!headers.length) return alert('İndirilecek kayıt bulunamadı.');
  if(!window.XLSX){
    downloadCsv(filename.replace(/\.xlsx$/i,'.csv'), rows);
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31));
  XLSX.writeFile(wb, filename);
}
function activeViewId(){ return $('.view.active')?.id || 'dashboard'; }
function filteredProductsForExport(){
  const q = ($('#productSearch')?.value || '').toLocaleLowerCase('tr-TR');
  return state.products
    .filter(p=>JSON.stringify(p).toLocaleLowerCase('tr-TR').includes(q))
    .map(p=>({
      'Ürün Kodu': p.kod,
      'Ürün Adı': p.ad,
      'Kalıp No': p.kalip,
      'Göz': p.goz,
      'Çevrim sn': p.cevrim,
      'Uygun Makineler': getProductMachineList(p).map(machineShortName).join(', ')
    }));
}
function filteredPlanRowsForExport(){
  const q = ($('#planSearch')?.value || '').toLocaleLowerCase('tr-TR');
  return state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>isValidPlanObject(state.plans[r._idx]))
    .filter(r=>r.Durum !== 'Bitti')
    .filter(r=>JSON.stringify(r).toLocaleLowerCase('tr-TR').includes(q))
    .map(({_idx, ...r})=>r);
}
function filteredFinishedRowsForExport(){
  const q = ($('#finishedSearch')?.value || '').toLocaleLowerCase('tr-TR');
  return state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>r.Durum === 'Bitti')
    .filter(r=>JSON.stringify(r).toLocaleLowerCase('tr-TR').includes(q))
    .map(({_idx, ...r})=>r);
}
function dashboardRowsForExport(){
  const q = ($('#dashboardSearch')?.value || '').toLocaleLowerCase('tr-TR');
  const plans = state.plans.map((p,idx)=>({...planToRow(p,idx), _idx:idx}))
    .filter(r=>isValidPlanObject(state.plans[r._idx]))
    .filter(r=>r.Durum !== 'Bitti')
    .filter(r=>!selectedDashboardMachine || r.Makine === selectedDashboardMachine)
    .filter(r=>JSON.stringify(r).toLocaleLowerCase('tr-TR').includes(q));
  return plans.map(({_idx, ...r})=>r);
}
function usersForExport(){
  return activeUsers().map(u=>({
    'Kullanıcı Adı': u.username,
    'Rol': roleLabel(u.role),
    'Ad / Etiket': u.label || '',
    'Yetkiler': u.permissions?.includes('*') ? 'Tüm Yetkiler' : (u.permissions || []).map(k=>VIEW_PERMISSIONS.find(v=>v.key===k)?.label || k).join(', ')
  }));
}
$('#exportCsv').addEventListener('click',()=>{
  const view = activeViewId();
  const exporters = {
    dashboard: ['makine-genel-durumu.csv', dashboardRowsForExport],
    plan: ['planlama.csv', filteredPlanRowsForExport],
    finished: ['biten-urunler-siparisler.csv', filteredFinishedRowsForExport],
    products: ['urunler.csv', filteredProductsForExport],
    users: ['kullanicilar.csv', usersForExport],
    settings: ['excel-ayarlar.csv', () => [{ 'Ayar': 'Cumartesi planlamaya alma', 'Değer': state.settings?.skipSaturday ? 'Evet' : 'Hayır' }, { 'Ayar': 'Pazar planlamaya alma', 'Değer': state.settings?.skipSunday ? 'Evet' : 'Hayır' }, { 'Ayar': 'Resmi / dini tatilleri planlamaya alma', 'Değer': state.settings?.skipHolidays ? 'Evet' : 'Hayır' }]]
  };
  const [filename, getRows] = exporters[view] || exporters.dashboard;
  downloadCsv(filename, getRows());
});
$('#clearFinishedBtn')?.addEventListener('click',()=>{
  if(!hasPermission('finished')) return alert('Bu işlem için Biten Ürünler / Siparişler yetkisi gerekir.');
  const rows = filteredFinishedRowsForExport();
  if(!rows.length) return alert('Temizlenecek biten kayıt bulunamadı.');
  if(!confirm(`${rows.length} biten kayıt Excel olarak indirilecek ve listeden temizlenecek. Devam edilsin mi?`)) return;
  const stamp = new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  downloadExcel(`biten-urunler-siparisler-arsiv-${stamp}.xlsx`, rows, 'Biten İşler');
  state.finishedArchives = state.finishedArchives || [];
  state.finishedArchives.push({ dateISO:new Date().toISOString(), count:rows.length, rows });
  state.plans = state.plans.filter(p=>p['Durum'] !== 'Bitti');
  save(); renderAll();
  alert('Excel dosyası indirildi ve biten kayıtlar temizlendi.');
});
$('#resetData')?.addEventListener('click',()=>{ if(!isAdmin()) return alert('Sıfırlama için ana admin yetkisi gerekir.'); if(confirm('Tüm yerel değişiklikler silinsin mi?')){ localStorage.removeItem(LS_KEY); state=structuredClone(window.INITIAL_DATA); renderAll(); } });
$('#importExcel').addEventListener('click',()=>{
  if(!hasPermission('settings')) return alert('Excel içe aktarma için Excel / Ayarlar yetkisi gerekir.');
  const file=$('#excelFile').files[0]; if(!file){ alert('Önce Excel dosyası seçin.'); return; }
  const reader=new FileReader(); reader.onload=e=>{ const wb=XLSX.read(e.target.result,{type:'array'});
    const sheetToJson=name=>XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null});
    const pr=sheetToJson('Ürün Veri'); const co=sheetToJson('Boya Kodu'); const ho=sheetToJson('Resmi Tatiller');
    state.products=pr.slice(1).filter(r=>r[0]).map(r=>{
      const hasBoyaColumn = r.length >= 7 || String(pr[0]?.[2] || '').toLocaleLowerCase('tr-TR').includes('boya');
      const boyaKodu = hasBoyaColumn ? String(r[2] || '').trim() : '';
      const kalip = hasBoyaColumn ? r[3] : r[2];
      const goz = hasBoyaColumn ? r[4] : r[3];
      const cevrim = hasBoyaColumn ? r[5] : r[4];
      const machineCell = hasBoyaColumn ? r[6] : r[5];
      const machineList = parseMachineList(machineCell);
      return {kod:String(r[0]),ad:String(r[1]),boya_kodu:boyaKodu,kalip:String(kalip),goz:num(goz),cevrim:num(cevrim), machines: machineList.length ? machineList : machines.slice()};
    });
    state.colors=co.slice(1).filter(r=>r[0]).map(r=>({kod:String(r[0]),aciklama:String(r[1])}));
    state.holidays=ho.slice(1).filter(r=>r[0]).map(r=>({serial:num(r[0]),aciklama:String(r[1])}));
    state.plans=[];
    machines.forEach(m=>{
      const rows=sheetToJson(m); const h=rows[1]||[];
      rows.slice(2).forEach(r=>{
        let o={Makine:m};
        h.forEach((k,i)=>{ if(k)o[k]=r[i]; });
        if(isValidPlanObject(o)) state.plans.push(o);
      });
    });
    renderAll(); alert('Excel içe aktarıldı.');
  }; reader.readAsArrayBuffer(file);
});

$('#userForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPermission('users')) return alert('Bu işlem için Kullanıcı Yönetimi yetkisi gerekir.');
  const f = Object.fromEntries(new FormData(e.target).entries());
  const username = String(f.username || '').trim();
  const password = String(f.password || '').trim();
  if(!username || !password) return alert('Kullanıcı adı ve şifre zorunludur.');
  if(activeUsers().some(u=>u.username.toLocaleLowerCase('tr-TR') === username.toLocaleLowerCase('tr-TR'))){
    alert('Bu kullanıcı adı zaten var.');
    return;
  }
  const permissions = f.role === 'admin' ? ['*'] : VIEW_PERMISSIONS.map(v=>v.key).filter(k=>f['perm_'+k]);
  if(!passwordIsStrong(password)) return alert('Şifre en az 8 karakter, büyük harf, küçük harf ve rakam içermeli.');
  if(f.role !== 'admin' && !permissions.length) return alert('En az bir sayfa yetkisi seçin.');
  users.push({ username, password, role:f.role, label:f.label || roleLabel(f.role), permissions });
  saveUsers();
  e.target.reset();
  renderUsers();
});
$('#passwordForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPermission('users')) return alert('Bu işlem için Kullanıcı Yönetimi yetkisi gerekir.');
  const f = Object.fromEntries(new FormData(e.target).entries());
  const u = users.find(x=>x.username === f.username);
  if(!u) return alert('Kullanıcı bulunamadı.');
  const newPass = String(f.password || '').trim();
  if(!newPass) return alert('Yeni şifre boş olamaz.');
  if(!passwordIsStrong(newPass)) return alert('Şifre en az 8 karakter, büyük harf, küçük harf ve rakam içermeli.');
  u.password = newPass;
  saveUsers();
  e.target.reset();
  renderUsers();
  alert('Şifre güncellendi.');
});


$('#userForm select[name="role"]')?.addEventListener('change', e=>{
  const role = e.target.value;
  const defaults = defaultPermissionsForRole(role);
  $$('.form-permissions input[type="checkbox"]').forEach(chk=>{
    const key = chk.name.replace('perm_','');
    chk.checked = defaults.includes('*') || defaults.includes(key);
    chk.disabled = role === 'admin' || role === 'viewer';
  });
});
$('#manualBackupBtn')?.addEventListener('click', async ()=>{
  if(!hasPermission('settings')) return alert('Yedek için Excel / Ayarlar yetkisi gerekir.');
  const status = $('#backupStatus');
  if(status) status.textContent = 'Yedek oluşturuluyor...';
  const res = await apiJson('/api/backup', { method:'POST', body:'{}' });
  if(status) status.textContent = res?.ok ? 'Manuel yedek oluşturuldu.' : 'Yedek oluşturulamadı.';
});
$('#downloadBackupBtn')?.addEventListener('click', ()=>{
  if(!hasPermission('settings')) return alert('Yedek indirmek için Excel / Ayarlar yetkisi gerekir.');
  window.location.href = '/api/backup/download';
});

$('#productForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  if(!hasPermission('products')) return alert('Ürün eklemek için Ürünler yetkisi gerekir.');
  const f = Object.fromEntries(new FormData(e.target).entries());
  const kod = String(f.kod || '').trim();
  if(!kod) return alert('Ürün kodu zorunludur.');
  if(state.products.some(p=>String(p.kod).toLocaleLowerCase('tr-TR') === kod.toLocaleLowerCase('tr-TR'))){
    alert('Bu ürün kodu zaten var.');
    return;
  }
  const machineList = selectedValues($('#productMachinesSelect'));
  state.products.push({ kod, ad:String(f.ad||'').trim(), kalip:String(f.kalip||'').trim(), goz:num(f.goz), cevrim:num(f.cevrim), machines: machineList.length ? machineList : machines.slice() });
  save(); e.target.reset(); setupForm(); renderProducts();
});

$('#planEditToggle')?.addEventListener('click',()=>{ planEditMode = !planEditMode; $('#planEditToggle').textContent = planEditMode ? 'Düzenlemeyi Kapat' : 'Planlanmış İşleri Düzenle'; renderPlan(); });

$('#openMachinePrintModal')?.addEventListener('click',()=>{
  const modal = $('#machinePrint');
  if(modal){ modal.hidden = false; setupPrintControls(); renderMachinePrint(); }
});
$('#closeMachinePrintModal')?.addEventListener('click',()=>{ const modal=$('#machinePrint'); if(modal) modal.hidden=true; });
$('#machinePrint')?.addEventListener('click',(e)=>{ if(e.target && e.target.id==='machinePrint') e.currentTarget.hidden=true; });
['printMachine','printScope','printDate','printShift','printPlanType','printShowCapacity','printShowSignature','printShowBarcode'].forEach(id=>$('#'+id)?.addEventListener('change', renderMachinePrint));
$('#buildPrintPreview')?.addEventListener('click', renderMachinePrint);
$('#directPrintBtn')?.addEventListener('click',()=>{ renderMachinePrint(); printWindowContent($('#machinePrintSheet')?.innerHTML || ''); });
$('#downloadPrintPdfBtn')?.addEventListener('click',()=>{ renderMachinePrint(); printWindowContent($('#machinePrintSheet')?.innerHTML || ''); });
setupBreakAutoUpdate();
attachLoginHandler();
$('#logoutBtn')?.addEventListener('click', logout);
loadPersistentData().then(()=>{ if(currentUser){ showApp(); resetSessionTimer(); } else { showLogin(); } });

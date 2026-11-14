'use strict';

/* ============================================================
COTIZADOR MOVIL OFFLINE — GYP INCO SAS
Guarda todo en localStorage. Funciona sin internet.
Sincroniza con el sistema principal (Google Apps Script)
cuando detecta conexión.
============================================================ */

const LS = {
  CONFIG: 'gyp_cfg',
  CATALOGO: 'gyp_catalogo',
  PENDIENTES: 'gyp_cot_pendientes',
  ENVIADAS: 'gyp_cot_enviadas'
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let CFG = loadJSON(LS.CONFIG, { endpointUrl: '', token: '', vigenciaCot: 30 });
let CATALOGO = loadJSON(LS.CATALOGO, { items: [], empresas: [], actualizadoEn: null });
let PENDIENTES = loadJSON(LS.PENDIENTES, []);
let ENVIADAS = loadJSON(LS.ENVIADAS, []);

let cotItems = []; // items de la cotización en edición
let editandoId = null; // id local de una pendiente que se está reeditando

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtCOP(n) {
  const v = Math.round(Number(n) || 0);
  return '$' + v.toLocaleString('es-CO');
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function toast(msg, kind) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + (kind || '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ============================================================
NAVEGACIÓN
============================================================ */
function showView(name) {
  $$('.view').forEach(v => v.classList.remove('on'));
  $('#view-' + name).classList.add('on');
  $$('.tab').forEach(t => t.classList.toggle('act', t.dataset.view === name));
  const fb = $('#save-float');
  if (fb) fb.style.display = (name === 'nueva') ? 'block' : 'none';
  if (name === 'home') renderHome();
  if (name === 'config') renderConfig();
  window.scrollTo(0, 0);
}

/* ============================================================
ESTADO DE CONEXIÓN
============================================================ */
let isOnline = navigator.onLine;
function setConnStatus(online) {
  isOnline = online;
  const pill = $('#conn-pill');
  pill.textContent = online ? '● En línea' : '○ Sin conexión';
  pill.className = 'conn-pill ' + (online ? 'conn-on' : 'conn-off');
}
window.addEventListener('online', () => { setConnStatus(true); intentarPing(); });
window.addEventListener('offline', () => setConnStatus(false));

async function intentarPing() {
  if (!CFG.endpointUrl) return false;
  try {
    const url = CFG.endpointUrl + (CFG.endpointUrl.includes('?') ? '&' : '?') + 'api=ping&token=' + encodeURIComponent(CFG.token) + '&t=' + Date.now();
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    const txt = await res.text();
    const data = JSON.parse(txt);
    setConnStatus(!!data.ok);
    return !!data.ok;
  } catch (e) {
    setConnStatus(false);
    return false;
  }
}

/* ============================================================
HOME — lista de cotizaciones (pendientes + enviadas)
============================================================ */
function renderHome() {
  $('#badge-pend').textContent = PENDIENTES.length;
  const wrap = $('#home-list');
  const items = [...PENDIENTES.map(c => ({ ...c, _estadoLocal: 'PENDIENTE' })),
  ...ENVIADAS.slice(0, 30).map(c => ({ ...c, _estadoLocal: 'ENVIADA' }))];

  if (!items.length) {
    wrap.innerHTML = `<div class="empty">
<div class="empty-ico">📋</div>
<p>Aún no has creado ninguna cotización.</p>
<button class="btn btn-primary" onclick="nuevaCotizacion()">+ Nueva cotización</button>
</div>`;
    return;
  }

  wrap.innerHTML = items.map(c => {
    const pend = c._estadoLocal === 'PENDIENTE';
    return `<div class="qcard ${pend ? 'qcard-pend' : 'qcard-sent'}">
<div class="qcard-top">
<div>
<div class="qcard-cli">${esc(c.cliente?.nom || 'SIN NOMBRE')}</div>
<div class="qcard-meta">${fmtDate(c.fechaElab)} · ${esc(c.emNom || '')}${c.firmaCliente ? ' · ✓ firmada' : ''}</div>
</div>
<span class="chip ${pend ? 'chip-amber' : 'chip-green'}">${pend ? 'Pendiente de enviar' : (c.numAsignado || 'Enviada')}</span>
</div>
<div class="qcard-total">${fmtCOP(c.total)}</div>
<div class="qcard-actions">
${pend ? `<button class="btn-sm" onclick="editarPendiente('${c.idLocal}')">Editar</button>
<button class="btn-sm btn-danger" onclick="borrarPendiente('${c.idLocal}')">Eliminar</button>` :
        `<button class="btn-sm" onclick="verDetalle('${c.idLocal}', true)">Ver detalle</button>`}
</div>
</div>`;
  }).join('');
}

function verDetalle(idLocal, enviada) {
  const list = enviada ? ENVIADAS : PENDIENTES;
  const c = list.find(x => x.idLocal === idLocal);
  if (!c) return;
  alert(
    `${c.cliente?.nom || ''}\n` +
    `NIT/CC: ${c.cliente?.nit || '—'}\n` +
    `Total: ${fmtCOP(c.total)}\n` +
    `Items: ${c.items.length}\n` +
    `Firma: ${c.firmaCliente ? 'Sí, firmada el ' + fmtDate(c.firmaFecha) : 'No firmada'}\n` +
    (enviada ? `Número asignado: ${c.numAsignado || '(pendiente de sincronizar número)'}` : 'Aún no enviada')
  );
}

/* ============================================================
NUEVA COTIZACIÓN / EDITAR
============================================================ */
function nuevaCotizacion() {
  editandoId = null;
  cotItems = [];
  $('#cot-form').reset();
  $('#cot-fecha').value = todayISO();
  poblarSelectEmpresas();
  renderCotItems();
  calcTotales();
  showView('nueva');
  initFirmaCanvas();
}

function editarPendiente(idLocal) {
  const c = PENDIENTES.find(x => x.idLocal === idLocal);
  if (!c) return;
  editandoId = idLocal;
  cotItems = JSON.parse(JSON.stringify(c.items || []));
  poblarSelectEmpresas();
  $('#cot-em').value = c.emNom || '';
  $('#cot-fecha').value = c.fechaElab || todayISO();
  $('#cot-cnom').value = c.cliente?.nom || '';
  $('#cot-cnit').value = c.cliente?.nit || '';
  $('#cot-ctel').value = c.cliente?.tel || '';
  $('#cot-cciudad').value = c.cliente?.ciudad || '';
  $('#cot-cdir').value = c.cliente?.dir || '';
  $('#cot-desc').value = c.descPct || 0;
  $('#cot-iva').value = c.ivaPct != null ? c.ivaPct : 19;
  $('#cot-notas').value = c.notas || '';
  renderCotItems();
  calcTotales();
  showView('nueva');
  initFirmaCanvas(c.firmaCliente || '');
}

function borrarPendiente(idLocal) {
  if (!confirm('¿Eliminar esta cotización pendiente? No se puede deshacer.')) return;
  PENDIENTES = PENDIENTES.filter(x => x.idLocal !== idLocal);
  saveJSON(LS.PENDIENTES, PENDIENTES);
  renderHome();
  toast('Cotización eliminada', 'ok');
}

function poblarSelectEmpresas() {
  const sel = $('#cot-em');
  const empresas = CATALOGO.empresas || [];
  sel.innerHTML = '<option value="">— Seleccione empresa —</option>' +
    empresas.map(e => `<option value="${esc(e.nom)}">${esc(e.nom)}</option>`).join('');
}

/* --- buscador de materiales --- */
let matBuscadorTarget = null;
function abrirBuscadorMaterial() {
  matBuscadorTarget = true;
  $('#mat-search').value = '';
  renderMatResultados('');
  $('#mat-modal').classList.add('on');
  setTimeout(() => $('#mat-search').focus(), 80);
}
function cerrarBuscadorMaterial() { $('#mat-modal').classList.remove('on'); }

function renderMatResultados(q) {
  q = (q || '').toLowerCase().trim();
  const cat = CATALOGO.items || [];
  const res = q
    ? cat.filter(m => (m.desc || '').toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q)).slice(0, 60)
    : cat.slice(0, 40);
  const wrap = $('#mat-results');
  if (!cat.length) {
    wrap.innerHTML = `<div class="mat-none">No hay catálogo descargado todavía.<br>Ve a Configuración → Actualizar catálogo (requiere internet la primera vez).</div>`;
    return;
  }
  if (!res.length) {
    wrap.innerHTML = `<div class="mat-none">Sin resultados para "${esc(q)}"</div>`;
    return;
  }
  wrap.innerHTML = res.map(m => `
<div class="mat-item" onclick="agregarMaterial('${m.id}')">
<span class="mat-code">${esc(m.code || '--')}</span>
<span class="mat-desc">${esc(m.desc)}</span>
<span class="mat-price">${m.precioSugerido ? fmtCOP(m.precioSugerido) : ''}</span>
</div>`).join('');
}

function agregarMaterial(matId) {
  const m = (CATALOGO.items || []).find(x => x.id === matId);
  if (!m) return;
  cotItems.push({
    matId: m.id, code: m.code || '', desc: m.desc, uni: m.uni || 'UND',
    cant: 1, pVenta: m.precioSugerido || 0
  });
  cerrarBuscadorMaterial();
  renderCotItems();
  calcTotales();
}

function agregarItemLibre() {
  cotItems.push({ matId: '', code: '', desc: '', uni: 'UND', cant: 1, pVenta: 0, libre: true });
  renderCotItems();
  calcTotales();
}

function quitarItem(idx) {
  cotItems.splice(idx, 1);
  renderCotItems();
  calcTotales();
}

function renderCotItems() {
  const wrap = $('#cot-items');
  if (!cotItems.length) {
    wrap.innerHTML = `<div class="empty-mini">Sin materiales agregados todavía.</div>`;
    return;
  }
  wrap.innerHTML = cotItems.map((it, i) => `
<div class="item-row">
<button class="item-x" onclick="quitarItem(${i})" aria-label="Quitar">✕</button>
${it.libre
      ? `<input class="item-desc-inp" placeholder="Descripción del ítem" value="${esc(it.desc)}" oninput="cotItems[${i}].desc=this.value.toUpperCase()">`
      : `<div class="item-desc">${esc(it.desc)} ${it.code ? `<span class="item-code">(${esc(it.code)})</span>` : ''}</div>`}
<div class="item-grid">
<label>Cant.<input type="number" min="0.01" step="1" value="${it.cant}" oninput="cotItems[${i}].cant=parseFloat(this.value)||0;calcTotales()"></label>
<label>Und<input type="text" value="${esc(it.uni)}" oninput="cotItems[${i}].uni=this.value.toUpperCase()"></label>
<label>Precio venta<input type="number" min="0" step="100" value="${it.pVenta}" oninput="cotItems[${i}].pVenta=parseFloat(this.value)||0;calcTotales()"></label>
</div>
<div class="item-total" id="item-tot-${i}"></div>
</div>`).join('');
  $$('.item-total').forEach((el, i) => {
    el.textContent = fmtCOP((cotItems[i].cant || 0) * (cotItems[i].pVenta || 0));
  });
}

function calcTotales() {
  const sub = cotItems.reduce((a, it) => a + (it.cant || 0) * (it.pVenta || 0), 0);
  const desc = parseFloat($('#cot-desc').value) || 0;
  const iva = parseFloat($('#cot-iva').value);
  const descV = sub * desc / 100;
  const subD = sub - descV;
  const ivaV = subD * (iva || 0) / 100;
  const total = subD + ivaV;
  $('#cot-tot').innerHTML =
    `Subtotal: <b>${fmtCOP(sub)}</b>` +
    (desc > 0 ? ` · Desc ${desc}%: <b class="neg">-${fmtCOP(descV)}</b>` : '') +
    ` · IVA ${iva}%: <b>${fmtCOP(ivaV)}</b>` +
    `<div class="tot-final">TOTAL: ${fmtCOP(total)}</div>`;
  return { sub, desc, descV, subD, iva, ivaV, total };
}

/* ============================================================
FIRMA DEL CLIENTE (táctil: dedo o lápiz)
============================================================ */
let firmaCtx = null, firmaDrawing = false, firmaVacia = true, firmaLastX = 0, firmaLastY = 0;

function initFirmaCanvas(dataUrlPrevia) {
  const cv = $('#firma-canvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  cv.width = Math.round(rect.width * dpr);
  cv.height = Math.round(rect.height * dpr);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1A1A18';
  firmaCtx = ctx;
  firmaVacia = true;

  if (dataUrlPrevia) {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, rect.width, rect.height); firmaVacia = false; };
    img.src = dataUrlPrevia;
  }

  if (cv._firmaListenersAgregados) return; // evita duplicar listeners al reabrir el formulario
  cv._firmaListenersAgregados = true;

  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (ex) {}
    firmaDrawing = true; firmaVacia = false;
    const p = pos(e); firmaLastX = p.x; firmaLastY = p.y;
  };
  const move = (e) => {
    if (!firmaDrawing) return;
    e.preventDefault();
    const p = pos(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(firmaLastX, firmaLastY);
    firmaCtx.lineTo(p.x, p.y);
    firmaCtx.stroke();
    firmaLastX = p.x; firmaLastY = p.y;
  };
  const end = () => { firmaDrawing = false; };
  cv.addEventListener('pointerdown', start);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
}

function limpiarFirma() {
  const cv = $('#firma-canvas');
  if (!cv || !firmaCtx) return;
  const dpr = window.devicePixelRatio || 1;
  firmaCtx.fillStyle = '#fff';
  firmaCtx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  firmaVacia = true;
}

function obtenerFirmaDataUrl() {
  const cv = $('#firma-canvas');
  if (!cv || firmaVacia) return '';
  return cv.toDataURL('image/png');
}

function guardarCotizacionLocal() {
  const cnom = $('#cot-cnom').value.trim();
  if (!cnom) { toast('Falta el nombre del cliente', 'err'); $('#cot-cnom').focus(); return; }
  const emNom = $('#cot-em').value;
  if (!emNom) { toast('Selecciona la empresa que cotiza', 'err'); $('#cot-em').focus(); return; }
  const itemsValidos = cotItems.filter(it => (it.desc || '').trim() && (it.cant || 0) > 0);
  if (!itemsValidos.length) { toast('Agrega al menos un material o ítem', 'err'); return; }

  const empresa = (CATALOGO.empresas || []).find(e => e.nom === emNom) || {};
  const t = calcTotales();
  const fechaElab = $('#cot-fecha').value || todayISO();
  const vig = new Date(fechaElab);
  vig.setDate(vig.getDate() + (CFG.vigenciaCot || 30));

  // Firma: si se dibujó una nueva, se usa esa; si se está editando y no se tocó
  // el recuadro, se conserva la firma que ya tenía guardada.
  const pendienteExistente = editandoId ? PENDIENTES.find(x => x.idLocal === editandoId) : null;
  const firmaNueva = obtenerFirmaDataUrl();
  const firmaCliente = firmaNueva || (pendienteExistente ? pendienteExistente.firmaCliente || '' : '');
  const firmaFecha = firmaNueva ? todayISO() : (pendienteExistente ? pendienteExistente.firmaFecha || '' : '');

  const cot = {
    idLocal: editandoId || uid(),
    fechaElab, fechaVig: vig.toISOString().slice(0, 10),
    emNom, emNit: empresa.nit || '',
    cliente: {
      nom: cnom.toUpperCase(),
      nit: $('#cot-cnit').value.trim(),
      tel: $('#cot-ctel').value.trim(),
      ciudad: $('#cot-cciudad').value.trim().toUpperCase(),
      dir: $('#cot-cdir').value.trim().toUpperCase()
    },
    items: itemsValidos.map(it => ({
      tipo: 'MATERIAL', matId: it.matId || '', desc: it.desc, uni: it.uni || 'UND',
      cant: it.cant, pVenta: it.pVenta, total: (it.cant || 0) * (it.pVenta || 0)
    })),
    subtotal: t.sub, descPct: t.desc, descValor: t.descV, subtotalDesc: t.subD,
    ivaPct: t.iva, ivaValor: t.ivaV, total: t.total,
    notas: $('#cot-notas').value.trim().toUpperCase(),
    firmaCliente, firmaFecha,
    creadaEn: new Date().toISOString(),
    origenMovil: true
  };

  if (editandoId) {
    const idx = PENDIENTES.findIndex(x => x.idLocal === editandoId);
    if (idx >= 0) PENDIENTES[idx] = cot; else PENDIENTES.push(cot);
  } else {
    PENDIENTES.push(cot);
  }
  saveJSON(LS.PENDIENTES, PENDIENTES);
  toast(firmaCliente ? 'Cotización guardada con firma' : 'Cotización guardada en el celular', 'ok');
  showView('home');
}

/* ============================================================
CONFIGURACIÓN
============================================================ */
function renderConfig() {
  $('#cfg-url').value = CFG.endpointUrl || '';
  $('#cfg-token').value = CFG.token || '';
  $('#cfg-cat-info').textContent = CATALOGO.actualizadoEn
    ? `Catálogo actualizado: ${new Date(CATALOGO.actualizadoEn).toLocaleString('es-CO')} · ${CATALOGO.items.length} materiales`
    : 'Aún no se ha descargado el catálogo.';
}

function guardarConfig() {
  CFG.endpointUrl = $('#cfg-url').value.trim();
  CFG.token = $('#cfg-token').value.trim();
  saveJSON(LS.CONFIG, CFG);
  toast('Configuración guardada', 'ok');
  intentarPing();
}

async function actualizarCatalogo() {
  if (!CFG.endpointUrl || !CFG.token) {
    toast('Configura primero la URL y el token', 'err');
    return;
  }
  const btn = $('#btn-actualizar-cat');
  btn.disabled = true; btn.textContent = 'Descargando...';
  try {
    const url = CFG.endpointUrl + (CFG.endpointUrl.includes('?') ? '&' : '?') + 'api=catalogo&token=' + encodeURIComponent(CFG.token);
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    const data = JSON.parse(txt);
    if (!data.ok) throw new Error(data.error || 'Respuesta inválida');
    CATALOGO = { items: data.catalogo || [], empresas: data.empresas || [], actualizadoEn: new Date().toISOString() };
    CFG.vigenciaCot = data.vigenciaCot || 30;
    saveJSON(LS.CATALOGO, CATALOGO);
    saveJSON(LS.CONFIG, CFG);
    setConnStatus(true);
    toast(`Catálogo actualizado: ${CATALOGO.items.length} materiales`, 'ok');
    renderConfig();
  } catch (e) {
    setConnStatus(false);
    toast('No se pudo actualizar (sin conexión o URL/token incorrectos)', 'err');
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Actualizar catálogo';
  }
}

async function sincronizarPendientes() {
  if (!PENDIENTES.length) { toast('No hay cotizaciones pendientes por enviar', 'ok'); return; }
  if (!CFG.endpointUrl || !CFG.token) { toast('Configura primero la URL y el token', 'err'); showView('config'); return; }

  const btn = $('#btn-sync');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    const url = CFG.endpointUrl;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify({
        token: CFG.token,
        accion: 'enviarCotizaciones',
        cotizaciones: PENDIENTES
      })
    });
    const txt = await res.text();
    const data = JSON.parse(txt);
    if (!data.ok) throw new Error(data.error || 'Error al sincronizar');

    const numsAsignados = {};
    (data.creadas || []).forEach(c => { numsAsignados[c.idLocal] = c.num; });

    PENDIENTES.forEach(c => {
      c.numAsignado = numsAsignados[c.idLocal] || '';
      ENVIADAS.unshift(c);
    });
    PENDIENTES = [];
    saveJSON(LS.PENDIENTES, PENDIENTES);
    saveJSON(LS.ENVIADAS, ENVIADAS.slice(0, 200));
    setConnStatus(true);
    toast(`${data.creadas.length} cotización(es) enviada(s) correctamente`, 'ok');
    renderHome();
  } catch (e) {
    setConnStatus(false);
    toast('No se pudo enviar. Se reintentará cuando haya conexión.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↑ Enviar pendientes'; }
  }
}

/* ============================================================
INIT
============================================================ */
function init() {
  setConnStatus(navigator.onLine);
  showView('home');
  $('#mat-search').addEventListener('input', (e) => renderMatResultados(e.target.value));

  if (navigator.onLine) intentarPing();

  // Reintento periódico silencioso cada 45s: si hay conexión y pendientes, sincroniza solo
  setInterval(async () => {
    const ok = await intentarPing();
    if (ok && PENDIENTES.length) sincronizarPendientes();
  }, 45000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);

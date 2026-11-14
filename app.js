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
let CATALOGO = loadJSON(LS.CATALOGO, { items: [], empresas: [], grupos: [], actualizadoEn: null });
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
window.addEventListener('online', () => { setConnStatus(true); intentarPing(); actualizarCatalogoSilencioso(); });
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
<div class="qcard-meta">${fmtDate(c.fechaElab)} · ${esc(c.emNom || '')}${c.firmaCliente ? ' · ✓ firmada' : ''}${c.financiado ? ' · 💳 financiada' : ''}</div>
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
    (c.financiado ? `Financiación: ${c.nCuotas} cuotas de ${fmtCOP(c.cuotaMensual)}\n` : '') +
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
  $('#fin-campos').style.display = 'none';
  $('#cot-vinit').value = 0;
  $('#cot-tasa').value = 1.50;
  $('#cot-cuotas').value = 12;
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
  $('#cot-fin').checked = !!c.financiado;
  $('#fin-campos').style.display = c.financiado ? 'block' : 'none';
  $('#cot-vinit').value = c.valorInicial || 0;
  $('#cot-tasa').value = c.tasaMensual != null ? c.tasaMensual : 1.50;
  $('#cot-cuotas').value = c.nCuotas || 12;
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

/* --- grupos de materiales --- */
function abrirBuscadorGrupo() {
  renderGrupoResultados();
  $('#grupo-modal').classList.add('on');
}
function cerrarBuscadorGrupo() { $('#grupo-modal').classList.remove('on'); }

function renderGrupoResultados() {
  const grupos = CATALOGO.grupos || [];
  const wrap = $('#grupo-results');
  if (!grupos.length) {
    wrap.innerHTML = `<div class="mat-none">No hay grupos de materiales en el catálogo descargado.<br>Ve a Configuración → Actualizar catálogo.</div>`;
    return;
  }
  wrap.innerHTML = grupos.map(g => `
<div class="mat-item" style="cursor:pointer" onclick="agregarGrupo('${g.id}')">
<span class="mat-desc"><b>${esc(g.nom)}</b>${g.desc ? ' — ' + esc(g.desc) : ''}<br><span style="color:var(--gris-claro);font-size:11px">${(g.items || []).length} materiales</span></span>
</div>`).join('');
}

function agregarGrupo(gid) {
  const g = (CATALOGO.grupos || []).find(x => x.id === gid);
  if (!g) return;
  (g.items || []).forEach(it => {
    const m = (CATALOGO.items || []).find(x => x.id === it.matId);
    if (m) {
      cotItems.push({ matId: m.id, code: m.code || '', desc: m.desc, uni: m.uni || it.uni || 'UND', cant: it.cant || 1, pVenta: m.precioSugerido || 0 });
    } else {
      cotItems.push({ matId: it.matId || '', code: '', desc: it.desc || '(material no disponible, edítelo)', uni: it.uni || 'UND', cant: it.cant || 1, pVenta: 0, libre: true });
    }
  });
  cerrarBuscadorGrupo();
  renderCotItems();
  calcTotales();
  toast(`Grupo "${g.nom}" agregado (${(g.items || []).length} materiales)`, 'ok');
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
  renderFinResumen(total);
  return { sub, desc, descV, subD, iva, ivaV, total };
}

/* ============================================================
FINANCIACIÓN (opcional)
============================================================ */
function calcPMT(pv, rate, nper) {
  if (!rate || rate === 0) return Math.round(pv / (nper || 1));
  return Math.round(pv * rate / (1 - Math.pow(1 + rate, -nper)));
}
function calcAmort(prestamo, tasaMens, nCuotas) {
  const cuota = calcPMT(prestamo, tasaMens, nCuotas);
  let saldo = prestamo;
  const tabla = [];
  for (let i = 1; i <= nCuotas; i++) {
    const int = Math.round(saldo * tasaMens);
    const cap = Math.round(cuota - int);
    saldo = Math.max(0, Math.round(saldo - cap));
    tabla.push({ mes: i, cuota, capital: cap, interes: int, saldo });
  }
  return tabla;
}
function toggleFinMovil() {
  const on = $('#cot-fin').checked;
  $('#fin-campos').style.display = on ? 'block' : 'none';
  calcTotales();
}
function renderFinResumen(total) {
  const chk = $('#cot-fin');
  const el = $('#fin-resumen');
  if (!chk || !el) return;
  if (!chk.checked) { el.textContent = ''; return; }
  const vinit = parseFloat($('#cot-vinit').value) || 0;
  const tasa = (parseFloat($('#cot-tasa').value) || 0) / 100;
  const n = parseInt($('#cot-cuotas').value) || 1;
  const vFin = Math.max(0, total - vinit);
  const cuota = calcPMT(vFin, tasa, n);
  el.innerHTML = `Valor a financiar: ${fmtCOP(vFin)} · Cuota mensual aprox.: ${fmtCOP(cuota)} × ${n}`;
}

/* ============================================================
FIRMA DEL CLIENTE (táctil: dedo o lápiz)
============================================================ */
let firmaCtx = null, firmaDrawing = false, firmaVacia = true, firmaBloqueada = false, firmaLastX = 0, firmaLastY = 0;

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
  firmaBloqueada = false;

  if (dataUrlPrevia) {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      firmaVacia = false;
      firmaBloqueada = true; // ya venía firmada: queda bloqueada hasta que la eliminen
      actualizarBotonesFirma();
    };
    img.src = dataUrlPrevia;
  }
  actualizarBotonesFirma();

  if (cv._firmaListenersAgregados) return; // evita duplicar listeners al reabrir el formulario
  cv._firmaListenersAgregados = true;

  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => {
    if (firmaBloqueada) return; // ya aceptada: no se puede escribir encima
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (ex) {}
    firmaDrawing = true; firmaVacia = false;
    const p = pos(e); firmaLastX = p.x; firmaLastY = p.y;
  };
  const move = (e) => {
    if (firmaBloqueada || !firmaDrawing) return;
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

// Muestra Limpiar+Aceptar mientras se está dibujando, y solo Eliminar
// cuando la firma ya quedó aceptada (bloqueada).
function actualizarBotonesFirma() {
  const limpiar = $('#btn-firma-limpiar');
  const aceptar = $('#btn-firma-aceptar');
  const eliminar = $('#btn-firma-eliminar');
  if (!limpiar || !aceptar || !eliminar) return;
  limpiar.style.display = firmaBloqueada ? 'none' : '';
  aceptar.style.display = firmaBloqueada ? 'none' : '';
  eliminar.style.display = firmaBloqueada ? '' : 'none';
}

function limpiarFirma() {
  const cv = $('#firma-canvas');
  if (!cv || !firmaCtx || firmaBloqueada) return;
  const dpr = window.devicePixelRatio || 1;
  firmaCtx.fillStyle = '#fff';
  firmaCtx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  firmaVacia = true;
}

function aceptarFirma() {
  if (firmaVacia) { toast('Pide al cliente que firme primero', 'err'); return; }
  firmaBloqueada = true;
  actualizarBotonesFirma();
  toast('Firma confirmada', 'ok');
}

function eliminarFirma() {
  const cv = $('#firma-canvas');
  if (!cv || !firmaCtx) return;
  const dpr = window.devicePixelRatio || 1;
  firmaCtx.fillStyle = '#fff';
  firmaCtx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  firmaVacia = true;
  firmaBloqueada = false;
  actualizarBotonesFirma();
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

  const finOn = $('#cot-fin').checked;
  const vinit = parseFloat($('#cot-vinit').value) || 0;
  const tasaPct = parseFloat($('#cot-tasa').value) || 0;
  const nCuotas = parseInt($('#cot-cuotas').value) || 1;
  const vFin = finOn ? Math.max(0, t.total - vinit) : 0;
  const cuota = finOn ? calcPMT(vFin, tasaPct / 100, nCuotas) : 0;
  const tablaAmort = finOn ? calcAmort(vFin, tasaPct / 100, nCuotas) : [];

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
    financiado: finOn,
    valorInicial: finOn ? vinit : 0,
    valorFinanciar: vFin,
    nCuotas: finOn ? nCuotas : 0,
    tasaMensual: finOn ? tasaPct : 0,
    cuotaMensual: cuota,
    amortizacion: tablaAmort,
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
  const ok = await actualizarCatalogoSilencioso();
  if (ok) {
    toast(`Catálogo actualizado: ${CATALOGO.items.length} materiales`, 'ok');
    renderConfig();
  } else {
    setConnStatus(false);
    toast('No se pudo actualizar (sin conexión o URL/token incorrectos)', 'err');
  }
  btn.disabled = false; btn.textContent = '⬇ Actualizar catálogo';
}

/* Descarga el catálogo (materiales, empresas y grupos) sin molestar al
usuario con mensajes — se usa al abrir la app y al recuperar señal, para
que los cambios hechos en la computadora (precios, materiales nuevos,
grupos nuevos) lleguen solos al celular. */
async function actualizarCatalogoSilencioso() {
  if (!CFG.endpointUrl || !CFG.token) return false;
  try {
    const url = CFG.endpointUrl + (CFG.endpointUrl.includes('?') ? '&' : '?') + 'api=catalogo&token=' + encodeURIComponent(CFG.token);
    const res = await fetch(url, { cache: 'no-store' });
    const txt = await res.text();
    const data = JSON.parse(txt);
    if (!data.ok) return false;
    CATALOGO = { items: data.catalogo || [], empresas: data.empresas || [], grupos: data.grupos || [], actualizadoEn: new Date().toISOString() };
    CFG.vigenciaCot = data.vigenciaCot || 30;
    saveJSON(LS.CATALOGO, CATALOGO);
    saveJSON(LS.CONFIG, CFG);
    setConnStatus(true);
    if ($('#view-config').classList.contains('on')) renderConfig();
    return true;
  } catch (e) {
    return false;
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

  if (navigator.onLine) {
    intentarPing();
    actualizarCatalogoSilencioso(); // trae materiales/grupos/precios nuevos al abrir la app
  }

  // Reintento periódico silencioso cada 45s: si hay conexión y pendientes, sincroniza solo
  setInterval(async () => {
    const ok = await intentarPing();
    if (ok && PENDIENTES.length) sincronizarPendientes();
  }, 45000);

  registrarServiceWorkerConAutoActualizacion();
}

/* ============================================================
ACTUALIZACIÓN DE LA APP (service worker)
============================================================ */
function registrarServiceWorkerConAutoActualizacion() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.update().catch(() => {}); // revisa si hay una versión nueva apenas abre
    reg.addEventListener('updatefound', () => {
      const nueva = reg.installing;
      if (!nueva) return;
      nueva.addEventListener('statechange', () => {
        if (nueva.state === 'installed' && navigator.serviceWorker.controller) {
          // Hay una version nueva lista: se activa sola, sin pedirle nada al usuario.
          nueva.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});

  let yaRecargo = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (yaRecargo) return;
    yaRecargo = true;
    window.location.reload();
  });
}

/* Botón "Buscar actualización" en Configuración: fuerza revisar tanto el
catálogo como la versión de la app, y si hay algo nuevo, recarga sola. */
async function actualizarApp() {
  toast('Buscando actualización...', 'ok');
  let huboCambioApp = false;
  try {
    if (navigator.onLine) await actualizarCatalogoSilencioso();
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          huboCambioApp = true;
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }
  } catch (e) { /* seguimos igual */ }
  if (!huboCambioApp) {
    toast('Ya tienes la última versión y el catálogo al día', 'ok');
  }
  // el listener de controllerchange recarga sola si sw.js cambió;
  // si no cambió, igual refrescamos la vista de Configuración con el catálogo nuevo.
  if ($('#view-config').classList.contains('on')) renderConfig();
}

document.addEventListener('DOMContentLoaded', init);

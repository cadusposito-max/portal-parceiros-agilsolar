// ==========================================
// UTILITÁRIOS GERAIS
// ==========================================

// --- Tema + logo por tema (dark/light) sem ocupar espaço no header ---
function getThemePreference() {
  const pref = localStorage.getItem('themePreference');
  return (pref === 'light' || pref === 'dark' || pref === 'system') ? pref : 'system';
}

function getActiveThemeMode() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;

  const pref = getThemePreference();
  if (pref === 'light' || pref === 'dark') return pref;

  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'light'
    : 'dark';
}

function applyThemeMode() {
  const mode = getActiveThemeMode();
  document.documentElement.setAttribute('data-theme', mode);
  document.body.classList.toggle('theme-light', mode === 'light');
  document.body.classList.toggle('theme-dark', mode !== 'light');
  const lightCssEl = document.getElementById('theme-light-css');
  if (lightCssEl) lightCssEl.disabled = mode !== 'light';
  updateThemeMetaColor(mode);
  applyThemeLogos();
}

function setThemePreference(preference) {
  const pref = (preference === 'light' || preference === 'dark' || preference === 'system')
    ? preference
    : 'system';
  localStorage.setItem('themePreference', pref);
  applyThemeMode();
  // Re-renderiza o conteúdo: alguns valores (ex.: background-color via var CSS)
  // não repintam no toggle ao vivo sem um novo render. Só no toggle do usuário.
  if (typeof renderContent === 'function') {
    try { renderContent(); } catch (_) {}
  }
  if (typeof showToast === 'function') {
    const label = pref === 'system' ? 'SISTEMA' : (pref === 'light' ? 'CLARO' : 'ESCURO');
    showToast(`TEMA: ${label}`);
  }
}

function updateThemeMetaColor(mode) {
  const color = mode === 'light' ? '#f3f4f6' : '#050505';
  const selectors = [
    'meta[name="theme-color"]',
    'meta[name="apple-mobile-web-app-status-bar-style"]'
  ];

  // theme-color
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', color);

  // iOS status bar behavior remains stable but we keep it explicit
  const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleMeta) {
    appleMeta.setAttribute('content', mode === 'light' ? 'default' : 'black-translucent');
  }
}

function applyThemeLogos() {
  const mode = getActiveThemeMode();
  document.querySelectorAll('img[data-theme-logo="true"]').forEach(img => {
    const darkSrc = img.getAttribute('data-logo-dark');
    const lightSrc = img.getAttribute('data-logo-light');
    const targetSrc = mode === 'light' ? lightSrc : darkSrc;
    const safeTargetSrc = safeImageUrl(targetSrc, null);
    if (safeTargetSrc && img.getAttribute('src') !== safeTargetSrc) {
      img.setAttribute('src', safeTargetSrc);
    }
  });
}

document.addEventListener('DOMContentLoaded', applyThemeMode);

if (window.matchMedia) {
  const _themeMq = window.matchMedia('(prefers-color-scheme: light)');
  if (_themeMq.addEventListener) {
    _themeMq.addEventListener('change', () => {
      if (getThemePreference() === 'system') applyThemeMode();
    });
  } else if (_themeMq.addListener) {
    _themeMq.addListener(() => {
      if (getThemePreference() === 'system') applyThemeMode();
    });
  }
}

// --- Segurança: sanitizar strings antes de inserir no DOM ---
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DEFAULT_SAFE_IMAGE_FALLBACK = 'assets/img/logo-light.png';

function _normalizeSafeImageUrl(rawUrl, { allowDataUrl = false, allowBlobUrl = false } = {}) {
  if (typeof rawUrl !== 'string') return '';

  const value = rawUrl.trim();
  if (!value) return '';
  if (/[\x00-\x1F\x7F]/.test(value)) return '';

  const lower = value.toLowerCase();
  if (allowDataUrl && lower.startsWith('data:image/')) return value;
  if (allowBlobUrl && lower.startsWith('blob:')) return value;

  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:')) {
    return '';
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    return parsed.href;
  } catch (_) {
    // URL invalida em input dinamico: fallback silencioso intencional.
    return '';
  }
}

function safeImageUrl(rawUrl, fallbackUrl = DEFAULT_SAFE_IMAGE_FALLBACK, options = {}) {
  const safeUrl = _normalizeSafeImageUrl(rawUrl, options);
  if (safeUrl) return safeUrl;

  if (fallbackUrl === null) return '';

  const safeFallback = _normalizeSafeImageUrl(fallbackUrl);
  return safeFallback || DEFAULT_SAFE_IMAGE_FALLBACK;
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

// Moeda compacta para cards de KPI: abrevia valores grandes para não estourar a
// largura do card. Ex.: 8.450 -> "R$ 8.450,00"; 53.770 -> "R$ 53,8 mil";
// 563.822.278 -> "R$ 563,8 mi". Abaixo de 10 mil mantém o valor cheio.
function formatCurrencyCompact(val) {
  const n = Number(val || 0);
  const abs = Math.abs(n);
  if (abs >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mi';
  if (abs >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' mil';
  return formatCurrency(n);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('pt-BR');
}

// Converte um timestamp ISO para o formato de <input type="datetime-local">
// em HORA LOCAL ("YYYY-MM-DDTHH:mm"). toISOString() puro devolve UTC e
// deslocaria o horário exibido (ex.: -3h no Brasil).
function toLocalDatetimeInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Retorna label legível para um período 'YYYY-MM' ou 'all'
function formatMonthLabel(yyyymm) {
  if (!yyyymm || yyyymm === 'all') return 'GERAL';
  const [y, m] = yyyymm.split('-');
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function toMonthKey(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isSameDayDate(dateString, baseDate = new Date()) {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === baseDate.getFullYear()
    && d.getMonth() === baseDate.getMonth()
    && d.getDate() === baseDate.getDate();
}

function isDateInLastDays(dateString, days, baseDate = new Date()) {
  if (!dateString || !Number.isFinite(days) || days <= 0) return false;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return d >= start && d <= baseDate;
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLowerCase();
}

function getFranquiaNameById(franquiaId) {
  if (!franquiaId) return 'Sem franquia';
  const normalized = String(franquiaId);
  const found = (state.franquiasCatalog || []).find(f => String(f.id) === normalized);
  if (found?.nome) return found.nome;
  return `Franquia ${normalized.slice(0, 8)}`;
}

function applyAdminGlobalScope(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!state?.isAdmin || !state?.adminViewAll) return list;
  const scopeId = String(state.adminScopeFranquiaId || 'all');
  if (scopeId === 'all') return list;
  return list.filter((item) => String(item?.franquia_id || '') === scopeId);
}

function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// --- Toast com fila (evita sobreposição) ---
let _toastQueue   = [];
let _toastShowing = false;

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  _toastQueue.push(msg);
  if (!_toastShowing) _processToastQueue();
}

function _processToastQueue() {
  if (_toastQueue.length === 0) { _toastShowing = false; return; }
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) {
    _toastQueue = [];
    _toastShowing = false;
    return;
  }

  _toastShowing = true;
  const msg   = _toastQueue.shift();
  toastMsg.innerText = msg;
  toast.classList.remove('translate-y-full', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-full', 'opacity-0');
    setTimeout(_processToastQueue, 350);
  }, 3000);
}

// --- Modal de confirmação genérico ---
function showConfirmModal(message, onConfirm, confirmLabel = 'CONFIRMAR', danger = true) {
  document.getElementById('confirm-modal-msg').innerText = message;
  const btnYes = document.getElementById('btn-confirm-yes');
  btnYes.innerText = confirmLabel;
  btnYes.className = danger
    ? 'flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest transition-colors text-sm'
    : 'flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-black font-black uppercase tracking-widest transition-colors text-sm';
  btnYes.onclick = () => { hideConfirmModal(); onConfirm(); };
  document.getElementById('confirm-modal-overlay').classList.remove('hidden');
}

function hideConfirmModal() {
  document.getElementById('confirm-modal-overlay').classList.add('hidden');
}

// ==========================================
// ANIMAÇÃO DE CONTADORES
// ==========================================
function animateCounters() {
  const reduceMotion =
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    window.innerWidth <= 768;

  document.querySelectorAll('[data-count]').forEach(el => {
    const target     = parseFloat(el.dataset.count) || 0;
    const isCurrency = el.dataset.countCurrency === 'true';

    if (reduceMotion) {
      el.textContent = isCurrency
        ? formatCurrency(target)
        : target.toLocaleString('pt-BR');
      return;
    }

    const duration   = 1200;
    const start      = performance.now();

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current  = target * easeOutCubic(progress);

      if (isCurrency) {
        el.textContent = formatCurrency(Math.floor(current));
      } else {
        el.textContent = Math.floor(current).toLocaleString('pt-BR');
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = isCurrency
          ? formatCurrency(target)
          : target.toLocaleString('pt-BR');
      }
    };

    requestAnimationFrame(tick);
  });
}

// ==========================================
// SAUDAÇÃO E INFO DO USUÁRIO
// ==========================================
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getFirstName() {
  // Prioridade: nome do perfil → user_metadata → email
  if (state.profile?.nome) return state.profile.nome.split(' ')[0];
  if (!state.currentUser) return '';
  const meta = state.currentUser.user_metadata || {};
  const full  = meta.full_name || meta.name || '';
  if (full) return full.split(' ')[0];
  const email = state.currentUser.email || '';
  const prefix = email.split('@')[0];
  const name   = prefix.split('.')[0].split('_')[0];
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function getBadgeStyles(tag) {
  const styles = {
    'MAIS VENDIDO':    'bg-gradient-to-r from-orange-600 to-yellow-500 text-black border-orange-500',
    'PREMIUM':         'bg-neutral-800 text-orange-400 border-orange-500',
    'CUSTO-BENEFÍCIO': 'bg-green-600 text-white border-green-500',
    'LANÇAMENTO':      'bg-blue-600 text-white border-blue-500',
    'ALTA POTÊNCIA':   'bg-red-600 text-white border-red-500',
    'PROJETO ESPECIAL':'bg-neutral-700 text-neutral-300 border-neutral-600',
  };
  return styles[tag] || styles['PROJETO ESPECIAL'];
}

function getStatusColor(status) {
  switch (status) {
    case 'NOVO':              return 'text-blue-400 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20';
    case 'PROPOSTA ENVIADA':  return 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20';
    case 'EM NEGOCIAÇÃO':     return 'text-orange-500 border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20';
    case 'FECHADO':           return 'text-green-400 border-green-500/50 bg-green-500/10 hover:bg-green-500/20';
    case 'PERDIDO':           return 'text-red-400 border-red-500/50 bg-red-500/10 hover:bg-red-500/20';
    default:                  return 'text-blue-400 border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20';
  }
}

// Estima geração mensal em kWh
// Prioridade do HSP: hspOverride (HSP da cidade do cliente, via NASA POWER)
// → hsp_medio da franquia (carregado via fetchFranquia) → 5.4 (Araçatuba).
function calcularGeracaoEstimada(potencia_kWp, categoria, hspOverride) {
  const hspCliente = Number(hspOverride);
  const hsp        = hspCliente > 0
    ? hspCliente
    : ((typeof state !== 'undefined' && state.franquiaHsp) ? state.franquiaHsp : 5.4);
  const eficiencia = categoria === 'kitsMicro' ? 0.81 : 0.76;
  return potencia_kWp * hsp * 30 * eficiencia;
}

function copiarTextoBlindado(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).catch((error) => {
      console.warn('[copiarTextoBlindado] Clipboard API falhou, usando fallback.', error);
      fallbackCopiar(texto);
    });
  } else {
    fallbackCopiar(texto);
  }
}

function fallbackCopiar(texto) {
  const textArea = document.createElement('textarea');
  textArea.value = texto;
  textArea.style.position = 'fixed';
  textArea.style.top = '-9999px';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try { document.execCommand('copy'); } catch (err) {
    console.warn('[fallbackCopiar] Falha ao copiar via document.execCommand.', err);
  }
  document.body.removeChild(textArea);
}

// ==========================================
// EXPORTAR XLSX (requer SheetJS)
// ==========================================
function exportToXLSX(rows, columns, filename) {
  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca XLSX não carregada. Recarregue a página.');
    return;
  }
  if (!rows || rows.length === 0) {
    showToast('Nenhum dado para exportar.');
    return;
  }
  const sheetData = rows.map(row => {
    const obj = {};
    columns.forEach(col => {
      // Suporta tanto col.value(row) quanto col.key
      obj[col.header] = typeof col.value === 'function'
        ? col.value(row)
        : (row[col.key] ?? '');
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(sheetData);
  ws['!cols'] = columns.map(c => ({ wch: Math.max((c.header || '').length + 4, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  XLSX.writeFile(wb, `${filename}.xlsx`);
  // Nota: o caller é responsável pelo toast (evita toast duplo)
}

// ==========================================
// CELEBRAÇÃO DE VENDA (confetti + som)
// ==========================================
let _salesCelebrationAudioWarned = false;

function showSalesCelebration() {
  // — Som: sino de notificação elegante —
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioCtx();
    [[1046.5, 0, 0.22], [2093, 0, 0.07], [1568, 0.18, 0.12]].forEach(([freq, delay, vol]) => {
      const osc  = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain); gain.connect(actx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = actx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.start(t); osc.stop(t + 1.45);
    });
  } catch (error) {
    if (!_salesCelebrationAudioWarned) {
      console.warn('[showSalesCelebration] Nao foi possivel tocar audio de celebracao.', error);
      _salesCelebrationAudioWarned = true;
    }
  }

  // — Confetti canvas —
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.remove('hidden');
  const cx = canvas.getContext('2d');
  const COLORS = ['#f97316','#facc15','#22c55e','#3b82f6','#ec4899','#a855f7','#ef4444','#fbbf24'];
  const pieces = Array.from({ length: 200 }, () => ({
    x:  Math.random() * canvas.width,
    y:  -20 - Math.random() * 150,
    w:  Math.random() * 12 + 5,
    h:  Math.random() * 7  + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * 3.5 + 1.5,
    rot:  Math.random() * 360,
    rotV: (Math.random() - 0.5) * 10,
    op: 1,
  }));
  let frame = 0;
  function draw() {
    cx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      cx.save();
      cx.globalAlpha = Math.max(0, p.op);
      cx.translate(p.x, p.y);
      cx.rotate(p.rot * Math.PI / 180);
      cx.fillStyle = p.color;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
      p.x  += p.vx;
      p.y  += p.vy * (1 + frame * 0.004);
      p.rot += p.rotV;
      if (frame > 80) p.op -= 0.01;
    });
    frame++;
    if (frame < 220) requestAnimationFrame(draw);
    else { cx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.add('hidden'); }
  }
  draw();
}

// ==========================================
// AVISO DE NOVA VERSAO PUBLICADA
// ==========================================
const VERSION_CHECK_CONFIG = {
  url: '/version.json',
  intervalMs: 60000,
};

let _versionCheckStarted = false;
let _versionCheckIntervalId = null;
let _versionVisibilityHandlerBound = false;
let _initialLoadedVersion = '';
let _detectedNewVersion = '';
let _versionFetchErrorWarned = false;
const _dismissedVersionNotices = new Set();

function _normalizeVersionValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function _fetchPublishedVersion() {
  try {
    const response = await fetch(`${VERSION_CHECK_CONFIG.url}?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return '';
    const payload = await response.json();
    _versionFetchErrorWarned = false;
    return _normalizeVersionValue(payload?.version);
  } catch (error) {
    if (!_versionFetchErrorWarned) {
      console.warn('[version-watcher] Falha ao consultar version.json. Tentando novamente no proximo ciclo.', error);
      _versionFetchErrorWarned = true;
    }
    return '';
  }
}

function _ensureVersionUpdateNotice() {
  let notice = document.getElementById('version-update-notice');
  if (notice) return notice;

  notice = document.createElement('section');
  notice.id = 'version-update-notice';
  notice.className = 'version-update-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-hidden', 'true');
  notice.innerHTML = `
    <div class="version-update-header">
      <div class="version-update-icon-wrap">
        <i data-lucide="refresh-cw" class="version-update-icon"></i>
      </div>
      <div class="version-update-copy">
        <h3 class="version-update-title">Nova atualiza\u00e7\u00e3o dispon\u00edvel</h3>
        <p class="version-update-text">Recarregue a p\u00e1gina para usar a vers\u00e3o mais recente.</p>
      </div>
    </div>
    <div class="version-update-actions">
      <button id="version-update-now-btn" type="button" class="version-update-btn version-update-btn-primary">Atualizar agora</button>
      <button id="version-update-later-btn" type="button" class="version-update-btn version-update-btn-secondary">Depois</button>
    </div>
  `;
  document.body.appendChild(notice);

  const btnUpdateNow = notice.querySelector('#version-update-now-btn');
  const btnLater = notice.querySelector('#version-update-later-btn');

  if (btnUpdateNow) {
    btnUpdateNow.addEventListener('click', () => {
      btnUpdateNow.setAttribute('disabled', 'true');
      btnUpdateNow.textContent = 'Atualizando...';
      const url = new URL(window.location.href);
      url.searchParams.set('app_v', _detectedNewVersion || String(Date.now()));
      window.location.replace(url.toString());
    });
  }

  if (btnLater) {
    btnLater.addEventListener('click', () => {
      if (_detectedNewVersion) _dismissedVersionNotices.add(_detectedNewVersion);
      _hideVersionUpdateNotice();
    });
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  return notice;
}

function _showVersionUpdateNotice(remoteVersion) {
  const notice = _ensureVersionUpdateNotice();
  _detectedNewVersion = remoteVersion;
  notice.classList.add('is-visible');
  notice.setAttribute('aria-hidden', 'false');
}

function _hideVersionUpdateNotice() {
  const notice = document.getElementById('version-update-notice');
  if (!notice) return;

  notice.classList.remove('is-visible');
  notice.setAttribute('aria-hidden', 'true');
}

async function checkForPublishedVersionUpdate() {
  if (document.visibilityState === 'hidden') return;

  const remoteVersion = await _fetchPublishedVersion();
  if (!remoteVersion) return;

  if (!_initialLoadedVersion) {
    _initialLoadedVersion = remoteVersion;
    return;
  }

  if (remoteVersion === _initialLoadedVersion) return;
  if (_dismissedVersionNotices.has(remoteVersion)) return;

  _showVersionUpdateNotice(remoteVersion);
}

function _startPublishedVersionPolling() {
  if (_versionCheckIntervalId) return;

  _versionCheckIntervalId = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    checkForPublishedVersionUpdate();
  }, VERSION_CHECK_CONFIG.intervalMs);
}

function _bindPublishedVersionVisibilityHandler() {
  if (_versionVisibilityHandlerBound) return;
  _versionVisibilityHandlerBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkForPublishedVersionUpdate();
  });
}

async function initPublishedVersionWatcher() {
  if (_versionCheckStarted) return;
  _versionCheckStarted = true;

  const initialVersion = await _fetchPublishedVersion();
  if (initialVersion) _initialLoadedVersion = initialVersion;

  _startPublishedVersionPolling();
  _bindPublishedVersionVisibilityHandler();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPublishedVersionWatcher, { once: true });
} else {
  initPublishedVersionWatcher();
}


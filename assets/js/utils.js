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

// Várias telas redesenham o container inteiro (innerHTML) a cada busca, o que
// destrói o <input> em uso: o foco sumia após a pausa do debounce e só dava
// para digitar uma palavra por vez. Guarda o campo focado antes do redesenho
// e devolve foco, texto e cursor ao campo equivalente recriado.
function captureTextInputFocus() {
  const el = document.activeElement;
  if (!el || !el.isConnected) return () => {};
  const isText = el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && /^(text|search|email|tel|url|)$/i.test(el.type || ''));
  if (!isText) return () => {};

  const id = el.id;
  const oninput = el.getAttribute('oninput');
  const placeholder = el.getAttribute('placeholder');
  if (!id && !oninput && !placeholder) return () => {};

  const value = el.value;
  const start = el.selectionStart;
  const end = el.selectionEnd;

  return () => {
    if (el.isConnected && document.activeElement === el) return;
    let target = id ? document.getElementById(id) : null;
    if (!target) {
      target = Array.from(document.querySelectorAll('input, textarea')).find((c) =>
        (oninput ? c.getAttribute('oninput') === oninput : true)
        && (placeholder ? c.getAttribute('placeholder') === placeholder : true)
      ) || null;
    }
    if (!target) return;
    if (target.value !== value) target.value = value;
    target.focus({ preventScroll: true });
    try { target.setSelectionRange(start, end); } catch (_) {}
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
// CELEBRAÇÃO DE VENDA (card + confete + raios + som)
// Visual em main.css (.sale-cel). Dark = laranja/amarelo; light = azul,
// seguindo a troca de acento do theme-light.css.
// ==========================================
let _salesCelebrationAudioWarned = false;
let _saleCelTimers = [];
let _saleConfetti = { parts: [], raf: 0, last: 0, w: 0, h: 0, ctx: null, canvas: null };

const SALE_CONFETTI_COLORS = {
  dark:  ['#f97316', '#fb923c', '#ea580c', '#facc15', '#fbbf24', '#ffffff', '#22c55e'],
  light: ['#2563eb', '#3b82f6', '#60a5fa', '#1d4ed8', '#facc15', '#eab308', '#22c55e'],
};
const SALE_CONFETTI_SHAPES = ['rect', 'rect', 'rect', 'circle', 'sun', 'bolt', 'panel'];

function _playSaleSound() {
  // Arpejo subindo (dó-mi-sol-dó) fechando num acorde — sintetizado, sem arquivo.
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const actx = new AudioCtx();
    const tone = (freq, delay, vol, dur, type) => {
      const osc  = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(actx.destination);
      const t = actx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.05);
    };
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, i * 0.09, 0.15, 0.45, 'triangle');
      tone(f * 2, i * 0.09, 0.035, 0.3, 'sine');
    });
    [1046.5, 1318.5, 1568, 2093].forEach((f) => tone(f, 0.38, 0.08, 1.7, 'triangle'));
    tone(523.25, 0.38, 0.12, 1.3, 'sine');
    setTimeout(() => { actx.close().catch(() => {}); }, 2500);
  } catch (error) {
    if (!_salesCelebrationAudioWarned) {
      console.warn('[showSalesCelebration] Nao foi possivel tocar audio de celebracao.', error);
      _salesCelebrationAudioWarned = true;
    }
  }
}

function _saleConfettiSetup() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return false;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = _saleConfetti;
  c.canvas = canvas;
  c.w = window.innerWidth;
  c.h = window.innerHeight;
  canvas.width  = c.w * dpr;
  canvas.height = c.h * dpr;
  c.ctx = canvas.getContext('2d');
  c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.classList.remove('hidden');
  return true;
}

function _saleConfettiBurst(x, y, count, angle, spread, minSpeed, maxSpeed, colors) {
  const scale = Math.max(0.85, Math.min(1.35, _saleConfetti.h / 700));
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const speed = (minSpeed + Math.random() * (maxSpeed - minSpeed)) * scale;
    const shape = SALE_CONFETTI_SHAPES[Math.floor(Math.random() * SALE_CONFETTI_SHAPES.length)];
    const size = shape === 'rect' ? 8 + Math.random() * 7
      : shape === 'circle' ? 3 + Math.random() * 3
      : 13 + Math.random() * 7;
    _saleConfetti.parts.push({
      x, y, shape, size,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.3,
      tilt: Math.random() * Math.PI * 2,
      tiltV: 0.08 + Math.random() * 0.12,
      life: 220 + Math.random() * 90,
    });
  }
  if (!_saleConfetti.raf) {
    _saleConfetti.last = performance.now();
    _saleConfetti.raf = requestAnimationFrame(_saleConfettiLoop);
  }
}

function _saleConfettiDraw(ctx, p) {
  const s = p.size;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, Math.cos(p.tilt)); // "vira" no ar, efeito de papel
  ctx.globalAlpha = Math.min(1, p.life / 40);
  ctx.fillStyle = p.color;
  switch (p.shape) {
    case 'rect':
      ctx.fillRect(-s / 2, -s / 4, s, s / 2);
      break;
    case 'circle':
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      break;
    case 'sun':
      ctx.fillStyle = ctx.strokeStyle = '#facc15';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        ctx.moveTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45);
        ctx.lineTo(Math.cos(a) * s * 0.72, Math.sin(a) * s * 0.72);
      }
      ctx.stroke();
      break;
    case 'bolt':
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -s * 0.6); ctx.lineTo(-s * 0.35, s * 0.08); ctx.lineTo(-s * 0.02, s * 0.08);
      ctx.lineTo(-s * 0.15, s * 0.6); ctx.lineTo(s * 0.35, -s * 0.08); ctx.lineTo(s * 0.02, -s * 0.08);
      ctx.closePath(); ctx.fill();
      break;
    case 'panel':
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-s * 0.17, -s * 0.35); ctx.lineTo(-s * 0.17, s * 0.35);
      ctx.moveTo(s * 0.17, -s * 0.35);  ctx.lineTo(s * 0.17, s * 0.35);
      ctx.moveTo(-s * 0.5, 0);          ctx.lineTo(s * 0.5, 0);
      ctx.stroke();
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
      ctx.strokeRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      break;
  }
  ctx.restore();
}

function _saleConfettiLoop(now) {
  const c = _saleConfetti;
  // Física por tempo (não por frame): mesma velocidade em telas de 60 e 120 Hz.
  const k = Math.min(3, (now - c.last) / 16.667);
  c.last = now;
  const drag = Math.pow(0.96, k);
  c.ctx.clearRect(0, 0, c.w, c.h);
  for (const p of c.parts) {
    p.vx *= drag;
    p.vy = p.vy * drag + 0.12 * k;
    p.x += (p.vx + Math.sin(p.tilt) * 0.6) * k;
    p.y += p.vy * k;
    p.rot += p.rotV * k;
    p.tilt += p.tiltV * k;
    p.life -= k;
    _saleConfettiDraw(c.ctx, p);
  }
  c.parts = c.parts.filter((p) => p.life > 0 && p.y < c.h + 40);
  if (c.parts.length) {
    c.raf = requestAnimationFrame(_saleConfettiLoop);
  } else {
    c.raf = 0;
    c.ctx.clearRect(0, 0, c.w, c.h);
    c.canvas.classList.add('hidden');
  }
}

// "Sua 3ª venda em setembro · R$ 96 mil no mês", calculado de state.vendas
// (já recarregado com a venda nova). Vazio se não der pra calcular.
function _saleCelebrationStat(info) {
  const email = String(info.vendedorEmail || '').toLowerCase();
  if (!email || typeof state === 'undefined' || !Array.isArray(state.vendas)) return '';
  const now = new Date();
  const doMes = state.vendas.filter((v) => {
    if (String(v.vendedor_email || '').toLowerCase() !== email) return false;
    const d = new Date(v.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const n = doMes.length;
  if (!n) return '';
  const mes = now.toLocaleDateString('pt-BR', { month: 'long' });
  const total = doMes.reduce((sum, v) => sum + (Number(v.kit_price) || 0), 0);
  const isOwn = !!state.currentUser && email === String(state.currentUser.email || '').toLowerCase();
  const nome = escapeHTML(String(info.vendedorNome || '').split(' ')[0]);

  if (n === 1) {
    return isOwn || !nome
      ? `<strong>1ª venda de ${mes}!</strong> Começou o mês com o pé direito`
      : `<strong>1ª venda de ${nome}</strong> em ${mes}!`;
  }
  const quem = isOwn || !nome ? `Sua <strong>${n}ª venda</strong>` : `<strong>${n}ª venda</strong> de ${nome}`;
  return `${quem} em ${mes} · <strong>${formatCurrencyCompact(total)}</strong> no mês`;
}

function closeSalesCelebration(immediate = false) {
  _saleCelTimers.forEach(clearTimeout);
  _saleCelTimers = [];
  document.removeEventListener('keydown', _saleCelOnKey);
  const el = document.getElementById('sale-celebration');
  if (!el) return;
  if (immediate) { el.remove(); return; }
  el.classList.remove('is-open');
  el.classList.add('is-closing');
  setTimeout(() => el.remove(), 350);
}

function _saleCelOnKey(e) {
  if (e.key === 'Escape') closeSalesCelebration();
}

function showSalesCelebration(info = {}) {
  _playSaleSound();
  closeSalesCelebration(true);

  const isLight = document.body.classList.contains('theme-light');
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const valor = Number(info.valor) || 0;
  const potencia = Number(info.potencia) || 0;
  const kitLine = [
    potencia ? `${potencia.toLocaleString('pt-BR')} kWp` : '',
    String(info.kitNome || ''),
  ].filter(Boolean).map(escapeHTML).join(' · ');
  const stat = _saleCelebrationStat(info);

  const el = document.createElement('div');
  el.id = 'sale-celebration';
  el.className = 'sale-cel';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="sale-cel__rays" aria-hidden="true"><div class="sale-cel__rays-spin"></div></div>
    <div class="sale-cel__card">
      <div class="sale-cel__inner">
        <div class="animated-stripe sale-cel__stripe"></div>
        <div class="sale-cel__stamp" aria-hidden="true">FECHADO</div>
        <div class="sale-cel__icon"><i data-lucide="trophy"></i></div>
        <p class="sale-cel__label">Venda fechada!</p>
        ${valor ? `<p class="sale-cel__value">${formatCurrency(reduce ? valor : 0)}</p>` : ''}
        ${info.cliente ? `<p class="sale-cel__client">${escapeHTML(info.cliente)}</p>` : ''}
        ${kitLine ? `<p class="sale-cel__kit"><i data-lucide="zap"></i><span>${kitLine}</span></p>` : ''}
        ${stat ? `<p class="sale-cel__stat">${stat}</p>` : ''}
        <p class="sale-cel__hint">Toque para fechar</p>
      </div>
    </div>`;
  document.body.appendChild(el);
  if (window.lucide) lucide.createIcons();

  void el.offsetWidth; // garante que as animações de entrada rodem
  el.classList.add('is-open');
  el.addEventListener('click', () => closeSalesCelebration());
  document.addEventListener('keydown', _saleCelOnKey);

  // Valor subindo de R$ 0 até o total (ease-out)
  const valueEl = el.querySelector('.sale-cel__value');
  if (valueEl && !reduce) {
    _saleCelTimers.push(setTimeout(() => {
      const t0 = performance.now();
      const step = (t) => {
        if (!valueEl.isConnected) return;
        const p = Math.min(1, (t - t0) / 1400);
        const eased = 1 - Math.pow(1 - p, 3);
        valueEl.textContent = formatCurrency(p < 1 ? Math.round(valor * eased) : valor);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 250));
  }

  // Confete: estouro do centro + um menor quando o carimbo bate
  if (!reduce && _saleConfettiSetup()) {
    const colors = SALE_CONFETTI_COLORS[isLight ? 'light' : 'dark'];
    const { w, h } = _saleConfetti;
    const count = w < 640 ? 100 : 160;
    _saleConfettiBurst(w / 2, h / 2, count, -Math.PI / 2, Math.PI * 1.4, 6, 15, colors);
    _saleCelTimers.push(setTimeout(() => {
      _saleConfettiBurst(w / 2, h / 2 - 60, Math.round(count / 3.5), -Math.PI / 2, Math.PI * 2, 3, 8, colors);
    }, 830));
  }

  _saleCelTimers.push(setTimeout(() => closeSalesCelebration(), 6000));
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


// ==========================================
// MÁSCARAS DE CAMPO (CPF / CNPJ / CEP)
// ==========================================
// modo: 'cpf' | 'cnpj' | 'auto' (até 11 dígitos = CPF, depois vira CNPJ)
function mascaraDocumento(valor, modo = 'auto') {
  const max = modo === 'cpf' ? 11 : 14;
  const d = String(valor ?? '').replace(/\D/g, '').slice(0, max);
  if (modo === 'cnpj' || (modo === 'auto' && d.length > 11)) {
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function mascaraCEP(valor) {
  return String(valor ?? '').replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
}

// Aplica a máscara mantendo o cursor no mesmo dígito (dá para editar no meio)
function aplicarMascaraInput(el, formatar) {
  if (!el) return;
  const pos = el.selectionStart ?? el.value.length;
  const digitosAntes = el.value.slice(0, pos).replace(/\D/g, '').length;
  el.value = formatar(el.value);
  if (document.activeElement !== el) return;
  let novo = 0, vistos = 0;
  while (novo < el.value.length && vistos < digitosAntes) {
    if (/\d/.test(el.value[novo])) vistos++;
    novo++;
  }
  el.setSelectionRange(novo, novo);
}

// Liga a máscara num input (formata o valor atual e o que for digitado/colado)
function ligarMascara(el, tipo) {
  if (!el || el.dataset.mascara) return;
  const formatar = tipo === 'cep' ? mascaraCEP : (v) => mascaraDocumento(v, tipo);
  el.dataset.mascara = tipo;
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('maxlength', tipo === 'cep' ? '9' : tipo === 'cpf' ? '14' : '18');
  el.value = formatar(el.value);
  el.addEventListener('input', () => aplicarMascaraInput(el, formatar));
}

// Dígitos verificadores. Vazio conta como válido (campo opcional).
function documentoValido(valor) {
  const d = String(valor ?? '').replace(/\D/g, '');
  if (!d) return true;
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dv = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const dv = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}

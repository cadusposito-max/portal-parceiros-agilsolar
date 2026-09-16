// ==========================================
// GRÁFICO DE GERAÇÃO MENSAL (proposta web + PDF)
// SVG inline, sem biblioteca: fica nítido no print e no html2canvas
// e não exige liberar nada na CSP.
// ==========================================

const GERACAO_MESES_NASA  = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GERACAO_MESES_LABEL = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const GERACAO_MESES_NOME  = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const GERACAO_DIAS_MES    = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Mesmos fatores da calculadora de engenharia (engenharia.js) — fallback sem HSP da cidade.
const GERACAO_FATORES_SAZONAIS = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];

// Distribui a geração média (kWh/mês, a mesma exibida na proposta) pelos 12 meses.
// Com HSP mensal da cidade (NASA POWER): peso = hsp_mes/hsp_anual × dias/30.
// Os pesos são normalizados para a média do gráfico bater com a média exibida.
// Retorna { valores: number[12], fonte: 'cidade' | 'estimativa' }.
function calcularGeracaoMensal(geracaoMedia, hspMensal, hspAnual) {
  const media = Number(geracaoMedia) || 0;
  let serie = hspMensal;
  if (typeof serie === 'string') {
    try { serie = JSON.parse(serie); } catch (e) { serie = null; }
  }

  let fatores = null;
  let fonte   = 'estimativa';
  if (serie && typeof serie === 'object') {
    const hspMeses = GERACAO_MESES_NASA.map((m) => Number(serie[m]));
    if (hspMeses.every((v) => Number.isFinite(v) && v > 0)) {
      const anual = Number(hspAnual) > 0 ? Number(hspAnual) : (Number(serie.ANN) || 0);
      if (anual > 0) {
        fatores = hspMeses.map((v) => v / anual);
        fonte   = 'cidade';
      }
    }
  }
  if (!fatores) fatores = GERACAO_FATORES_SAZONAIS.slice();

  const pesos    = fatores.map((f, i) => f * GERACAO_DIAS_MES[i] / 30);
  const somaPeso = pesos.reduce((a, b) => a + b, 0) || 12;
  const valores  = pesos.map((p) => media * 12 * p / somaPeso);
  return { valores, fonte };
}

function resumoGeracaoMensal(valores) {
  const total = valores.reduce((a, b) => a + b, 0);
  let pico = 0;
  valores.forEach((v, i) => { if (v > valores[pico]) pico = i; });
  return {
    media:    total / 12,
    total:    total,
    picoMes:  GERACAO_MESES_NOME[pico],
    picoValor: valores[pico],
  };
}

// "araçatuba/sp" → "Araçatuba/SP" (cidade vem do cadastro em caixa variada).
function formatarCidadeUF(valor) {
  const s = String(valor || '').trim();
  if (!s) return '';
  const [cidade, uf] = s.split('/');
  const minusculas = ['de', 'da', 'do', 'das', 'dos', 'e'];
  const nome = cidade.toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.includes(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
  return uf ? `${nome}/${uf.trim().toUpperCase()}` : nome;
}

function _geracaoFmtInt(n) {
  return Math.round(n).toLocaleString('pt-BR');
}

// Arredonda o topo do eixo para um valor "redondo" (100, 200, 250, 500, 1000…).
function _geracaoEixoMax(max) {
  if (max <= 0) return 100;
  const alvo = max * 1.08;
  const base = Math.pow(10, Math.floor(Math.log10(alvo)));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * base >= alvo) || 10;
  return passo * base;
}

// tema: 'light' (PDF / tema claro) | 'dark' (proposta web escura)
// compacto: true em telas estreitas — viewBox menor, fonte maior e sem rótulo
// em cima das barras (senão o texto fica ilegível no celular).
function renderGeracaoChartSVG(valores, opts) {
  const tema     = (opts && opts.tema) || 'light';
  const compacto = !!(opts && opts.compacto);
  const c = tema === 'dark'
    ? { fundo: '#000000', grid: '#262626', base: '#404040', eixo: '#737373', mes: '#a3a3a3', rotulo: '#e5e5e5', barra: '#f97316', barraBaixa: '#9a3412', media: '#facc15' }
    : { fundo: '#ffffff', grid: '#f1f5f9', base: '#cbd5e1', eixo: '#94a3b8', mes: '#64748b', rotulo: '#334155', barra: '#f97316', barraBaixa: '#fdba74', media: '#0f172a' };

  const W  = compacto ? 340 : 570;
  const H  = compacto ? 200 : 196;
  const fs = compacto ? 11 : 9;
  const x0 = compacto ? 34 : 40, x1 = W - 5, yTop = 12, yBase = compacto ? 172 : 170;
  const alturaUtil = yBase - yTop;
  const maxEixo = _geracaoEixoMax(Math.max.apply(null, valores));
  const slot = (x1 - x0) / 12;
  const larg = Math.min(26, slot * 0.6);
  const media = valores.reduce((a, b) => a + b, 0) / 12;
  const y = (v) => yBase - (v / maxEixo) * alturaUtil;
  const font = "font-family=\"Inter,system-ui,sans-serif\"";

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Geração mensal estimada de janeiro a dezembro" style="display:block">`;

  s += `<g ${font} font-size="${fs}" fill="${c.eixo}">`;
  for (let i = 0; i <= 4; i++) {
    const v  = maxEixo * i / 4;
    const yy = y(v).toFixed(1);
    s += `<line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}" stroke="${i === 0 ? c.base : c.grid}"/>`;
    s += `<text x="${x0 - 6}" y="${(Number(yy) + 3).toFixed(1)}" text-anchor="end">${_geracaoFmtInt(v)}</text>`;
  }
  s += '</g>';

  // Meses abaixo de 90% da média ganham tom mais suave (inverno).
  s += '<g>';
  valores.forEach((v, i) => {
    const bx = x0 + i * slot + (slot - larg) / 2;
    const by = y(v);
    const cor = v < media * 0.9 ? c.barraBaixa : c.barra;
    s += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${larg.toFixed(1)}" height="${(yBase - by).toFixed(1)}" rx="3" fill="${cor}"/>`;
  });
  s += '</g>';

  const ym = y(media).toFixed(1);
  s += `<line x1="${x0}" x2="${x1}" y1="${ym}" y2="${ym}" stroke="${c.media}" stroke-width="1.2" stroke-dasharray="4 3"/>`;

  if (!compacto) {
    // Contorno na cor do fundo: rótulo continua legível quando cruza a linha da média.
    s += `<g ${font} font-size="8.5" font-weight="700" fill="${c.rotulo}" text-anchor="middle" stroke="${c.fundo}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">`;
    valores.forEach((v, i) => {
      const cx = x0 + i * slot + slot / 2;
      s += `<text x="${cx.toFixed(1)}" y="${(y(v) - 4).toFixed(1)}">${_geracaoFmtInt(v)}</text>`;
    });
    s += '</g>';
  }

  s += `<g ${font} font-size="${fs}" font-weight="600" fill="${c.mes}" text-anchor="middle">`;
  GERACAO_MESES_LABEL.forEach((m, i) => {
    const cx = x0 + i * slot + slot / 2;
    s += `<text x="${cx.toFixed(1)}" y="${H - 10}">${compacto ? m.charAt(0) : m}</text>`;
  });
  s += '</g></svg>';
  return s;
}

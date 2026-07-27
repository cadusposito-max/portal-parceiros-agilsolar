// ==========================================
// COMERCIAL: ABA ANÁLISE (admin/gestor)
// ==========================================
// Responde as perguntas de gestão que o dashboard não respondia: onde o funil
// vaza, quanto tempo cada etapa leva, de onde vêm os leads que fecham, por que
// perdemos, e quem no time está usando o CRM de fato.
//
// Tudo client-side sobre o que já está em state (348 clientes / 681 propostas
// hoje — sobra folga). ESCALA: passando de ~5k clientes, migrar as agregações
// para uma RPC (o app já baixa as bases inteiras; o gargalo aparece no fetch,
// não aqui).
//
// Depende de: dashboard.js (getDashboardScopedRows), config.js (CLIENT_ORIGENS,
// clientOrigemLabel), clientes.js (CLIENT_STATUS_SEQUENCE, normalizeClientStatus),
// crm-metas.js (getMetaVendedor), app.js (propostaStatus/propostaPreco).

const ANALISE_SUBS = [
  { id: 'conversao', label: 'Conversão',      icon: 'git-merge' },
  { id: 'origens',   label: 'Origens & Perdas', icon: 'pie-chart' },
  { id: 'equipe',    label: 'Equipe',         icon: 'users' },
];

let _analiseSub = 'conversao';
let _analiseHistoryCarregado = false;

function setAnaliseSub(sub) {
  _analiseSub = sub;
  renderContent();
}

// --- helpers ------------------------------------------------------------
function _anMedia(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}
function _anDias(deIso, ateIso) {
  const a = new Date(deIso), b = new Date(ateIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getTime() - a.getTime()) / 86400000;
}
function _anPct(parte, total) {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}
// Barra horizontal — o componente mais repetido desta aba.
function _anBarra(label, valor, max, cor, sufixo = '') {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return `
    <div>
      <div class="flex items-center justify-between gap-2 text-[10px] font-bold mb-1">
        <span class="text-neutral-300 truncate">${escapeHTML(label)}</span>
        <span class="shrink-0 num text-neutral-400">${valor}${sufixo}</span>
      </div>
      <div class="h-1.5 bg-neutral-900 border border-neutral-800/60 overflow-hidden">
        <div class="h-full ${cor} transition-all duration-700" style="width: ${Math.max(pct, valor > 0 ? 2 : 0)}%"></div>
      </div>
    </div>`;
}

function _anCard(titulo, valor, sub, cor = 'text-white') {
  return `
    <article class="border border-neutral-800 bg-[#0b0b0b] p-3">
      <p class="text-[8px] text-neutral-600 font-black uppercase tracking-widest">${escapeHTML(titulo)}</p>
      <p class="text-lg font-black ${cor} num mt-0.5">${valor}</p>
      <p class="text-[9px] text-neutral-600 font-bold mt-0.5">${sub}</p>
    </article>`;
}

function _anPainel(titulo, corpo, extra = '') {
  return `
    <section class="border border-neutral-800/60 bg-[#0b0b0b] p-4">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="text-[10px] font-black text-white uppercase tracking-widest">${escapeHTML(titulo)}</h3>
        ${extra}
      </div>
      ${corpo}
    </section>`;
}

function _anVazio(msg) {
  return `<p class="text-[10px] text-neutral-600 font-bold uppercase">${escapeHTML(msg)}</p>`;
}

// =======================================================================
// SUB-ABA: CONVERSÃO
// =======================================================================
function _analiseConversaoHTML() {
  const clientes = getDashboardScopedRows(state.clientes || []);
  const propostas = getDashboardScopedRows(state.propostas || []);
  const vendas = getDashboardScopedRows(state.vendas || []);

  // --- Funil por etapa ---
  const etapas = [...CLIENT_STATUS_SEQUENCE];
  const contagem = {};
  etapas.concat('PERDIDO').forEach((e) => { contagem[e] = 0; });
  clientes.forEach((c) => { contagem[normalizeClientStatus(c.status)] += 1; });
  const maxEtapa = Math.max(...etapas.map((e) => contagem[e]), 1);

  const funilHTML = etapas.map((etapa, idx) => {
    const anterior = idx > 0 ? contagem[etapas[idx - 1]] : null;
    const taxa = anterior !== null ? _anPct(contagem[etapa], anterior) : null;
    return `
      <div>
        <div class="flex items-center justify-between gap-2 text-[10px] font-bold mb-1">
          <span class="text-neutral-300">${escapeHTML(etapa)}</span>
          <span class="shrink-0 num text-neutral-400">${contagem[etapa]}${taxa !== null ? ` <span class="${taxa >= 50 ? 'text-green-500/70' : 'text-red-400/70'}">(${taxa}% da etapa anterior)</span>` : ''}</span>
        </div>
        <div class="h-2 bg-neutral-900 border border-neutral-800/60 overflow-hidden">
          <div class="h-full bg-gradient-to-r from-orange-600 to-yellow-500 transition-all duration-700" style="width: ${Math.max(_anPct(contagem[etapa], maxEtapa), contagem[etapa] > 0 ? 2 : 0)}%"></div>
        </div>
      </div>`;
  }).join('');

  // --- Ciclo da proposta (GERADA → ENVIADA → VISTA → ACEITA) ---
  const ciclo = { GERADA: 0, ENVIADA: 0, VISTA: 0, ACEITA: 0 };
  propostas.forEach((p) => { ciclo[propostaStatus(p)] += 1; });
  const totalProp = propostas.length;
  // Status é o estágio ATUAL, não acumulado: quem foi vista já passou por enviada.
  const passouEnviada = ciclo.ENVIADA + ciclo.VISTA + ciclo.ACEITA;
  const passouVista = ciclo.VISTA + ciclo.ACEITA;

  const cicloHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
      ${_anCard('Geradas', totalProp, 'total de propostas')}
      ${_anCard('Enviadas', passouEnviada, `${_anPct(passouEnviada, totalProp)}% das geradas`, 'text-blue-400')}
      ${_anCard('Vistas pelo cliente', passouVista, `${_anPct(passouVista, passouEnviada)}% das enviadas`, 'text-orange-400')}
      ${_anCard('Aceitas', ciclo.ACEITA, `${_anPct(ciclo.ACEITA, passouVista)}% das vistas`, 'text-green-400')}
    </div>
    ${ciclo.GERADA === totalProp && totalProp > 0
      ? '<p class="text-[10px] text-neutral-600 font-medium mt-2">Todas as propostas ainda estão como GERADA — o ciclo passa a medir quando a equipe enviar pelo painel de compartilhamento.</p>'
      : ''}`;

  // --- Tempo médio por etapa (do histórico de status) ---
  const history = state.crmStatusHistory || [];
  const porCliente = {};
  history.forEach((h) => {
    if (!porCliente[h.cliente_id]) porCliente[h.cliente_id] = [];
    porCliente[h.cliente_id].push(h);
  });

  const duracoes = {};
  etapas.forEach((e) => { duracoes[e] = []; });
  Object.values(porCliente).forEach((eventos) => {
    for (let i = 0; i < eventos.length - 1; i += 1) {
      const de = eventos[i]?.meta?.para;
      if (!de || !duracoes[de]) continue;
      const dias = _anDias(eventos[i].created_at, eventos[i + 1].created_at);
      if (dias !== null && dias >= 0) duracoes[de].push(dias);
    }
  });

  const temHistorico = Object.values(duracoes).some((d) => d.length > 0);
  const tempoHTML = temHistorico
    ? etapas.map((etapa) => {
        const amostras = duracoes[etapa];
        const media = _anMedia(amostras);
        return `
          <div class="flex items-center justify-between border border-neutral-800 px-3 py-2">
            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300">${escapeHTML(etapa)}</span>
            <span class="text-[10px] font-black num ${amostras.length ? 'text-blue-400' : 'text-neutral-700'}">
              ${amostras.length ? `${media.toFixed(1)} dias` : '—'}
              <span class="text-neutral-700 font-bold">(${amostras.length})</span>
            </span>
          </div>`;
      }).join('')
    : _anVazio('Ainda sem histórico suficiente de mudanças de status.');

  // --- Evolução mensal ---
  const meses = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const serieClientes = meses.map((m) => clientes.filter((c) => toMonthKey(c.created_at) === m).length);
  const seriePropostas = meses.map((m) => propostas.filter((p) => toMonthKey(p.created_at) === m).length);
  const serieVendas = meses.map((m) => vendas.filter((v) => toMonthKey(v.created_at) === m).length);

  return `
    <div class="flex flex-col gap-3">
      ${_anPainel('Ciclo da proposta', cicloHTML)}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        ${_anPainel('Funil por etapa', `<div class="flex flex-col gap-3">${funilHTML}</div>
          <p class="text-[10px] text-neutral-600 font-medium mt-3">${contagem.PERDIDO} marcados como perdidos (fora do funil ativo).</p>`)}
        ${_anPainel('Tempo médio por etapa', `<div class="flex flex-col gap-2">${tempoHTML}</div>
          <p class="text-[9px] text-neutral-700 font-medium mt-2.5">Medido pelas mudanças de status registradas — o histórico começa em julho/2026.</p>`)}
      </div>
      ${_anPainel('Evolução mensal', _analiseGraficoLinhas(meses, [
        { nome: 'Clientes', dados: serieClientes, cor: '#a3a3a3' },
        { nome: 'Propostas', dados: seriePropostas, cor: '#f97316' },
        { nome: 'Vendas', dados: serieVendas, cor: '#22c55e' },
      ]))}
    </div>`;
}

// Gráfico de linhas em SVG puro (mesmo espírito do gráfico do protótipo do
// Financeiro): viewBox + preserveAspectRatio="none" para escalar sozinho, com
// vector-effect no CSS para a linha não engordar junto.
//
// Só as LINHAS ficam dentro do SVG. Como o preserveAspectRatio="none" estica o
// desenho na horizontal, qualquer <circle> ali viraria elipse e o gráfico ganha
// cara de bitmap escalado — então marcadores e rótulos são spans posicionados em
// %, que acompanham o resize sozinhos (mesmo truque do .fat-dot no Financeiro).
function _analiseGraficoLinhas(labels, series) {
  const W = 1000, H = 260, padL = 90, padR = 60, padT = 24, padB = 28;
  const maxY = Math.max(1, ...series.flatMap((s) => s.dados));
  const stepX = labels.length > 1 ? (W - padL - padR) / (labels.length - 1) : 0;
  const px = (i) => padL + i * stepX;
  const py = (v) => padT + (1 - v / maxY) * (H - padT - padB);
  const pctX = (v) => `${(v / W * 100).toFixed(3)}%`;
  const pctY = (v) => `${(v / H * 100).toFixed(3)}%`;

  const linhas = series.map((s) => {
    const pts = s.dados.map((v, i) => `${px(i)},${py(v)}`).join(' ');
    return `<polyline class="crm-chart-line" points="${pts}" style="stroke:${s.cor}"></polyline>`;
  }).join('');

  const pontos = series.map((s) => s.dados.map((v, i) =>
    `<span class="crm-chart-dot" style="left:${pctX(px(i))};top:${pctY(py(v))};background:${s.cor}"></span>`
  ).join('')).join('');

  const grades = [0, 0.25, 0.5, 0.75].map((f) => {
    const gy = padT + f * (H - padT - padB);
    return `<line class="crm-chart-grid" x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}"></line>`;
  }).join('');
  // Eixo separado da grade: com uma série zerada a linha cai bem em cima dele.
  const eixo = `<line class="crm-chart-axis" x1="${padL}" y1="${py(0)}" x2="${W - padR}" y2="${py(0)}"></line>`;

  // Os valores do eixo Y moram na calha à esquerda do padL, fora da plotagem.
  const goteira = `calc(${(100 - padL / W * 100).toFixed(3)}% + 6px)`;
  const marcasY = [maxY, Math.round(maxY / 2), 0].map((v) =>
    `<span class="crm-chart-ylab num" style="top:${pctY(py(v))};right:${goteira}">${v}</span>`
  ).join('');

  const marcasX = labels.map((m, i) =>
    `<span class="crm-chart-xlab" style="left:${pctX(px(i))}">${formatMonthLabel(m)}</span>`
  ).join('');

  const zeradas = series.filter((s) => s.dados.every((v) => v === 0)).map((s) => s.nome);

  return `
    <div class="flex flex-wrap items-center gap-3 mb-2">
      ${series.map((s) => `<span class="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-400">
        <span class="w-2.5 h-0.5" style="background:${s.cor}"></span>${escapeHTML(s.nome)}
      </span>`).join('')}
    </div>
    <div class="crm-chart">
      <div class="crm-chart-plot">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:clamp(180px,20vw,260px)">
          ${grades}
          ${eixo}
          ${linhas}
        </svg>
        ${pontos}
        ${marcasY}
      </div>
      <div class="crm-chart-xaxis">${marcasX}</div>
    </div>
    ${zeradas.length ? `<p class="text-[10px] text-neutral-600 font-medium mt-3">${escapeHTML(zeradas.join(' e '))} sem registro no período.</p>` : ''}`;
}

// =======================================================================
// SUB-ABA: ORIGENS & PERDAS
// =======================================================================
function _analiseOrigensHTML() {
  const clientes = getDashboardScopedRows(state.clientes || []);
  const vendas = getDashboardScopedRows(state.vendas || []);

  // Vendas por cliente para medir conversão por origem.
  const vendeuPorCliente = new Set(vendas.map((v) => String(v.cliente_id)).filter(Boolean));

  const porOrigem = {};
  clientes.forEach((c) => {
    const label = clientOrigemLabel(c.origem);
    if (!porOrigem[label]) porOrigem[label] = { total: 0, ganhos: 0 };
    porOrigem[label].total += 1;
    if (vendeuPorCliente.has(String(c.id))) porOrigem[label].ganhos += 1;
  });

  const origens = Object.entries(porOrigem).sort((a, b) => b[1].total - a[1].total);
  const maxOrigem = Math.max(...origens.map(([, v]) => v.total), 1);

  const origensHTML = origens.length
    ? origens.map(([label, v]) => `
        <div>
          <div class="flex items-center justify-between gap-2 text-[10px] font-bold mb-1">
            <span class="text-neutral-300 truncate">${escapeHTML(label)}</span>
            <span class="shrink-0 num text-neutral-400">${v.total} <span class="text-neutral-700">·</span> <span class="${v.ganhos > 0 ? 'text-green-400' : 'text-neutral-700'}">${v.ganhos} ganho${v.ganhos === 1 ? '' : 's'}</span></span>
          </div>
          <div class="h-1.5 bg-neutral-900 border border-neutral-800/60 overflow-hidden">
            <div class="h-full bg-orange-500 transition-all duration-700" style="width: ${_anPct(v.total, maxOrigem)}%"></div>
          </div>
        </div>`).join('')
    : _anVazio('Nenhum cliente na base.');

  const naoInformado = porOrigem['NÃO INFORMADO']?.total || 0;

  // --- Motivos de perda ---
  const perdidos = clientes.filter((c) => normalizeClientStatus(c.status) === 'PERDIDO');
  const porMotivo = {};
  perdidos.forEach((c) => {
    const m = String(c.perdido_motivo || 'NÃO INFORMADO').toUpperCase();
    porMotivo[m] = (porMotivo[m] || 0) + 1;
  });
  const motivos = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
  const maxMotivo = Math.max(...motivos.map(([, n]) => n), 1);

  const motivosHTML = motivos.length
    ? motivos.map(([m, n]) => _anBarra(m, n, maxMotivo, 'bg-red-500')).join('')
    : _anVazio('Nenhum cliente marcado como perdido ainda.');

  const valorPerdido = perdidos.reduce((s, c) => s + getClienteValorEstimado(c.id), 0);

  return `
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        ${_anCard('Clientes', clientes.length, 'na base')}
        ${_anCard('Sem origem', naoInformado, `${_anPct(naoInformado, clientes.length)}% da base`, naoInformado > clientes.length / 2 ? 'text-red-400' : 'text-neutral-400')}
        ${_anCard('Perdidos', perdidos.length, `${_anPct(perdidos.length, clientes.length)}% da base`, 'text-red-400')}
        ${_anCard('Valor perdido', formatCurrency(valorPerdido), 'estimado pelas propostas', 'text-red-400')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        ${_anPainel('De onde vêm os clientes', `<div class="flex flex-col gap-3">${origensHTML}</div>
          ${naoInformado > 0 ? `<p class="text-[9px] text-neutral-700 font-medium mt-3">"Não informado" inclui os cadastros antigos, quando a origem era preenchida sozinha pelo sistema.</p>` : ''}`)}
        ${_anPainel('Por que perdemos', `<div class="flex flex-col gap-3">${motivosHTML}</div>`)}
      </div>
    </div>`;
}

// =======================================================================
// SUB-ABA: EQUIPE
// =======================================================================
function _analiseEquipeHTML() {
  const clientes = getDashboardScopedRows(state.clientes || []);
  const propostas = getDashboardScopedRows(state.propostas || []);
  const vendas = getDashboardScopedRows(state.vendas || []);

  const porVendedor = {};
  const linha = (email) => {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    if (!porVendedor[key]) porVendedor[key] = { email: key, clientes: 0, propostas: 0, vendas: 0, receita: 0, followups: 0 };
    return porVendedor[key];
  };

  clientes.forEach((c) => {
    const l = linha(c.vendedor_email);
    if (!l) return;
    l.clientes += 1;
    if (c.proxima_acao_em) l.followups += 1;
  });
  propostas.forEach((p) => { const l = linha(p.vendedor_email); if (l) l.propostas += 1; });
  vendas.forEach((v) => {
    const l = linha(v.vendedor_email);
    if (!l) return;
    l.vendas += 1;
    l.receita += Number(v.kit_price) || 0;
  });

  // Adoção do CRM = quantos clientes têm próximo passo marcado. É a métrica que
  // diz se o processo pegou: funil bonito com zero follow-up é memória, não CRM.
  const linhas = Object.values(porVendedor).sort((a, b) => b.receita - a.receita || b.propostas - a.propostas);

  if (linhas.length === 0) return _anPainel('Equipe', _anVazio('Nenhum vendedor com movimento no escopo atual.'));

  const totalFollowups = linhas.reduce((s, l) => s + l.followups, 0);
  const totalClientes = linhas.reduce((s, l) => s + l.clientes, 0);

  const tabela = `
    <div class="overflow-x-auto">
      <table class="w-full min-w-[620px]">
        <thead>
          <tr class="border-b border-neutral-800">
            ${['Vendedor', 'Clientes', 'Propostas', 'Vendas', 'Receita', 'Conversão', 'Meta do mês', 'Follow-ups'].map((h, i) => `
              <th class="text-${i === 0 ? 'left' : 'right'} text-[9px] font-black uppercase tracking-widest text-neutral-500 px-2 py-2">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${linhas.map((l) => {
            const conv = _anPct(l.vendas, l.propostas);
            const meta = typeof getMetaVendedor === 'function' ? getMetaVendedor(l.email) : 0;
            const receitaMes = getDashboardScopedRows(state.vendas || [])
              .filter((v) => String(v.vendedor_email || '').trim().toLowerCase() === l.email
                && toMonthKey(v.created_at) === metaMesAtualKey().slice(0, 7))
              .reduce((s, v) => s + (Number(v.kit_price) || 0), 0);
            const metaPct = meta > 0 ? _anPct(receitaMes, meta) : null;
            return `
              <tr class="border-b border-neutral-900 hover:bg-neutral-900/40 transition-colors">
                <td class="px-2 py-2.5 text-[11px] font-bold text-white truncate max-w-[140px]" title="${escapeHTML(l.email)}">${escapeHTML(l.email.split('@')[0])}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold text-neutral-400 num text-right">${l.clientes}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold text-orange-400 num text-right">${l.propostas}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold text-green-400 num text-right">${l.vendas}</td>
                <td class="px-2 py-2.5 text-[11px] font-black text-green-400 num text-right">${formatCurrency(l.receita)}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold num text-right ${conv >= 20 ? 'text-green-400' : 'text-neutral-500'}">${l.propostas > 0 ? `${conv}%` : '—'}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold num text-right ${metaPct === null ? 'text-neutral-700' : metaPct >= 100 ? 'text-green-400' : 'text-neutral-400'}">${metaPct === null ? '—' : `${metaPct}%`}</td>
                <td class="px-2 py-2.5 text-[11px] font-bold num text-right ${l.followups > 0 ? 'text-blue-400' : 'text-red-400/70'}">${l.followups}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  const adocao = _anPct(totalFollowups, totalClientes);

  return `
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        ${_anCard('Vendedores ativos', linhas.length, 'com movimento no escopo')}
        ${_anCard('Follow-ups agendados', totalFollowups, `${adocao}% da carteira`, totalFollowups === 0 ? 'text-red-400' : 'text-blue-400')}
        ${_anCard('Propostas', linhas.reduce((s, l) => s + l.propostas, 0), 'no escopo atual', 'text-orange-400')}
        ${_anCard('Vendas registradas', linhas.reduce((s, l) => s + l.vendas, 0), 'no escopo atual', 'text-green-400')}
      </div>
      ${totalFollowups === 0
        ? `<div class="border border-red-900/40 bg-red-950/10 p-3 flex items-start gap-2.5">
            <i data-lucide="alert-triangle" class="w-4 h-4 text-red-400 shrink-0 mt-0.5"></i>
            <p class="text-[11px] font-bold text-red-300">Ninguém tem follow-up agendado. Sem próximo passo marcado, o acompanhamento depende da memória de cada um — é onde o negócio esfria.</p>
          </div>`
        : ''}
      ${typeof renderMetasEquipeBlock === 'function' ? renderMetasEquipeBlock() : ''}
      ${_anPainel('Desempenho por vendedor', tabela)}
    </div>`;
}

// =======================================================================
// ROTEADOR DA ABA
// =======================================================================
function renderAnalise(container) {
  container.className = 'flex flex-col gap-4 w-full';

  const clientesScope = getDashboardScopedRows(state.clientes || []);
  const scopeSelector = typeof getDashboardScopeSelectorHTML === 'function'
    ? getDashboardScopeSelectorHTML([...(state.clientes || []), ...(state.vendas || [])])
    : '';

  const corpo = _analiseSub === 'origens' ? _analiseOrigensHTML()
    : _analiseSub === 'equipe' ? _analiseEquipeHTML()
    : _analiseConversaoHTML();

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-lg font-black text-white uppercase tracking-tight leading-none">Análise</h2>
        <p class="text-[10px] font-bold text-neutral-600 mt-1">${clientesScope.length} clientes no recorte atual</p>
      </div>
      <div class="flex items-center gap-2">${scopeSelector}</div>
    </div>

    <div class="flex gap-5 border-b border-neutral-800 overflow-x-auto no-scrollbar">
      ${ANALISE_SUBS.map((s) => `
        <button onclick="setAnaliseSub('${s.id}')"
          class="crm-subtab flex items-center gap-2 pb-2.5 text-[11px] font-black uppercase tracking-widest whitespace-nowrap ${s.id === _analiseSub ? 'is-active' : ''}">
          <i data-lucide="${s.icon}" class="w-3.5 h-3.5"></i>${s.label}
        </button>`).join('')}
    </div>

    ${corpo}`;

  // Histórico de status é lazy: só a Análise usa, e só na primeira visita.
  if (!_analiseHistoryCarregado && typeof fetchCrmStatusHistory === 'function') {
    _analiseHistoryCarregado = true;
    fetchCrmStatusHistory().then(() => {
      if (state.activeTab === 'analise') renderContent();
    });
  }

  lucide.createIcons();
}

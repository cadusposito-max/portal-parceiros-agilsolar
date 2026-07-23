// ==========================================
// CRM: FILA DO DIA — o loop de trabalho do vendedor
// ==========================================
// Problema que este arquivo resolve: a base mostrava 348 clientes, 681 propostas
// e ZERO follow-ups agendados — a plataforma dizia o que aconteceu, nunca o que
// fazer agora. A fila responde "quem eu atendo hoje?" a partir dos dados que já
// estão carregados (state.clientes/propostas/crmLastAtividade): nenhum fetch novo.
//
// Dois tipos de item convivem:
//   • REAL      → follow-up agendado pelo vendedor (clientes.proxima_acao_em)
//   • SUGERIDO  → derivado dos dados (proposta vista, sem resposta, lead frio…).
//     É o que faz a fila nascer cheia mesmo com ninguém tendo agendado nada.
//
// Depende de: config.js (CRM_AGING_LIMITS), clientes.js (normalizeClientStatus,
// buildClientWhatsappLink), crm.js (openCrm360, getClienteValorEstimado,
// crmTimeAgo), app.js (propostaStatus), utils.js (escapeHTML, showToast).

const FILA_PREVIEW = 8;          // itens mostrados antes do "ver todos"
const FILA_PROPOSTA_SEM_RESPOSTA_H = 48; // horas desde o envio sem o cliente abrir
const FILA_VISTA_QUENTE_D = 7;   // janela em que "cliente abriu" ainda é notícia
const FILA_NOVO_SEM_CONTATO_D = 3;

// prio menor = mais urgente. A ordem aqui É a ordem da fila.
const FILA_REGRAS = {
  followup_vencido:      { prio: 1, icon: 'alarm-clock',    tom: 'text-red-400',    borda: 'border-l-red-500',    label: 'FOLLOW-UP ATRASADO' },
  followup_hoje:         { prio: 2, icon: 'alarm-clock',    tom: 'text-yellow-300', borda: 'border-l-yellow-500', label: 'FOLLOW-UP DE HOJE' },
  proposta_vista:        { prio: 3, icon: 'flame',          tom: 'text-orange-400', borda: 'border-l-orange-500', label: 'ABRIU A PROPOSTA' },
  proposta_sem_resposta: { prio: 4, icon: 'send',           tom: 'text-blue-400',   borda: 'border-l-blue-500',   label: 'PROPOSTA SEM RESPOSTA' },
  novo_sem_contato:      { prio: 5, icon: 'user-plus',      tom: 'text-cyan-400',   borda: 'border-l-cyan-500',   label: 'LEAD NOVO SEM CONTATO' },
  parado:                { prio: 6, icon: 'snowflake',      tom: 'text-neutral-400',borda: 'border-l-neutral-600',label: 'PARADO' },
};

let _filaVerTodos = false;

// --- helpers de tempo ---------------------------------------------------
function _filaFimDeHoje() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function _filaInicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function _filaHorasDesde(dateValue) {
  const d = new Date(dateValue || 0);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 3600000;
}
function _filaDiasDesde(dateValue) {
  return _filaHorasDesde(dateValue) / 24;
}

// Agenda para daqui a N dias preservando a hora atual, mas dentro do horário
// comercial: follow-up que toca 23h da noite não é follow-up, é ruído.
function filaDataEm(dias) {
  const d = new Date();
  d.setDate(d.getDate() + Number(dias || 0));
  const h = d.getHours();
  if (h < 8 || h >= 19) d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// =======================================================================
// MOTOR: monta a fila a partir do estado já carregado
// =======================================================================
function buildFilaDoDia() {
  const clientes = getDashboardScopedRows(state.clientes || []);
  const propostas = state.propostas || [];
  const ultimas = state.crmLastAtividade || {};

  const fimHoje = _filaFimDeHoje();
  const inicioHoje = _filaInicioDeHoje();
  const agora = new Date();

  // Propostas por cliente (a mais recente primeiro — state.propostas vem desc)
  const propostasPorCliente = {};
  propostas.forEach((p) => {
    if (!p.cliente_id) return;
    if (!propostasPorCliente[p.cliente_id]) propostasPorCliente[p.cliente_id] = [];
    propostasPorCliente[p.cliente_id].push(p);
  });

  const itens = [];

  clientes.forEach((client) => {
    const status = normalizeClientStatus(client.status);
    // Ganho e perda saem do jogo: a fila é sobre negócio em aberto.
    if (status === 'FECHADO' || status === 'PERDIDO') return;

    const cliPropostas = propostasPorCliente[client.id] || [];
    const ultima = ultimas[client.id];
    const ultimaAtividadeEm = ultima ? ultima.last_at : null;

    const push = (tipo, detalhe) => itens.push({
      tipo,
      prio: FILA_REGRAS[tipo].prio,
      client,
      detalhe,
      valor: getClienteValorEstimado(client.id),
    });

    // ① / ② Follow-up agendado (item REAL — sempre ganha dos sugeridos)
    if (client.proxima_acao_em) {
      const quando = new Date(client.proxima_acao_em);
      if (!Number.isNaN(quando.getTime()) && quando <= fimHoje) {
        const nota = client.proxima_acao_nota || 'Follow-up agendado';
        if (quando < inicioHoje) {
          const dias = Math.max(1, Math.floor(_filaDiasDesde(client.proxima_acao_em)));
          push('followup_vencido', `${nota} · venceu há ${dias}d`);
        } else {
          const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          push('followup_hoje', `${nota} · ${hora}`);
        }
        return; // um item por cliente: o agendado manda
      }
    }

    // ③ Cliente abriu a proposta — sinal mais quente que existe no funil
    const vista = cliPropostas.find((p) => p.vista_em && _filaDiasDesde(p.vista_em) <= FILA_VISTA_QUENTE_D);
    if (vista) {
      const vezes = Number(vista.vista_count) || 1;
      push('proposta_vista', `Abriu ${crmTimeAgo(vista.vista_em)}${vezes > 1 ? ` · ${vezes}x` : ''} — ligue agora`);
      return;
    }

    // ④ Proposta enviada e o cliente nem abriu
    const semResposta = cliPropostas.find((p) => (
      propostaStatus(p) === 'ENVIADA'
      && p.enviada_em
      && !p.vista_em
      && _filaHorasDesde(p.enviada_em) >= FILA_PROPOSTA_SEM_RESPOSTA_H
    ));
    if (semResposta) {
      push('proposta_sem_resposta', `Enviada ${crmTimeAgo(semResposta.enviada_em)} · sem abrir`);
      return;
    }

    // ⑤ Lead novo que ninguém tocou
    if (status === 'NOVO' && !ultimaAtividadeEm && _filaDiasDesde(client.created_at) >= FILA_NOVO_SEM_CONTATO_D) {
      push('novo_sem_contato', `Cadastrado ${crmTimeAgo(client.created_at)} · nenhum contato`);
      return;
    }

    // ⑥ Parado além do limite do status (mesma régua do aging do dashboard)
    const regra = CRM_AGING_LIMITS.find((r) => r.status === status);
    if (regra) {
      // Conta a partir da última atividade real; sem atividade, do cadastro.
      const refIso = ultimaAtividadeEm || client.created_at;
      const dias = Math.floor(_filaDiasDesde(refIso));
      if (dias > regra.limit) {
        // "EM NEGOCIAÇÃO" já carrega a preposição — sem isso sai "em em negociação".
        const rotulo = status.toLowerCase().replace(/^em /, '');
        push('parado', `${dias} dias em ${rotulo} sem avanço`);
      }
    }
  });

  itens.sort((a, b) => (a.prio - b.prio) || (b.valor - a.valor));
  return itens;
}

// =======================================================================
// RENDER — bloco no topo da VISÃO GERAL
// =======================================================================
function filaToggleVerTodos() {
  _filaVerTodos = !_filaVerTodos;
  renderContent();
}

function _filaItemHTML(item) {
  const regra = FILA_REGRAS[item.tipo];
  const c = item.client;
  const wa = buildClientWhatsappLink(c);
  const mostraVendedor = (state.isAdmin || (state.isGestor && state.gestorViewAll)) && c.vendedor_email;

  return `
    <article class="flex items-center gap-3 bg-[#0d0d0f] border border-neutral-800 border-l-2 ${regra.borda} p-2.5 hover:border-orange-500/40 transition-all">
      <i data-lucide="${regra.icon}" class="w-4 h-4 shrink-0 ${regra.tom}"></i>
      <div class="min-w-0 flex-1 cursor-pointer" onclick="openCrm360('${c.id}')">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-white font-black text-xs uppercase truncate">${escapeHTML(c.nome || 'CLIENTE')}</span>
          ${item.valor > 0 ? `<span class="shrink-0 text-[10px] font-black text-green-400/90 num">${formatCurrency(item.valor)}</span>` : ''}
        </div>
        <div class="flex flex-wrap items-center gap-x-2 text-[9px] font-bold mt-0.5">
          <span class="${regra.tom} uppercase tracking-widest">${regra.label}</span>
          <span class="text-neutral-500 truncate">${escapeHTML(item.detalhe)}</span>
          ${mostraVendedor ? `<span class="text-purple-400/70">${escapeHTML(String(c.vendedor_email).split('@')[0])}</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener noreferrer" title="WhatsApp" class="btn btn-primary btn-icon"><i data-lucide="message-circle"></i></a>` : ''}
        <button onclick="filaConcluir('${c.id}')" title="Registrar contato" class="btn btn-success btn-icon"><i data-lucide="check"></i></button>
        <button onclick="filaAdiar('${c.id}', 1)" title="Adiar 1 dia" class="btn btn-ghost btn-icon"><i data-lucide="clock"></i></button>
      </div>
    </article>`;
}

function renderFilaDoDiaBlock() {
  const itens = buildFilaDoDia();

  if (itens.length === 0) {
    return `
      <div class="stagger-1 border border-neutral-800/60 bg-[#080808] p-5 flex items-center gap-3">
        <div class="bg-green-500/10 border border-green-500/30 p-2"><i data-lucide="check-check" class="w-4 h-4 text-green-400"></i></div>
        <div>
          <p class="text-white font-black text-xs uppercase tracking-widest">Fila limpa</p>
          <p class="text-neutral-500 text-[11px] font-medium mt-0.5">Nenhum cliente cobrando atenção agora. Bom momento para prospectar.</p>
        </div>
      </div>`;
  }

  const atrasados = itens.filter((i) => i.tipo === 'followup_vencido').length;
  const quentes = itens.filter((i) => i.tipo === 'proposta_vista').length;
  const visiveis = _filaVerTodos ? itens : itens.slice(0, FILA_PREVIEW);
  const restantes = itens.length - visiveis.length;

  const resumo = [];
  if (atrasados > 0) resumo.push(`<span class="text-red-400">${atrasados} atrasado${atrasados > 1 ? 's' : ''}</span>`);
  if (quentes > 0) resumo.push(`<span class="text-orange-400">${quentes} abriu a proposta</span>`);

  return `
    <div class="stagger-1 border border-neutral-800/60 bg-[#080808]">
      <div class="px-4 py-3 border-b border-neutral-800/60 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="bg-orange-500/10 border border-orange-500/30 p-2"><i data-lucide="list-checks" class="w-4 h-4 text-orange-400"></i></div>
          <div>
            <p class="text-white font-black text-xs uppercase tracking-widest">Para hoje</p>
            <p class="text-[10px] font-bold text-neutral-500 mt-0.5">
              ${itens.length} cliente${itens.length > 1 ? 's' : ''} esperando você${resumo.length ? ' · ' + resumo.join(' · ') : ''}
            </p>
          </div>
        </div>
        <span class="text-3xl font-black text-orange-400 num leading-none">${itens.length}</span>
      </div>
      <div class="p-3 flex flex-col gap-2">
        ${visiveis.map(_filaItemHTML).join('')}
        ${restantes > 0
          ? `<button onclick="filaToggleVerTodos()" class="btn btn-ghost btn-sm btn-block"><i data-lucide="chevrons-down"></i> Ver os outros ${restantes}</button>`
          : (_filaVerTodos && itens.length > FILA_PREVIEW
            ? `<button onclick="filaToggleVerTodos()" class="btn btn-ghost btn-sm btn-block"><i data-lucide="chevrons-up"></i> Mostrar menos</button>`
            : '')}
      </div>
    </div>`;
}

// Aviso de entrada (toast pós-login): desativado a pedido do usuário — reaparecia
// a cada refresh (a restauração de sessão em auth.js chama esta função) e virou ruído.
// Mantido como no-op para não quebrar as chamadas em auth.js; a Fila do Dia dentro
// do painel Comercial continua intacta.
function filaAvisoPosLogin() {
  return;
}

// =======================================================================
// AÇÕES — concluir (registra contato + agenda o próximo) e adiar
// =======================================================================
async function filaAdiar(clientId, dias) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) return;

  const novoIso = filaDataEm(dias);
  const anteriorEm = client.proxima_acao_em;
  const anteriorNota = client.proxima_acao_nota;
  const nota = client.proxima_acao_nota || 'Follow-up adiado';

  client.proxima_acao_em = novoIso;
  client.proxima_acao_nota = nota;
  renderContent();

  const { error } = await supabaseClient.from('clientes')
    .update({ proxima_acao_em: novoIso, proxima_acao_nota: nota })
    .eq('id', clientId);

  if (error) {
    console.error('[fila] Falha ao adiar.', error);
    client.proxima_acao_em = anteriorEm;
    client.proxima_acao_nota = anteriorNota;
    renderContent();
    showToast('Erro ao adiar. Tente novamente.');
    return;
  }
  showToast(`ADIADO PARA ${new Date(novoIso).toLocaleDateString('pt-BR')}`);
}

// Modal de conclusão. O passo que fecha o loop não é registrar o contato feito —
// é sair com o PRÓXIMO agendado. Por isso o próximo passo vem no mesmo modal,
// pré-selecionado em +3 dias, e não numa tela separada que ninguém abre.
function filaConcluir(clientId) {
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!client) return;

  const existing = document.getElementById('fila-concluir-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'fila-concluir-overlay';
  overlay.className = 'fixed inset-0 z-[96] flex items-center justify-center bg-black/90 backdrop-blur-md p-4';
  overlay.innerHTML = `
    <div class="bg-neutral-900 border-2 border-green-600/50 w-full max-w-md shadow-[0_0_50px_rgba(34,197,94,0.2)] animate-fade-in-up">
      <div class="flex justify-between items-center p-5 border-b border-neutral-800 bg-black/50">
        <div>
          <p class="text-[9px] text-green-500 font-black uppercase tracking-widest">Registrar contato</p>
          <h2 class="text-sm font-black text-white uppercase tracking-tighter truncate">${escapeHTML(client.nome || 'CLIENTE')}</h2>
        </div>
        <button type="button" onclick="document.getElementById('fila-concluir-overlay').remove()" class="text-neutral-500 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-6 h-6"></i></button>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <p class="text-[10px] text-orange-500/80 font-black uppercase tracking-widest mb-1.5">O que você fez?</p>
          <div class="grid grid-cols-4 gap-1.5" id="fila-tipo-group">
            ${[
              { v: 'ligacao', l: 'Ligação', i: 'phone' },
              { v: 'whatsapp', l: 'WhatsApp', i: 'message-circle' },
              { v: 'visita', l: 'Visita', i: 'map-pin' },
              { v: 'nota', l: 'Nota', i: 'sticky-note' },
            ].map((t, idx) => `
              <button type="button" data-tipo="${t.v}" onclick="_filaSelTipo('${t.v}')"
                class="fila-tipo-btn flex flex-col items-center gap-1 py-2.5 border text-[9px] font-black uppercase tracking-widest transition-all ${idx === 0 ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}">
                <i data-lucide="${t.i}" class="w-3.5 h-3.5"></i>${t.l}
              </button>`).join('')}
          </div>
        </div>
        <div>
          <p class="text-[10px] text-orange-500/80 font-black uppercase tracking-widest mb-1.5">Como foi? <span class="text-neutral-600">(opcional)</span></p>
          <textarea id="fila-descricao" rows="2" placeholder="Ex: pediu para retornar depois do dia 20"
            class="w-full bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2 text-white text-xs transition-all"></textarea>
        </div>
        <div class="border-t border-neutral-800 pt-4">
          <p class="text-[10px] text-orange-500/80 font-black uppercase tracking-widest mb-1.5">E o próximo passo?</p>
          <div class="grid grid-cols-4 gap-1.5 mb-2" id="fila-prox-group">
            ${[
              { v: '1', l: 'Amanhã' },
              { v: '3', l: 'Em 3 dias' },
              { v: '7', l: 'Em 7 dias' },
              { v: '0', l: 'Nenhum' },
            ].map((p) => `
              <button type="button" data-prox="${p.v}" onclick="_filaSelProx('${p.v}')"
                class="fila-prox-btn py-2 border text-[9px] font-black uppercase tracking-widest transition-all ${p.v === '3' ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}">${p.l}</button>`).join('')}
          </div>
          <input id="fila-prox-nota" placeholder="O que fazer no próximo contato?"
            class="w-full bg-black border border-neutral-700 focus:border-orange-500 px-3 py-2 text-white text-xs transition-all">
        </div>
        <p id="fila-erro" class="hidden text-red-500 text-xs font-bold bg-red-500/10 border border-red-500/20 p-2.5"></p>
        <button type="button" id="fila-salvar" onclick="_filaConcluirSubmit('${client.id}')" class="btn btn-success btn-lg btn-block">
          <i data-lucide="check"></i> Salvar e seguir
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.dataset.tipo = 'ligacao';
  overlay.dataset.prox = '3';
  lucide.createIcons();
  setTimeout(() => document.getElementById('fila-descricao')?.focus(), 50);
}

function _filaSelTipo(tipo) {
  const overlay = document.getElementById('fila-concluir-overlay');
  if (!overlay) return;
  overlay.dataset.tipo = tipo;
  overlay.querySelectorAll('.fila-tipo-btn').forEach((btn) => {
    const on = btn.dataset.tipo === tipo;
    btn.className = `fila-tipo-btn flex flex-col items-center gap-1 py-2.5 border text-[9px] font-black uppercase tracking-widest transition-all ${on ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`;
  });
  lucide.createIcons();
}

function _filaSelProx(dias) {
  const overlay = document.getElementById('fila-concluir-overlay');
  if (!overlay) return;
  overlay.dataset.prox = dias;
  overlay.querySelectorAll('.fila-prox-btn').forEach((btn) => {
    const on = btn.dataset.prox === dias;
    btn.className = `fila-prox-btn py-2 border text-[9px] font-black uppercase tracking-widest transition-all ${on ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`;
  });
  const notaEl = document.getElementById('fila-prox-nota');
  if (notaEl) notaEl.disabled = dias === '0';
}

async function _filaConcluirSubmit(clientId) {
  const overlay = document.getElementById('fila-concluir-overlay');
  const client = (state.clientes || []).find((c) => c.id === clientId);
  if (!overlay || !client) return;

  const btn = document.getElementById('fila-salvar');
  const errEl = document.getElementById('fila-erro');
  const tipo = overlay.dataset.tipo || 'nota';
  const proxDias = Number(overlay.dataset.prox || '0');
  const descricao = (document.getElementById('fila-descricao')?.value || '').trim();
  const proxNota = (document.getElementById('fila-prox-nota')?.value || '').trim();

  errEl.classList.add('hidden');
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> SALVANDO...';
  lucide.createIcons();

  try {
    // 1) O contato vira atividade na timeline (é o histórico de conclusão:
    //    por isso não precisamos de tabela de tarefas para saber o que foi feito).
    const { error: ativError } = await supabaseClient.from('crm_atividades').insert([{
      cliente_id: client.id,
      franquia_id: client.franquia_id || state.franquiaId,
      autor_email: state.currentUser.email,
      tipo,
      descricao: descricao || null,
      meta: { origem: 'fila_do_dia', followup_concluido: true },
    }]);
    if (ativError) throw new Error(ativError.message || 'Falha ao registrar a atividade.');

    // 2) O próximo passo (ou o encerramento do ciclo aberto)
    const proximaEm = proxDias > 0 ? filaDataEm(proxDias) : null;
    const proximaNota = proxDias > 0 ? (proxNota || 'Follow-up') : null;
    const { error: cliError } = await supabaseClient.from('clientes')
      .update({ proxima_acao_em: proximaEm, proxima_acao_nota: proximaNota })
      .eq('id', client.id);
    if (cliError) throw new Error(cliError.message || 'Falha ao agendar o próximo passo.');

    client.proxima_acao_em = proximaEm;
    client.proxima_acao_nota = proximaNota;

    // Última atividade local: some da fila sem precisar de refetch.
    state.crmLastAtividade = state.crmLastAtividade || {};
    state.crmLastAtividade[client.id] = { cliente_id: client.id, last_at: new Date().toISOString(), last_tipo: tipo };

    overlay.remove();
    showToast(proximaEm
      ? `REGISTRADO · PRÓXIMO EM ${new Date(proximaEm).toLocaleDateString('pt-BR')}`
      : 'CONTATO REGISTRADO');
    renderContent();
    if (typeof _crm360ClientId !== 'undefined' && _crm360ClientId === client.id) renderCrm360();
  } catch (err) {
    console.error('[fila] Falha ao concluir.', err);
    errEl.innerText = err.message || 'Erro ao salvar. Tente novamente.';
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    lucide.createIcons();
  }
}

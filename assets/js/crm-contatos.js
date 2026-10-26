// ==========================================
// CRM: CONTATOS DO CLIENTE — faixa na ficha + selo no funil
// ==========================================
// Contato = atividade da timeline do tipo ligacao, whatsapp ou visita (nota
// não conta), com meta.resultado ('falou' | 'nao_atendeu' | 'pediu_retorno')
// e meta.proximo (quando ficou o próximo contato). Registrar pela faixa ou pela
// caixa da timeline grava a mesma atividade: a timeline continua com tudo.
//
// A faixa lê direto a timeline da ficha (_crm360Atividades). O selo do funil lê
// o resumo que o banco mantém em clientes.contatos_qtd / contato_ultimo_*
// (migration 20261026150000_contatos_cliente) — sem ela o selo só não aparece.
//
// Computador: uma linha (bolinhas pequenas + resumo) que abre ao clicar.
// Celular: duas linhas, abre numa lista curta e o registro sobe numa gaveta.
// O botão de WhatsApp do card não conta como contato (vendedor não usa).
//
// Depende de: crm.js (_crm360Atividades, _crm360Client, crmFetchAtividades,
// renderCrm360, crmSetClientStatus), clientes.js (normalizeClientStatus),
// utils.js (escapeHTML, showToast).

(function () {
  const TIPOS = ['ligacao', 'whatsapp', 'visita'];
  const CANAL = { ligacao: ['Ligação', 'phone'], whatsapp: ['WhatsApp', 'message-circle'], visita: ['Visita', 'map-pin'] };
  const RES = {
    falou: ['Falou com o cliente', 'Falou'],
    nao_atendeu: ['Não atendeu', 'Não atendeu'],
    pediu_retorno: ['Pediu pra retornar', 'Pediu retorno'],
  };
  // próximo contato sugerido pelo resultado
  const PROX_SUG = { falou: 'd2', nao_atendeu: 'amanha', pediu_retorno: 'd2' };
  // selo do funil só nas etapas em aberto
  const ABERTOS = ['NOVO', 'PROPOSTA ENVIADA', 'EM NEGOCIAÇÃO'];
  const SEM_RESPOSTA_ALERTA = 4;

  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const ord = (n) => `${n}º`;
  const fmt = (d) => {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    return `${x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const cliente = () => (has('_crm360Client') ? _crm360Client() : null);

  // estado da faixa (vale para a ficha aberta)
  let fichaDe = null;
  let aberto = false;
  let reg = null;          // { canal, res, prox, obs } enquanto registra pela faixa
  let salvando = false;
  const alertaIgnorado = new Set();
  // caixa da timeline
  const comp = { res: null, prox: null };

  function syncFicha(client) {
    const id = client ? String(client.id) : null;
    if (id !== fichaDe) { fichaDe = id; aberto = false; reg = null; }
  }

  // Opções de próximo contato. Domingo pula para segunda.
  function proxOpcoes() {
    const em = (dias, h) => {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      d.setHours(h, 0, 0, 0);
      return d;
    };
    const ops = [];
    if (new Date().getHours() < 16 && new Date().getDay() !== 0) ops.push(['hoje', 'Hoje 17h', em(0, 17)]);
    ops.push(['amanha', 'Amanhã 9h', em(1, 9)], ['d2', 'Em 2 dias', em(2, 9)], ['d7', 'Em 1 semana', em(7, 9)], ['nenhum', 'Sem data', null]);
    return ops;
  }

  // contatos do cliente aberto, do mais antigo ao mais novo
  function contatosDaFicha() {
    const lista = (typeof _crm360Atividades !== 'undefined' && Array.isArray(_crm360Atividades)) ? _crm360Atividades : [];
    return lista.filter((a) => TIPOS.includes(a.tipo))
      .slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  const resDe = (a) => (a && a.meta && RES[a.meta.resultado] ? a.meta.resultado : '');

  // ---------- faixa ----------
  function bolinha(a, i, n, extra = '') {
    if (a) {
      const r = resDe(a);
      const tit = `${ord(i + 1)} contato · ${fmt(a.created_at)} · ${CANAL[a.tipo][0]}${r ? ' · ' + RES[r][0] : ''}`;
      return `<span class="v2c-dot ${r || 'sr'} ${extra}" title="${esc(tit)}">${ic(CANAL[a.tipo][1])}</span>`;
    }
    return `<span class="v2c-dot ${i === n ? 'prox' : 'fut'} ${extra}">${i + 1}</span>`;
  }

  function faixaHTML(client) {
    if (!client) return '';
    syncFicha(client);
    const lista = contatosDaFicha();
    const n = lista.length;
    const ult = lista[n - 1];
    const prox = client.proxima_acao_em ? new Date(client.proxima_acao_em) : null;
    const late = Boolean(prox && prox < new Date());
    const proxTx = prox ? `${fmt(prox)}${late ? ' (atrasado)' : ''}` : 'sem data';
    const resumo = n === 0
      ? `<b>Nenhum contato ainda</b> · faça o 1º contato`
      : `<b>${ord(n)} contato</b> · ${esc(resDe(ult) ? RES[resDe(ult)][0] : CANAL[ult.tipo][0])} · próximo: <span class="${late ? 'late' : ''}">${esc(proxTx)}</span>`;

    // bolinhas pequenas (linha fechada): no celular só os 3 últimos + o próximo
    const total = Math.max(5, n + 1);
    let mini = '';
    for (let i = 0; i < total; i++) {
      const cls = `${i > n ? 'fut' : ''} ${i < n - 3 ? 'velho' : ''}`;
      if (i) mini += `<span class="v2c-lk ${i > n ? 'fut' : ''} ${i <= n - 3 ? 'velho' : ''}"></span>`;
      mini += bolinha(lista[i], i, n, cls);
    }

    // aberta no computador: trilha com detalhes
    let trilha = '';
    for (let i = 0; i < total; i++) {
      const a = lista[i];
      if (a) {
        const r = resDe(a);
        trilha += `<div class="v2c-pt feito ${r || 'sr'}">${bolinha(a, i, n)}
          <b>${ord(i + 1)} contato</b><small>${esc(fmt(a.created_at))} · ${CANAL[a.tipo][0]}</small>
          ${r ? `<span class="v2c-tag ${r}">${RES[r][1]}</span>` : '<span class="v2c-tag sr">Sem resultado</span>'}
          ${a.descricao ? `<em title="${esc(a.descricao)}">“${esc(a.descricao)}”</em>` : ''}</div>`;
      } else if (i === n) {
        trilha += `<div class="v2c-pt prox">${bolinha(null, i, n)}<b>${ord(i + 1)} contato</b><small>próximo</small>
          <span class="v2c-tag prox ${late ? 'late' : ''}">${prox ? esc(fmt(prox)) : 'sem data'}</span></div>`;
      } else {
        trilha += `<div class="v2c-pt fut">${bolinha(null, i, n)}<b>${ord(i + 1)}</b></div>`;
      }
    }

    // aberta no celular: lista curta, uma linha por contato
    let curta = lista.map((a, i) => {
      const r = resDe(a);
      return `<div class="v2c-li">${bolinha(a, i, n)}<div><b>${ord(i + 1)} · ${CANAL[a.tipo][0]}${r ? `<span class="v2c-tag ${r}">${RES[r][1]}</span>` : ''}</b>
        <small>${esc(fmt(a.created_at))}${a.descricao ? ` · “${esc(a.descricao)}”` : ''}</small></div></div>`;
    }).join('');
    curta += `<div class="v2c-li">${bolinha(null, n, n)}<div><b>${ord(n + 1)} · próximo</b><small class="${late ? 'late' : ''}">${esc(proxTx)}</small></div></div>`;

    // N "não atendeu" seguidos: sugere marcar como perdido
    let seguidos = 0;
    for (let i = n - 1; i >= 0 && resDe(lista[i]) === 'nao_atendeu'; i--) seguidos++;
    const status = has('normalizeClientStatus') ? normalizeClientStatus(client.status) : client.status;
    const alerta = seguidos >= SEM_RESPOSTA_ALERTA && status !== 'PERDIDO' && !alertaIgnorado.has(String(client.id))
      ? `<div class="v2c-alerta"><span>${seguidos} contatos seguidos sem resposta. Marcar como Perdido (sem retorno)?</span>
          <button type="button" class="v2c-b red" onclick="crmSetClientStatus('${esc(client.id)}','PERDIDO')">Marcar Perdido</button>
          <button type="button" class="v2c-b gh" onclick="crmContatos.ignorarAlerta()">Continuar tentando</button></div>`
      : '';

    return `<div class="v2c ${aberto ? 'aberto' : ''}" id="v2c-faixa">
      <div class="v2c-top" role="button" tabindex="0" onclick="crmContatos.alternar(event)" onkeydown="if(event.key==='Enter')crmContatos.alternar(event)" title="${aberto ? 'Recolher' : 'Ver os contatos'}">
        <h4>${ic('phone-call')}Contatos</h4>
        <div class="v2c-mini">${mini}</div>
        <div class="v2c-resumo">${resumo}</div>
        <span class="v2c-chev">${ic('chevron-down')}</span>
        ${reg ? '' : `<button type="button" class="v2c-reg" onclick="event.stopPropagation(); crmContatos.registrar()">${ic('plus')}<span class="dsk">Registrar ${ord(n + 1)} contato</span><span class="mob">Registrar</span></button>`}
      </div>
      <div class="v2c-trilha">${trilha}</div>
      <div class="v2c-lista">${curta}</div>
      ${alerta}
      ${reg ? formHTML(n) : ''}
    </div>`;
  }

  function formHTML(n) {
    const ops = proxOpcoes();
    return `<div class="v2c-fundo" onclick="crmContatos.cancelar()"></div>
      <div class="v2c-form">
        <div class="tit">${ic('plus-circle')}Registrar ${ord(n + 1)} contato</div>
        <div class="v2c-row"><small>Como foi</small><div>
          ${TIPOS.map((t) => `<button type="button" class="v2c-op cn ${reg.canal === t ? 'on' : ''}" onclick="crmContatos.set('canal','${t}')">${ic(CANAL[t][1])}${CANAL[t][0]}</button>`).join('')}
        </div></div>
        <div class="v2c-row"><small>Resultado</small><div>
          ${Object.keys(RES).map((r) => `<button type="button" class="v2c-op ${r} ${reg.res === r ? 'on' : ''}" onclick="crmContatos.set('res','${r}')"><i class="pt"></i><span class="dsk">${RES[r][0]}</span><span class="mob">${RES[r][1]}</span></button>`).join('')}
        </div></div>
        <div class="v2c-row"><small>Próximo contato</small><div>
          ${ops.map(([k, l]) => `<button type="button" class="v2c-op q ${reg.prox === k ? 'on' : ''}" onclick="crmContatos.set('prox','${k}')">${l}</button>`).join('')}
        </div></div>
        <div class="v2c-fim">
          <input id="v2c-obs" maxlength="500" placeholder="Observação (opcional)" value="${esc(reg.obs || '')}" onkeydown="if(event.key==='Enter'){event.preventDefault();crmContatos.salvarFaixa();}">
          <button type="button" class="v2c-b gh" onclick="crmContatos.cancelar()">Cancelar</button>
          <button type="button" class="v2c-b pri" id="v2c-salvar" onclick="crmContatos.salvarFaixa()">${ic('check')}Salvar</button>
        </div>
      </div>`;
  }

  // redesenha só a faixa (não perde o que está digitado na timeline)
  function repintar() {
    const el = document.getElementById('v2c-faixa');
    const client = cliente();
    if (!el || !client) return;
    el.outerHTML = faixaHTML(client);
    if (window.lucide) window.lucide.createIcons();
    if (reg) {
      const obs = document.getElementById('v2c-obs');
      if (obs && !window.matchMedia('(max-width: 760px)').matches) obs.focus({ preventScroll: true });
    }
  }
  const guardarObs = () => { const o = document.getElementById('v2c-obs'); if (o && reg) reg.obs = o.value; };

  // ---------- gravação (faixa e timeline) ----------
  async function gravar(client, { canal, res, prox, obs, meta }) {
    const n = contatosDaFicha().length;
    const op = proxOpcoes().find((o) => o[0] === prox);
    const proxEm = op ? op[2] : null;
    const { error } = await supabaseClient.from('crm_atividades').insert([{
      cliente_id: client.id,
      franquia_id: client.franquia_id || state.franquiaId,
      autor_email: state.currentUser?.email || 'sistema',
      tipo: canal,
      descricao: obs || null,
      meta: { ...(meta || {}), contato: true, resultado: res, proximo: proxEm ? proxEm.toISOString() : null },
    }]);
    if (error) throw new Error(error.message || 'Falha ao registrar o contato.');

    // próximo contato vira a próxima ação do cliente ("Sem data" limpa)
    if (op) {
      const nota = proxEm ? `${ord(n + 2)} contato` : null;
      const { error: e2 } = await supabaseClient.from('clientes')
        .update({ proxima_acao_em: proxEm ? proxEm.toISOString() : null, proxima_acao_nota: nota })
        .eq('id', client.id);
      if (e2) console.warn('[contatos] próxima ação', e2);
      else { client.proxima_acao_em = proxEm ? proxEm.toISOString() : null; client.proxima_acao_nota = nota; }
    }

    // resumo local (o banco recalcula igual pelo gatilho): selo do funil já atualiza
    client.contatos_qtd = n + 1;
    client.contato_ultimo_em = new Date().toISOString();
    client.contato_ultimo_resultado = res;
    state.crmLastAtividade = state.crmLastAtividade || {};
    state.crmLastAtividade[client.id] = { cliente_id: client.id, last_at: new Date().toISOString(), last_tipo: canal };
    return { n: n + 1, proxEm };
  }

  function toastFeito(n, proxEm, extra) {
    if (!has('showToast')) return;
    showToast(`${ord(n)} contato registrado${proxEm ? ` · próximo ${fmt(proxEm)}` : ''}${extra || ''}`);
  }

  window.crmContatosFaixaHTML = faixaHTML;

  window.crmContatos = {
    alternar(ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest('.v2c-reg')) return;
      guardarObs();
      aberto = !aberto;
      if (!aberto) reg = null;
      repintar();
    },
    registrar() {
      aberto = true;
      reg = { canal: 'ligacao', res: null, prox: null, obs: '' };
      repintar();
    },
    cancelar() { reg = null; repintar(); },
    set(campo, valor) {
      if (!reg) return;
      guardarObs();
      reg[campo] = valor;
      if (campo === 'res') reg.prox = PROX_SUG[valor];
      repintar();
    },
    ignorarAlerta() { if (fichaDe) alertaIgnorado.add(fichaDe); repintar(); },
    async salvarFaixa() {
      const client = cliente();
      if (!client || !reg || salvando) return;
      guardarObs();
      if (!reg.res) { if (has('showToast')) showToast('Escolha o resultado: falou, não atendeu ou pediu pra retornar.'); return; }
      salvando = true;
      const btn = document.getElementById('v2c-salvar');
      if (btn) btn.disabled = true;
      try {
        const r = await gravar(client, { canal: reg.canal, res: reg.res, prox: reg.prox, obs: (reg.obs || '').trim() });
        reg = null;
        toastFeito(r.n, r.proxEm);
        if (has('crmFetchAtividades')) await crmFetchAtividades(client.id);
        if (has('renderContent')) renderContent();
      } catch (err) {
        console.error('[contatos] salvar', err);
        if (has('showToast')) showToast('Erro ao registrar o contato.');
        if (btn) btn.disabled = false;
      } finally {
        salvando = false;
      }
    },

    // ---------- caixa da timeline (crm.js) ----------
    ehContato: (tipo) => TIPOS.includes(tipo),
    resetComposer() { comp.res = null; comp.prox = null; },
    composerHTML(tipo) {
      if (!TIPOS.includes(tipo)) return '';
      const n = contatosDaFicha().length;
      return `<div class="v2c-comp">
        <div class="v2c-row"><small>Resultado</small><div>
          ${Object.keys(RES).map((r) => `<button type="button" data-res="${r}" class="v2c-op ${r} ${comp.res === r ? 'on' : ''}" onclick="crmContatos.compSet('res','${r}')"><i class="pt"></i>${RES[r][0]}</button>`).join('')}
        </div></div>
        <div class="v2c-row"><small>Próximo contato</small><div>
          ${proxOpcoes().map(([k, l]) => `<button type="button" data-prox="${k}" class="v2c-op q ${comp.prox === k ? 'on' : ''}" onclick="crmContatos.compSet('prox','${k}')">${l}</button>`).join('')}
        </div></div>
        <p class="v2c-dica">Conta como ${ord(n + 1)} contato e entra na faixa Contatos lá em cima. Nota não conta.</p>
      </div>`;
    },
    // troca só as classes (redesenhar a ficha apagaria o texto digitado)
    compSet(campo, valor) {
      comp[campo] = valor;
      if (campo === 'res') comp.prox = PROX_SUG[valor];
      document.querySelectorAll('.v2c-comp [data-res]').forEach((b) => b.classList.toggle('on', b.dataset.res === comp.res));
      document.querySelectorAll('.v2c-comp [data-prox]').forEach((b) => b.classList.toggle('on', b.dataset.prox === comp.prox));
    },
    async submitComposer(client, input, tipo) {
      if (salvando) return;
      if (!comp.res) { if (has('showToast')) showToast('Escolha o resultado: falou, não atendeu ou pediu pra retornar.'); return; }
      const texto = input.value.trim();
      // @menções (crm-mencao.js) também valem na observação do contato
      const mencao = texto && has('crmMencaoColher') ? crmMencaoColher(client.id, texto) : null;
      salvando = true;
      try {
        const r = await gravar(client, { canal: tipo, res: comp.res, prox: comp.prox, obs: texto, meta: mencao || undefined });
        input.value = '';
        if (has('crmMencaoLimpar')) crmMencaoLimpar(client.id);
        comp.res = null; comp.prox = null;
        const avisados = mencao ? ` · ${mencao.mencionados_nomes.map((x) => x.split(' ')[0]).join(', ')} vai receber o aviso` : '';
        toastFeito(r.n, r.proxEm, avisados);
        if (has('crmFetchAtividades')) await crmFetchAtividades(client.id);
        if (has('renderContent')) renderContent();
      } catch (err) {
        console.error('[contatos] timeline', err);
        if (has('showToast')) showToast('Erro ao registrar o contato.');
      } finally {
        salvando = false;
      }
    },

    // texto do contato na timeline: "3º contato · Ligação · Não atendeu — obs · próximo 27/10 09:00"
    textoTimeline(ev) {
      if (!ev || !TIPOS.includes(ev.tipo)) return null;
      const lista = contatosDaFicha();
      const i = ev.id ? lista.findIndex((a) => a.id === ev.id) : -1;
      const r = ev.meta && RES[ev.meta.resultado] ? RES[ev.meta.resultado][0] : '';
      const partes = [`${i >= 0 ? ord(i + 1) + ' contato' : 'Contato'} · ${CANAL[ev.tipo][0]}${r ? ' · ' + r : ''}`];
      if (ev.descricao) partes.push(` — ${ev.descricao}`);
      if (ev.meta && ev.meta.proximo) partes.push(` · próximo ${fmt(ev.meta.proximo)}`);
      return partes.join('');
    },

    // ---------- selo do funil ----------
    seloHTML(c) {
      const n = Number(c && c.contatos_qtd) || 0;
      if (!n) return '';
      const st = has('normalizeClientStatus') ? normalizeClientStatus(c.status) : c.status;
      if (!ABERTOS.includes(st)) return '';
      const r = RES[c.contato_ultimo_resultado] ? c.contato_ultimo_resultado : 'sr';
      const tit = `${ord(n)} contato${r !== 'sr' ? ' · último: ' + RES[r][0] : ''}${c.contato_ultimo_em ? ' · ' + fmt(c.contato_ultimo_em) : ''}`;
      return `<span class="v2-kcont ${r}" title="${esc(tit)}">${ic('phone-call')}${ord(n)} contato</span>`;
    },
  };
})();

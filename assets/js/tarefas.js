// ==========================================
// TAREFAS INTERNAS: ícone próprio no topo (ao lado do sininho)
// ==========================================
// Painel lateral com "Para mim" (Atrasadas / Hoje / Próximos dias) e
// "Enviadas" (o que eu mandei e o andamento). Faixa na ficha do cliente.
// Quem pode mandar para quem, e os avisos, ficam no banco
// (migration 20261010120000_tarefas: tarefa_salvar, tarefa_concluir,
// tarefa_comentar, tarefa_excluir, tarefa_destinatarios). Aqui é só a tela.
// Sem a tabela (migration pendente), o ícone nem aparece.
//
// Depende de: config.js (state, supabaseClient), utils.js (escapeHTML,
// showToast), crm.js (openCrm360, renderCrm360), app.js (setEnvironment),
// ui-v2-shell.js (desenha o botão data-v2="tarefas" e chama tarefasToggle).

(function () {
  const has = (fn) => typeof window[fn] === 'function';
  const esc = (s) => (has('escapeHTML') ? escapeHTML(String(s ?? '')) : String(s ?? ''));
  const ic = (n, extra = '') => `<i data-lucide="${n}" ${extra}></i>`;
  const icones = () => { if (window.lucide) window.lucide.createIcons(); };
  const toast = (m) => { if (has('showToast')) showToast(m); };

  const TF = {
    lista: [], pronto: false, semTabela: false, uid: null, canal: null,
    aba: 'mim', aberta: null, verFeitas: false, dest: null, editando: null,
  };

  // ---- datas (tudo no dia local) --------------------------------------------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const somaDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const dias = (d) => Math.round((new Date(d + 'T12:00') - new Date(hoje() + 'T12:00')) / 864e5);
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function prazoTx(d) {
    if (!d) return { tx: 'sem prazo', cls: '' };
    const n = dias(d), dt = new Date(d + 'T12:00');
    if (n < -1) return { tx: `venceu há ${-n} dias`, cls: 'late' };
    if (n === -1) return { tx: 'venceu ontem', cls: 'late' };
    if (n === 0) return { tx: 'vence hoje', cls: 'today' };
    if (n === 1) return { tx: 'amanhã', cls: '' };
    return { tx: `${SEM[dt.getDay()]}, ${d.slice(8)}/${d.slice(5, 7)}`, cls: '' };
  }
  function feitaTx(ts) {
    const n = dias(iso(new Date(ts)));
    return n === 0 ? 'feita hoje' : n === -1 ? 'feita ontem' : `feita há ${-n} dias`;
  }
  const primeiro = (nome) => {
    const p = String(nome || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR') : 'Alguém';
  };
  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  // ---- recortes -----------------------------------------------------------------
  const paraMim = () => TF.lista.filter((t) => t.para_user === TF.uid);
  const enviadas = () => TF.lista.filter((t) => t.de_user === TF.uid && t.para_user !== TF.uid);
  const abertasMinhas = () => paraMim().filter((t) => !t.feita_em);
  const atrasada = (t) => !t.feita_em && t.prazo && dias(t.prazo) < 0;
  const ehGestor = () => !!(state.isAdmin || state.isGestor);

  // ---- dados ----------------------------------------------------------------------
  const COLS = 'id,de_user,de_nome,para_user,para_nome,titulo,detalhes,cliente_id,cliente_nome,prazo,urgente,feita_em,comentarios,created_at,updated_at';

  async function carregar() {
    // RLS já devolve só as tarefas em que a pessoa mandou ou recebeu
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data, error } = await supabaseClient.from('tarefas').select(COLS)
      .or(`feita_em.is.null,feita_em.gte.${desde}`)
      .order('created_at', { ascending: false }).limit(400);
    if (error) {
      TF.semTabela = /PGRST20|42P01|does not exist|schema cache/i.test(`${error.code} ${error.message}`);
      console.warn('[tarefas] indisponível:', error.message);
      atualizarTudo();
      return;
    }
    TF.lista = data || [];
    TF.pronto = true;
    atualizarTudo();
  }

  async function recarregarUma(id) {
    const { data } = await supabaseClient.from('tarefas').select(COLS).eq('id', id).maybeSingle();
    if (data) upsert(data); else remover(id);
  }

  function upsert(t) {
    const i = TF.lista.findIndex((x) => x.id === t.id);
    if (i >= 0) TF.lista[i] = t; else TF.lista.unshift(t);
    atualizarTudo();
  }
  function remover(id) {
    TF.lista = TF.lista.filter((x) => x.id !== id);
    if (TF.aberta === id) TF.aberta = null;
    atualizarTudo();
  }

  function escutar() {
    if (TF.canal || !TF.uid) return;
    TF.canal = supabaseClient.channel(`tarefas-${TF.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, (p) => {
        if (p.eventType === 'DELETE') { if (p.old && p.old.id) remover(p.old.id); return; }
        if (p.new && p.new.id) upsert(p.new);
      })
      .subscribe();
  }

  async function destinatarios() {
    if (TF.dest) return TF.dest;
    const { data, error } = await supabaseClient.rpc('tarefa_destinatarios');
    if (error) { console.warn('[tarefas] destinatários:', error.message); return [{ user_id: TF.uid, nome: 'Eu mesmo', eu: true }]; }
    TF.dest = data || [];
    return TF.dest;
  }

  const msgErro = (e) => {
    const m = String((e && e.message) || '');
    return /^[A-ZÁÉÍÓÚ].{3,120}\.$/.test(m) ? m : 'Não deu certo agora. Tente de novo.';
  };

  // ---- ações -----------------------------------------------------------------------
  async function concluir(id, feita = true) {
    const t = TF.lista.find((x) => x.id === id);
    if (!t || t.para_user !== TF.uid) return;
    const antes = t.feita_em;
    t.feita_em = feita ? new Date().toISOString() : null;
    if (feita && TF.aberta === id) TF.aberta = null;
    atualizarTudo();
    const { error } = await supabaseClient.rpc('tarefa_concluir', { p_id: id, p_feita: feita });
    if (error) { t.feita_em = antes; atualizarTudo(); toast(msgErro(error)); return; }
    if (feita) {
      const quem = t.de_user !== TF.uid ? ` ${primeiro(t.de_nome)} foi avisado.` : '';
      aviso(`Tarefa concluída.${quem}`, () => concluir(id, false));
    }
  }

  async function comentar(id) {
    const inp = document.getElementById(`tf-cm-${id}`);
    const tx = inp ? inp.value.trim() : '';
    if (!tx) { if (inp) inp.focus(); return; }
    inp.disabled = true;
    const { error } = await supabaseClient.rpc('tarefa_comentar', { p_id: id, p_texto: tx });
    if (error) { inp.disabled = false; toast(msgErro(error)); return; }
    await recarregarUma(id);
  }

  async function excluir(id) {
    const t = TF.lista.find((x) => x.id === id);
    if (!t || !confirm(`Excluir a tarefa "${t.titulo}"?`)) return;
    const { error } = await supabaseClient.rpc('tarefa_excluir', { p_id: id });
    if (error) { toast(msgErro(error)); return; }
    remover(id);
    toast('Tarefa excluída');
  }

  async function abrirCliente(id) {
    if (!id) return;
    fecharPainel();
    try {
      if (state.environment !== 'comercial' && has('setEnvironment')) setEnvironment('comercial');
      if (!(state.clientes || []).some((c) => String(c.id) === String(id))) {
        const { data } = await supabaseClient.from('clientes').select('*').eq('id', id).maybeSingle();
        if (!data) { toast('Esse cliente não está disponível para você.'); return; }
        if (!Array.isArray(state.clientes)) state.clientes = [];
        state.clientes.unshift(data);
      }
      if (has('openCrm360')) openCrm360(id);
    } catch (e) { console.error('[tarefas] abrir cliente', e); }
  }

  // aviso com "Desfazer" (o showToast do portal não tem botão)
  let timerAviso = null;
  function aviso(texto, desfazer) {
    let el = document.getElementById('tf-aviso');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tf-aviso';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = `<span>${esc(texto)}</span>${desfazer ? '<button type="button">Desfazer</button>' : ''}`;
    const b = el.querySelector('button');
    if (b) b.onclick = () => { el.classList.remove('on'); desfazer(); };
    requestAnimationFrame(() => el.classList.add('on'));
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.classList.remove('on'), 6000);
  }

  // ---- botão do topo ------------------------------------------------------------------
  function contagem() {
    const ab = abertasMinhas();
    return { n: ab.length, late: ab.some(atrasada) };
  }
  function pintarBotao() {
    const { n, late } = contagem();
    document.querySelectorAll('[data-v2="tarefas"]').forEach((b) => {
      b.hidden = TF.semTabela;
      let c = b.querySelector('.cnt');
      if (!n) { if (c) c.remove(); }
      else {
        if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); }
        c.textContent = n > 99 ? '99+' : String(n);
        c.classList.toggle('tf-late', late);
      }
      b.title = n ? `Tarefas (${n} aberta${n > 1 ? 's' : ''}${late ? ', com atraso' : ''})` : 'Tarefas';
      b.setAttribute('aria-expanded', painelAberto() ? 'true' : 'false');
    });
  }

  // ---- painel ----------------------------------------------------------------------------
  const painelAberto = () => !!document.querySelector('#tf-painel.on');

  function itemHTML(t) {
    const aberta = TF.aberta === t.id;
    const minha = t.para_user === TF.uid;
    const mandei = t.de_user === TF.uid;
    const lembrete = minha && mandei;
    const p = prazoTx(t.prazo);
    const origem = lembrete ? 'Lembrete seu' : minha ? `De ${esc(primeiro(t.de_nome))}` : `Para ${esc(primeiro(t.para_nome))}`;
    const cms = Array.isArray(t.comentarios) ? t.comentarios : [];

    let estado;
    if (t.feita_em) estado = `<span>${feitaTx(t.feita_em)}</span>`;
    else estado = `<span class="tf-due ${p.cls}">${p.tx}</span>`;

    const lado = minha
      ? `<button type="button" class="tf-ck" data-tf="ck" data-id="${t.id}" aria-label="${t.feita_em ? 'Reabrir' : 'Concluir'}: ${esc(t.titulo)}">${ic('check')}</button>`
      : `<span class="tf-av" title="${esc(t.para_nome || '')}">${esc(iniciais(t.para_nome))}</span>`;

    const pill = !minha
      ? (t.feita_em ? `<span class="tf-pill g">${ic('check')}Feita</span>`
        : atrasada(t) ? '<span class="tf-pill r">Atrasada</span>'
          : `<span class="tf-pill ${p.cls === 'today' ? 'o' : 'n'}">${p.tx}</span>`)
      : '';

    const ultimo = !minha && !aberta && cms.length ? `<div class="tf-meta tf-ult">${ic('message-square')}“${esc(cms[cms.length - 1].texto)}”</div>` : '';

    const detalhe = aberta ? `<div class="tf-more">
        ${t.detalhes ? `<p>${esc(t.detalhes)}</p>` : '<p class="tf-mudo">Sem detalhes.</p>'}
        ${cms.map((c) => `<div class="tf-cm"><span class="tf-av sm">${esc(iniciais(c.nome))}</span><div><b>${esc(primeiro(c.nome))}</b> ${esc(c.texto)}</div></div>`).join('')}
        ${lembrete ? '' : `<form class="tf-cmform" data-tf="cmform" data-id="${t.id}"><input id="tf-cm-${t.id}" maxlength="500" placeholder="${minha ? 'Comentar (ex.: cliente manda amanhã)' : 'Comentar ou cobrar'}" aria-label="Comentário"><button type="submit" class="tf-btn" title="Enviar comentário">${ic('send')}</button></form>`}
        <div class="tf-acts">
          ${t.cliente_id ? `<button type="button" class="tf-btn" data-tf="cli" data-id="${t.cliente_id}">${ic('external-link')}Abrir cliente</button>` : ''}
          ${mandei && !t.feita_em ? `<button type="button" class="tf-btn" data-tf="editar" data-id="${t.id}">${ic('pencil')}Editar</button>` : ''}
          ${mandei || state.isAdmin ? `<button type="button" class="tf-btn tf-del" data-tf="excluir" data-id="${t.id}">${ic('trash-2')}Excluir</button>` : ''}
          ${minha && !t.feita_em ? `<button type="button" class="tf-btn azul" data-tf="ck" data-id="${t.id}">${ic('check')}Concluir</button>` : ''}
        </div>
      </div>` : '';

    return `<div class="tf-item ${t.feita_em ? 'feita' : ''} ${aberta ? 'aberta' : ''}">
        ${lado}
        <div class="tf-tx">
          <button type="button" class="tf-ttl" data-tf="abrir" data-id="${t.id}" aria-expanded="${aberta}">${esc(t.titulo)}</button>
          <div class="tf-meta">
            ${t.urgente && !t.feita_em ? `<span class="tf-urg">${ic('zap')}Urgente</span>` : ''}
            <span>${origem}</span>${minha ? estado : ''}
            ${t.cliente_id ? `<button type="button" class="tf-cli" data-tf="cli" data-id="${t.cliente_id}">${ic('user')}${esc(t.cliente_nome || 'Cliente')}</button>` : ''}
            ${cms.length && !aberta && minha ? `<span class="tf-ncm">${ic('message-square')}${cms.length}</span>` : ''}
          </div>
          ${ultimo}
          ${detalhe}
        </div>
        ${pill}
      </div>`;
  }

  function corpoHTML() {
    if (TF.semTabela) return '<div class="tf-vazio"><b>Tarefas indisponíveis</b><span>O banco ainda não foi atualizado.</span></div>';
    if (!TF.pronto) return '<div class="tf-vazio"><span>Carregando…</span></div>';
    const ordPrazo = (a, b) => (a.prazo || '9999') < (b.prazo || '9999') ? -1 : (a.prazo || '9999') > (b.prazo || '9999') ? 1 : 0;
    let h = '';
    if (TF.aba === 'mim') {
      const ab = abertasMinhas();
      const grupos = [
        ['late', 'Atrasadas', ab.filter(atrasada)],
        ['today', 'Hoje', ab.filter((t) => t.prazo && dias(t.prazo) === 0)],
        ['next', 'Próximos dias', ab.filter((t) => !t.prazo || dias(t.prazo) > 0)],
      ];
      grupos.forEach(([k, nome, l]) => {
        if (l.length) h += `<div class="tf-grp ${k}"><span>${nome}</span><span>${l.length}</span></div>${l.sort(ordPrazo).map(itemHTML).join('')}`;
      });
      if (!ab.length) h += `<div class="tf-vazio">${ic('circle-check')}<b>Tudo em dia</b><span>Nenhuma tarefa aberta para você.</span></div>`;
      const feitas = paraMim().filter((t) => t.feita_em && dias(iso(new Date(t.feita_em))) >= -7)
        .sort((a, b) => new Date(b.feita_em) - new Date(a.feita_em));
      if (feitas.length) {
        h += `<div class="tf-grp next"><button type="button" data-tf="feitas" aria-expanded="${TF.verFeitas}">Feitas nos últimos 7 dias (${feitas.length})${ic('chevron-down', TF.verFeitas ? 'class="vira"' : '')}</button></div>`;
        if (TF.verFeitas) h += feitas.map(itemHTML).join('');
      }
    } else {
      const env = enviadas();
      const ab = env.filter((t) => !t.feita_em), at = ab.filter(atrasada), ft = env.filter((t) => t.feita_em);
      h += `<div class="tf-sum"><div><b>${ab.length}</b><small>abertas</small></div><div class="${at.length ? 'r' : ''}"><b>${at.length}</b><small>atrasadas</small></div><div><b>${ft.length}</b><small>feitas (30 dias)</small></div></div>`;
      if (!env.length) h += `<div class="tf-vazio">${ic('send')}<b>Nenhuma tarefa enviada</b><span>Use "Nova tarefa" para passar algo a alguém da equipe.</span></div>`;
      const peso = (t) => (t.feita_em ? 3 : atrasada(t) ? 0 : 1);
      h += env.slice().sort((a, b) => peso(a) - peso(b) || ordPrazo(a, b)).map(itemHTML).join('');
    }
    return h;
  }

  function painelHTML() {
    const nAb = abertasMinhas().length;
    const env = enviadas();
    const nEnv = env.filter((t) => !t.feita_em).length;
    const mostraEnv = ehGestor() || env.length > 0;
    if (!mostraEnv) TF.aba = 'mim';
    return `<div class="tf-hd"><h3>Tarefas</h3><button type="button" class="tf-x" data-tf="fechar" aria-label="Fechar">${ic('x')}</button></div>
      ${mostraEnv ? `<div class="tf-abas" role="tablist">
        <button type="button" role="tab" class="${TF.aba === 'mim' ? 'on' : ''}" data-tf="aba" data-aba="mim">Para mim${nAb ? ` <em>${nAb}</em>` : ''}</button>
        <button type="button" role="tab" class="${TF.aba === 'env' ? 'on' : ''}" data-tf="aba" data-aba="env">Enviadas${nEnv ? ` <em>${nEnv}</em>` : ''}</button>
      </div>` : ''}
      <div class="tf-body">${corpoHTML()}</div>
      ${TF.semTabela ? '' : `<div class="tf-ft"><button type="button" class="tf-nova" data-tf="nova">${ic('plus')}${ehGestor() ? 'Nova tarefa' : 'Novo lembrete'}</button></div>`}`;
  }

  function repintarPainel() {
    const p = document.getElementById('tf-painel');
    if (!p || !p.classList.contains('on')) return;
    const corpo = p.querySelector('.tf-body');
    const y = corpo ? corpo.scrollTop : 0;
    // não apaga um comentário sendo digitado
    const digitando = document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('tf-cm-')
      ? { id: document.activeElement.id, v: document.activeElement.value } : null;
    p.innerHTML = painelHTML();
    const c2 = p.querySelector('.tf-body'); if (c2) c2.scrollTop = y;
    if (digitando) { const el = document.getElementById(digitando.id); if (el) { el.value = digitando.v; el.focus(); } }
    icones();
  }

  function garantirPainel() {
    let p = document.getElementById('tf-painel');
    if (p) return p;
    const s = document.createElement('div');
    s.id = 'tf-scrim';
    s.addEventListener('click', fecharPainel);
    document.body.appendChild(s);
    p = document.createElement('aside');
    p.id = 'tf-painel';
    p.setAttribute('aria-label', 'Tarefas');
    p.addEventListener('click', onClickPainel);
    p.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-tf="cmform"]');
      if (!f) return;
      e.preventDefault();
      comentar(f.dataset.id);
    });
    document.body.appendChild(p);
    return p;
  }

  function abrirPainel() {
    if (has('ajudaFechar')) ajudaFechar();
    const p = garantirPainel();
    p.classList.add('on');
    document.getElementById('tf-scrim').classList.add('on');
    repintarPainel();
    pintarBotao();
    if (typeof captureEvent === 'function') captureEvent('tarefas_aberto', { abertas: abertasMinhas().length });
  }
  function fecharPainel() {
    const p = document.getElementById('tf-painel');
    if (!p) return;
    p.classList.remove('on');
    document.getElementById('tf-scrim')?.classList.remove('on');
    pintarBotao();
  }

  function onClickPainel(e) {
    const b = e.target.closest('[data-tf]');
    if (!b || b.tagName === 'FORM') return;
    const a = b.dataset.tf, id = b.dataset.id;
    if (a === 'fechar') fecharPainel();
    else if (a === 'aba') { TF.aba = b.dataset.aba; TF.aberta = null; repintarPainel(); }
    else if (a === 'abrir') { TF.aberta = TF.aberta === id ? null : id; repintarPainel(); }
    else if (a === 'ck') { const t = TF.lista.find((x) => x.id === id); if (t) concluir(id, !t.feita_em); }
    else if (a === 'cli') abrirCliente(id);
    else if (a === 'feitas') { TF.verFeitas = !TF.verFeitas; repintarPainel(); }
    else if (a === 'nova') abrirModal();
    else if (a === 'editar') abrirModal({ tarefa: TF.lista.find((x) => x.id === id) });
    else if (a === 'excluir') excluir(id);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('tf-modal')) { fecharModal(); return; }
    if (painelAberto()) fecharPainel();
  });

  // ---- nova / editar -------------------------------------------------------------------------
  // próxima segunda (se hoje é segunda, a da semana que vem)
  const proxSegunda = () => { const d = new Date(); const n = ((8 - d.getDay()) % 7) || 7; return somaDias(n); };

  function clientesBusca(q) {
    const n = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const alvo = n(q).trim();
    if (!alvo) return [];
    const dig = alvo.replace(/\D/g, '');
    return (state.clientes || []).filter((c) => n(c.nome).includes(alvo) || (dig.length >= 4 && String(c.telefone || '').replace(/\D/g, '').includes(dig))).slice(0, 6);
  }

  async function abrirModal(opts = {}) {
    fecharModal();
    const t = opts.tarefa || null;
    TF.editando = t ? t.id : null;
    const lista = await destinatarios();
    const eu = TF.uid;
    const para = t ? t.para_user : (opts.para || eu);
    const ops = lista.map((d) => `<option value="${d.user_id}" ${d.user_id === para ? 'selected' : ''}>${d.eu ? 'Eu mesmo (lembrete)' : esc(d.nome) + (d.unidade ? ` · ${esc(d.unidade)}` : '')}</option>`).join('');
    const cli = t && t.cliente_id ? { id: t.cliente_id, nome: t.cliente_nome } : (opts.cliente || null);
    const prazo = t ? (t.prazo || '') : somaDias(1);
    const chips = [['Hoje', hoje()], ['Amanhã', somaDias(1)], ['Segunda', proxSegunda()], ['Sem prazo', '']];

    const m = document.createElement('div');
    m.id = 'tf-modal';
    m.innerHTML = `<form class="tf-dlg" novalidate role="dialog" aria-label="${t ? 'Editar tarefa' : 'Nova tarefa'}">
        <div class="tf-dhd"><h3>${t ? 'Editar tarefa' : lista.length > 1 ? 'Nova tarefa' : 'Novo lembrete'}</h3><button type="button" class="tf-x" data-m="fechar" aria-label="Fechar">${ic('x')}</button></div>
        <div class="tf-dbd">
          ${lista.length > 1 ? `<label class="tf-fld"><span>Para quem</span><select id="tf-f-para">${ops}</select></label>`
            : `<input type="hidden" id="tf-f-para" value="${eu}"><p class="tf-dica">${ic('info')}Lembrete só para você. Quem manda tarefa para a equipe é o gestor.</p>`}
          <label class="tf-fld"><span>O que precisa ser feito</span><input id="tf-f-tit" maxlength="140" autocomplete="off" placeholder="Anexar a conta de luz do cliente" value="${t ? esc(t.titulo) : ''}"><em class="tf-err" id="tf-f-err" hidden>Escreva o que precisa ser feito.</em></label>
          <label class="tf-fld"><span>Detalhes (opcional)</span><textarea id="tf-f-det" maxlength="1000" rows="2" placeholder="Ele mandou pelo WhatsApp ontem, só falta subir na ficha.">${t && t.detalhes ? esc(t.detalhes) : ''}</textarea></label>
          <div class="tf-fld"><span>Cliente (opcional)</span>
            <div class="tf-clisel" id="tf-f-clisel" data-id="${cli ? esc(cli.id) : ''}">
              ${cli ? `<span class="tf-clichip">${ic('user')}${esc(cli.nome || 'Cliente')}<button type="button" data-m="semcli" aria-label="Tirar cliente">${ic('x')}</button></span>`
                : '<input id="tf-f-cliq" autocomplete="off" placeholder="Buscar pelo nome ou telefone"><div class="tf-clires" id="tf-f-clires"></div>'}
            </div>
          </div>
          <div class="tf-fld"><span>Prazo</span>
            <div class="tf-chips" id="tf-f-chips">${chips.map(([l, d]) => `<button type="button" data-d="${d}" class="${d === prazo ? 'on' : ''}">${l}</button>`).join('')}
              <input type="date" id="tf-f-data" value="${prazo}" aria-label="Escolher data"></div>
          </div>
          <label class="tf-sw" id="tf-f-urgbox" ${para === eu ? 'hidden' : ''}><input type="checkbox" id="tf-f-urg" ${t && t.urgente ? 'checked' : ''}><span><b>Urgente</b><small>Avisa no celular na hora. Sem isso, aparece só aqui e no sininho.</small></span></label>
        </div>
        <div class="tf-dft"><button type="button" class="tf-btn" data-m="fechar">Cancelar</button><button type="submit" class="tf-btn pri" id="tf-f-ok">${t ? 'Salvar' : 'Enviar tarefa'}</button></div>
      </form>`;
    document.body.appendChild(m);
    icones();

    const $ = (id) => document.getElementById(id);
    const form = m.querySelector('form');
    m.addEventListener('mousedown', (e) => { if (e.target === m) fecharModal(); });
    $('tf-f-tit').addEventListener('input', () => { $('tf-f-err').hidden = true; });
    const sel = $('tf-f-para');
    if (sel.tagName === 'SELECT') sel.addEventListener('change', () => {
      $('tf-f-urgbox').hidden = sel.value === eu;
      $('tf-f-ok').textContent = t ? 'Salvar' : sel.value === eu ? 'Criar lembrete' : 'Enviar tarefa';
    });
    if (!t && sel.value === eu) $('tf-f-ok').textContent = 'Criar lembrete';
    $('tf-f-chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (!b) return;
      $('tf-f-data').value = b.dataset.d;
      $('tf-f-chips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('tf-f-data').addEventListener('input', () => {
      $('tf-f-chips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.d === $('tf-f-data').value));
    });

    // cliente: busca nos clientes já carregados
    const box = $('tf-f-clisel');
    function pintarCliente(c) {
      box.dataset.id = c ? c.id : '';
      box.innerHTML = c
        ? `<span class="tf-clichip">${ic('user')}${esc(c.nome || 'Cliente')}<button type="button" data-m="semcli" aria-label="Tirar cliente">${ic('x')}</button></span>`
        : '<input id="tf-f-cliq" autocomplete="off" placeholder="Buscar pelo nome ou telefone"><div class="tf-clires" id="tf-f-clires"></div>';
      icones();
      if (!c) $('tf-f-cliq').focus();
    }
    box.addEventListener('input', (e) => {
      if (e.target.id !== 'tf-f-cliq') return;
      const r = clientesBusca(e.target.value);
      $('tf-f-clires').innerHTML = r.map((c) => `<button type="button" data-m="cli" data-id="${esc(c.id)}">${esc(c.nome || 'Sem nome')}<small>${esc(c.cidade || '')}</small></button>`).join('')
        || (e.target.value.trim() ? '<p>Nenhum cliente encontrado.</p>' : '');
    });
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      if (b.dataset.m === 'fechar') fecharModal();
      else if (b.dataset.m === 'semcli') pintarCliente(null);
      else if (b.dataset.m === 'cli') { const c = (state.clientes || []).find((x) => String(x.id) === b.dataset.id); pintarCliente(c || null); }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tit = $('tf-f-tit').value.trim();
      if (!tit) { $('tf-f-err').hidden = false; $('tf-f-tit').focus(); return; }
      const ok = $('tf-f-ok');
      ok.disabled = true;
      const paraId = $('tf-f-para').value;
      const args = {
        p_id: TF.editando, p_para: paraId, p_titulo: tit,
        p_detalhes: $('tf-f-det').value.trim() || null,
        p_cliente: box.dataset.id || null,
        p_prazo: $('tf-f-data').value || null,
        p_urgente: paraId !== eu && $('tf-f-urg').checked,
      };
      const { data, error } = await supabaseClient.rpc('tarefa_salvar', args);
      if (error) { ok.disabled = false; toast(msgErro(error)); return; }
      fecharModal();
      await recarregarUma(data);
      const d = (TF.dest || []).find((x) => x.user_id === paraId);
      if (t) toast('Tarefa salva');
      else if (paraId === eu) toast('Lembrete criado');
      else toast(`Tarefa enviada para ${primeiro(d && d.nome)}${args.p_urgente ? ' com aviso no celular' : ''}`);
      TF.aba = paraId === eu ? 'mim' : 'env';
      TF.aberta = null;
      if (!painelAberto()) abrirPainel(); else repintarPainel();
    });
    setTimeout(() => $('tf-f-tit').focus(), 30);
  }

  function fecharModal() {
    document.getElementById('tf-modal')?.remove();
    TF.editando = null;
  }

  // ---- faixa na ficha do cliente ------------------------------------------------------------------
  function fichaHTML(client) {
    const id = client && String(client.id);
    const l = TF.lista.filter((t) => !t.feita_em && String(t.cliente_id) === id);
    const itens = l.map((t) => {
      const minha = t.para_user === TF.uid;
      const p = prazoTx(t.prazo);
      const quem = minha ? (t.de_user === TF.uid ? 'Lembrete seu' : `Tarefa de ${esc(primeiro(t.de_nome))} para você`) : `Tarefa com ${esc(primeiro(t.para_nome))}`;
      return `<div class="tf-faixa ${atrasada(t) ? 'late' : ''}">
          <span class="tf-fi">${ic('list-checks')}</span>
          <button type="button" class="tf-ftx" onclick="tarefasAbrir('${t.id}')"><b>${esc(t.titulo)}</b><small>${quem} · ${p.tx}</small></button>
          ${minha ? `<button type="button" class="tf-btn azul" onclick="tarefasConcluir('${t.id}')">${ic('check')}Concluir</button>` : ''}
        </div>`;
    }).join('');
    return `<div id="tf-ficha" data-cliente="${esc(id || '')}">${itens}</div>`;
  }
  // troca só a faixa (re-render da ficha apagaria o que a pessoa está digitando)
  function repintarFicha() {
    const el = document.getElementById('tf-ficha');
    if (!el) return;
    const c = (state.clientes || []).find((x) => String(x.id) === el.dataset.cliente);
    if (!c) return;
    el.outerHTML = fichaHTML(c);
    icones();
  }

  function atualizarTudo() {
    pintarBotao();
    repintarPainel();
    repintarFicha();
  }

  // virou o dia com a plataforma aberta: "hoje"/"atrasada" mudam
  setInterval(() => { if (TF.pronto) atualizarTudo(); }, 10 * 60 * 1000);

  // ---- início ------------------------------------------------------------------------------------
  function iniciar() {
    const uid = state.currentUser && state.currentUser.id;
    if (!uid || TF.uid === uid || typeof supabaseClient === 'undefined') return;
    if (TF.canal) { supabaseClient.removeChannel(TF.canal); TF.canal = null; }
    TF.uid = uid; TF.lista = []; TF.pronto = false; TF.semTabela = false; TF.dest = null; TF.aberta = null;
    carregar()
      .then(() => {
        if (!TF.semTabela) escutar();
        if (window.uiV2Shell) window.uiV2Shell.refresh();
        abrirPendente();
      })
      .catch((e) => console.warn('[tarefas]', e));
  }
  ['fetchClientes', 'renderContent'].forEach((nome) => {
    if (!has(nome)) return;
    const orig = window[nome];
    window[nome] = function () {
      const r = orig.apply(this, arguments);
      try { iniciar(); } catch (e) { console.warn('[tarefas]', e); }
      return r;
    };
  });

  // aberto pelo sininho antes de as tarefas carregarem
  let pendente = null;
  async function abrirPendente() {
    if (!pendente || !TF.pronto) return;
    const id = pendente; pendente = null;
    if (!TF.lista.some((t) => t.id === id)) await recarregarUma(id);
    const t = TF.lista.find((x) => x.id === id);
    if (!t) { toast('Essa tarefa não existe mais.'); return; }
    TF.aba = t.para_user === TF.uid ? 'mim' : 'env';
    TF.aberta = id;
    if (t.feita_em && t.para_user === TF.uid) TF.verFeitas = true;
    abrirPainel();
  }

  window.tarefasDisponivel = () => !TF.semTabela;
  window.tarefasContagem = contagem;
  window.tarefasToggle = () => { if (painelAberto()) fecharPainel(); else abrirPainel(); };
  window.tarefasAbrir = (id) => { pendente = id; abrirPendente(); };
  window.tarefasConcluir = (id) => concluir(id, true);
  window.tarefasNova = (opts) => abrirModal(opts || {});
  window.tarefasFichaHTML = (client) => (TF.semTabela ? '' : fichaHTML(client));
})();

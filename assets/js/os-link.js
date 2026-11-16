// =====================================================================
// OS por link (sem login) — lado da plataforma
// Bloco "OS da equipe no celular" no card da obra (instalação) e na ficha do
// cliente (vistoria): gerar/trocar/cancelar o link, mandar no WhatsApp, ver o
// andamento e, quando a equipe finaliza, a conferência da gestão.
// Banco: migration 20261116150000_os_link_equipe (os_link_ver/gerar/cancelar/
// devolver/vistoria_concluir). Sem a migration o bloco simplesmente não aparece.
// =====================================================================
(function () {
  'use strict';

  const C = {};        // cache por 'tipo:ref' → { d, em, busca }
  const URLS = {};     // url assinada por caminho de foto
  const CTX = {};      // dados do card para a mensagem do WhatsApp
  let semBanco = false;
  const MIN_MS = 3000;

  const sb = () => supabaseClient;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const toast = (m) => (typeof showToast === 'function' ? showToast(m) : console.log(m));
  const pad = (n) => String(n).padStart(2, '0');
  const quando = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hora = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const rot = (t) => (t === 'inst' ? 'instalação' : 'vistoria');
  const chave = (t, r) => t + ':' + r;
  const link = (tk) => (typeof linkPublico === 'function' ? linkPublico('e/' + tk) : location.origin + '/e/' + tk);
  const dist = (m) => (m == null ? '' : m >= 1000 ? (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km do endereço' : m + ' m do endereço');

  async function rpc(nome, args) {
    const { data, error } = await sb().rpc(nome, args);
    if (error) throw error;
    return data;
  }
  const faltaBanco = (e) => /PGRST202|os_link_|42883|could not find the function/i.test(String((e && (e.code || '')) + ' ' + (e && e.message)));

  // ------------------------------------------------------------ carga
  function buscar(tipo, ref, forcar) {
    const k = chave(tipo, ref), c = C[k] || (C[k] = {});
    if (c.busca) return c.busca;
    if (!forcar && c.em && Date.now() - c.em < MIN_MS) return Promise.resolve(c.d);
    c.busca = (async () => {
      try {
        c.d = await rpc('os_link_ver', { p_tipo: tipo, p_ref: ref });
        c.erro = null;
        await assinarFotos(c.d);
      } catch (e) {
        if (faltaBanco(e)) semBanco = true;
        else if (!/permiss/i.test(String(e.message || ''))) console.error('[os-link] ver', e);
        c.erro = e; c.d = null;
      } finally { c.em = Date.now(); c.busca = null; }
      pintar(tipo, ref);
      return c.d;
    })();
    return c.busca;
  }
  async function assinarFotos(d) {
    const L = d && d.link;
    if (!L || !['finalizada', 'fechada'].includes(L.status)) return;
    const faltam = (L.fotos || []).map((f) => f.path).filter((p) => p && !URLS[p]);
    if (!faltam.length) return;
    try {
      const { data } = await sb().storage.from('crm-arquivos').createSignedUrls(faltam, 3600);
      (data || []).forEach((x) => { if (x && x.signedUrl) URLS[x.path] = x.signedUrl; });
    } catch (e) { console.warn('[os-link] fotos', e); }
  }
  function pintar(tipo, ref) {
    document.querySelectorAll(`[data-osl="${chave(tipo, ref)}"]`).forEach((el) => { el.innerHTML = corpo(tipo, ref); });
    icons();
  }

  // ------------------------------------------------------------ html
  function progresso(L) {
    const st = L.estado || { feitos: 0, total: 0 };
    const pct = st.total ? Math.round(st.feitos / st.total * 100) : 0;
    const linha = (ok, i, t, d) => `<div class="osl-row ${ok ? 'ok' : ''}">${ic(ok ? 'circle-check' : i)}<span>${t}</span><small>${d || ''}</small></div>`;
    const abriu = (L.nomes || []).length;
    return `<div class="osl-prog">
      ${linha(abriu, 'circle-dashed', abriu ? 'Aberto por <b>' + esc(L.nomes.join(', ')) + '</b>' : 'Ainda não abriram o link', '')}
      ${L.tipo === 'inst' ? linha(!!L.chegou, 'circle-dashed', L.chegou ? 'Chegou na obra · ' + esc(L.chegou.nome) : 'Chegada', L.chegou ? esc(quando(L.chegou.em)) + (L.chegou.dist != null ? ' · ' + esc(dist(L.chegou.dist)) : '') : '—') : ''}
      <div class="osl-row ${st.feitos === st.total && st.total ? 'ok' : ''}">${ic(st.feitos === st.total && st.total ? 'circle-check' : 'list-checks')}<span class="osl-grow">Checklist ${st.feitos} de ${st.total}<span class="osl-bar"><i style="width:${pct}%"></i></span></span><small>${(L.fotos || []).length} foto${(L.fotos || []).length === 1 ? '' : 's'}</small></div>
      ${linha(L.status === 'finalizada', 'circle-dashed', L.status === 'finalizada' ? 'Finalizou · aguardando conferência' : 'Finalizar', L.finalizado && L.status === 'finalizada' ? esc(quando(L.finalizado.em)) : '—')}
    </div>`;
  }
  function conferenciaHTML(L, aberto) {
    const st = L.estado || { itens: [] };
    const nomeItem = {};
    (st.itens || []).forEach((it) => { nomeItem[it.k] = it; });
    const fotos = (L.fotos || []).map((f) => {
      const it = nomeItem[f.item] || {};
      const sl = it.slots ? (it.slots.find((s) => s[0] === f.slot) || [])[1] : '';
      const r = (it.t || f.item) + (sl ? ' · ' + sl : '');
      const u = URLS[f.path];
      return u ? `<a class="osl-foto" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(r)}"><img src="${esc(u)}" alt="" loading="lazy"><em>${esc(r)}</em></a>`
        : `<span class="osl-foto sem">${ic('image')}<em>${esc(r)}</em></span>`;
    }).join('');
    const itens = (st.itens || []).map((it) => {
      const extra = it.campo ? (L.dados && L.dados.campos && L.dados.campos[it.k]) : it.telhado ? (L.dados && L.dados.telhado) : it.gps && L.dados && L.dados.loc ? `${L.dados.loc.lat}, ${L.dados.loc.lng}${L.dados.loc.acc ? ' (±' + L.dados.loc.acc + ' m)' : ''}` : '';
      return `<div class="osl-ck ${it.ok ? 'ok' : ''}">${ic(it.ok ? 'circle-check' : 'circle-dashed')}<div>${esc(it.t)}${extra ? `<small>${esc(extra)}</small>` : ''}</div><span>${it.gps ? '' : it.n + ' foto' + (it.n === 1 ? '' : 's')}</span></div>`;
    }).join('');
    const obs = L.dados && L.dados.obs;
    const corpoC = `
      ${fotos ? `<div class="osl-sec">${ic('images')}Fotos <small>também em Arquivos do cliente</small></div><div class="osl-fotos">${fotos}</div>` : ''}
      <div class="osl-sec">${ic('list-checks')}Checklist</div><div class="osl-cks">${itens}</div>
      ${L.tipo === 'inst' && L.assinatura ? `<div class="osl-sec">${ic('signature')}Assinatura do cliente <small>${L.assinado ? esc(quando(L.assinado.em)) + ' · recolhida por ' + esc(L.assinado.nome) : ''}</small></div><div class="osl-ass"><img src="${esc(L.assinatura)}" alt="Assinatura do cliente"></div>` : ''}
      ${obs ? `<div class="osl-sec">${ic('notebook-pen')}Observação da equipe</div><p class="osl-obs">${esc(obs)}</p>` : ''}`;
    return aberto ? corpoC : `<details class="osl-det"><summary>${ic('chevron-right')}Ver fotos e checklist da equipe</summary>${corpoC}</details>`;
  }
  function corpo(tipo, ref) {
    const m = miolo(tipo, ref);
    if (!m) return '';
    const c = C[chave(tipo, ref)], L = c && c.d && c.d.link;
    const chip = !L ? '' : L.status === 'aberta' ? '<span class="osl-chip az">Link ativo</span>' : L.status === 'finalizada' ? '<span class="osl-chip lj">Aguardando conferência</span>' : L.status === 'fechada' ? '<span class="osl-chip vd">Encerrada</span>' : '';
    return `<h3>${ic('smartphone')}${tipo === 'inst' ? 'OS da equipe no celular' : 'Link da vistoria (equipe no celular)'}${chip}</h3>${m}`;
  }
  function miolo(tipo, ref) {
    const c = C[chave(tipo, ref)];
    if (semBanco) return '';
    if (!c || (!c.d && !c.erro)) return (CTX[chave(tipo, ref)] || {}).encerrado ? '' : `<div class="osl-load">${ic('loader-2')}Carregando o link da equipe…</div>`;
    if (!c.d) return /permiss/i.test(String(c.erro && c.erro.message)) ? '' : `<p class="osl-nota">${ic('triangle-alert')}<span>Não deu para carregar o link da equipe. <button type="button" class="eg-link" onclick="osLink.recarregar('${tipo}','${ref}')">Tentar de novo</button></span></p>`;
    const d = c.d, L = d.link, r = rot(tipo);
    const btnGerar = (txt) => `<button type="button" class="eg-btn pri" onclick="osLink.gerar('${tipo}','${ref}',this)">${ic('link')}${txt}</button>`;
    if ((!L || L.status === 'cancelada') && (CTX[chave(tipo, ref)] || {}).encerrado) return '';
    if (!L || L.status === 'cancelada') {
      return `<p class="osl-txt">Gere um link e mande para a equipe pelo WhatsApp. Não precisa de login: quem tem o link abre a OS no celular, tira as fotos ${tipo === 'inst' ? 'do checklist e colhe a assinatura do cliente' : 'da vistoria'}.</p>
        ${L ? `<p class="osl-nota">${ic('link-2-off')}<span>O link anterior foi cancelado. Gerar de novo reaproveita o que a equipe já enviou.</span></p>` : ''}
        <div class="osl-linha">${btnGerar(L ? 'Gerar link novo' : 'Gerar link da ' + r)}</div>`;
    }
    if (L.status === 'fechada') {
      const como = L.fechado && L.fechado.como;
      return `<p class="osl-nota ok">${ic('circle-check')}<span>OS pelo link encerrada${L.fechado ? ' em ' + esc(quando(L.fechado.em)) + (L.fechado.por ? ' por ' + esc(L.fechado.por) : '') : ''}${como === 'pendencia' ? ' · vistoria com pendência' : como === 'realizada' ? ' · vistoria realizada' : como === 'concluida' ? ' · obra concluída' : ''}. O link não abre mais.</span></p>
        ${conferenciaHTML(L, false)}
        ${tipo === 'vist' && !(CTX[chave(tipo, ref)] || {}).encerrado && como !== 'realizada' ? `<div class="osl-linha">${btnGerar('Gerar link para nova vistoria')}</div>` : ''}`;
    }
    const conf = L.status === 'finalizada';
    const confBox = !conf ? '' : d.pode_conferir
      ? `<div class="osl-conf"><div class="t">${ic('clipboard-check')}A equipe finalizou · confira e ${tipo === 'inst' ? 'conclua' : 'marque a vistoria'}</div>
          <p><b>${esc(L.finalizado ? L.finalizado.nome : '')}</b> finalizou ${L.finalizado ? 'em ' + esc(quando(L.finalizado.em)) : ''}${L.chegou ? ` · chegou às ${esc(hora(L.chegou.em))}${L.chegou.dist != null ? ' (' + esc(dist(L.chegou.dist)) + ')' : ''}` : ''} · ${(L.fotos || []).length} fotos${L.assinatura ? ' · cliente assinou' : ''}.</p>
          <div class="osl-linha">${tipo === 'inst'
            ? `<button type="button" class="eg-btn ok" onclick="osLink.concluirObra('${ref}')">${ic('circle-check')}Conferir e concluir obra</button>`
            : `<button type="button" class="eg-btn ok" onclick="osLink.vistoria('${ref}','realizada',this)">${ic('circle-check')}Marcar realizada</button><button type="button" class="rd-btn" onclick="osLink.pendenciaModal('${ref}')">${ic('triangle-alert')}Pendência</button>`}
            <button type="button" class="rd-btn" onclick="osLink.devolverModal('${tipo}','${ref}')">${ic('undo-2')}Devolver para a equipe</button></div></div>
        ${conferenciaHTML(L, true)}`
      : `<p class="osl-nota warn">${ic('hourglass')}<span>A equipe finalizou${L.finalizado ? ' em ' + esc(quando(L.finalizado.em)) : ''}. Aguardando a conferência da gestão.</span></p>`;
    return `${confBox}
      ${L.devolvido && L.status === 'aberta' ? `<p class="osl-nota warn">${ic('undo-2')}<span>Devolvida para a equipe em ${esc(quando(L.devolvido.em))}${L.devolvido.por ? ' por ' + esc(L.devolvido.por) : ''}: ${esc(L.devolvido.motivo)}</span></p>` : ''}
      <div class="osl-lk">${ic('link')}<code>${esc(link(L.token).replace(/^https?:\/\//, ''))}</code></div>
      <div class="osl-linha">
        <button type="button" class="eg-btn pri" onclick="osLink.whats('${tipo}','${ref}')">${ic('message-circle')}Mandar no WhatsApp</button>
        <button type="button" class="rd-btn" onclick="osLink.copiar('${tipo}','${ref}')">${ic('copy')}Copiar</button>
        <span class="osl-grow"></span>
        <button type="button" class="rd-btn" onclick="osLink.gerar('${tipo}','${ref}',this,true)" title="O link atual para de funcionar na hora">${ic('refresh-cw')}Outro link</button>
        <button type="button" class="rd-btn osl-del" onclick="osLink.cancelar('${tipo}','${ref}',this)" title="Cancelar o link">${ic('link-2-off')}</button>
      </div>
      ${progresso(L)}
      <p class="osl-nota">${ic('shield-check')}<span>Vale até a gestão ${tipo === 'inst' ? 'concluir a obra' : 'marcar a vistoria'}. Mostra endereço, telefone do cliente${tipo === 'inst' ? ', kit' : ''} e ${tipo === 'inst' ? 'recado' : 'observação'}; não mostra valores. Mandou para a pessoa errada? <b>Outro link</b> derruba o atual na hora.</span></p>`;
  }

  // ------------------------------------------------------------ modal (X no topo, só a ação principal embaixo)
  function modal(html) {
    fecharModal();
    const s = document.createElement('div');
    s.className = 'rd-scrim'; s.id = 'osl-scrim'; s.style.zIndex = '175';
    s.innerHTML = `<div class="rd-modal rd eg ob-modal" role="dialog" aria-modal="true"><button type="button" class="eg-sq ob-mx" onclick="osLink.fecharModal()" title="Fechar (Esc)">${ic('x')}</button>${html}</div>`;
    s.addEventListener('mousedown', (e) => { if (e.target === s) fecharModal(); });
    document.body.appendChild(s);
    icons();
    const f = s.querySelector('textarea, input');
    if (f && !window.matchMedia('(max-width: 760px)').matches) f.focus();
  }
  function fecharModal() { const s = document.getElementById('osl-scrim'); if (s) s.remove(); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('osl-scrim')) fecharModal(); });

  async function ocupado(b, fn) {
    const h = b && b.innerHTML;
    if (b) { b.disabled = true; b.innerHTML = ic('loader-2') + 'Aguarde...'; icons(); }
    try { return await fn(); } finally { if (b && document.body.contains(b)) { b.disabled = false; b.innerHTML = h; icons(); } }
  }
  async function gravar(tipo, ref, nome, args, msg, b) {
    return ocupado(b, async () => {
      try {
        const d = await rpc(nome, args);
        const c = C[chave(tipo, ref)] || (C[chave(tipo, ref)] = {});
        c.d = d; c.erro = null; c.em = Date.now();
        await assinarFotos(d);
        pintar(tipo, ref);
        if (msg) toast(msg);
        return d;
      } catch (e) {
        console.error('[os-link]', nome, e);
        toast('Não deu certo: ' + String(e.message || e).replace(/^.*?ERROR:\s*/, ''));
        return null;
      }
    });
  }
  const L_ = (tipo, ref) => { const c = C[chave(tipo, ref)]; return c && c.d && c.d.link; };

  function mensagem(tipo, ref) {
    const L = L_(tipo, ref), x = CTX[chave(tipo, ref)] || {};
    return [`Olá! OS de *${rot(tipo)}* da Ágil Solar:`, x.cliente ? `*${x.cliente}*` : '', x.quando || '', x.endereco || '', '',
      tipo === 'inst' ? 'Abra pelo link e vá preenchendo na obra (fotos, chegada e assinatura do cliente):' : 'Abra pelo link e tire as fotos pedidas:',
      link(L.token)].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
  }

  // ------------------------------------------------------------ API
  window.osLink = {
    // ctx: { cliente, quando, endereco } (mensagem do WhatsApp), classe (card do host),
    // encerrado (obra concluída / vistoria feita: sem link, não oferece gerar)
    bloco(tipo, ref, ctx) {
      if (semBanco || !ref) return '';
      CTX[chave(tipo, ref)] = ctx || {};
      setTimeout(() => buscar(tipo, ref), 0);
      return `<div class="osl ${esc((ctx && ctx.classe) || '')}" data-osl="${chave(tipo, ref)}">${corpo(tipo, ref)}</div>`;
    },
    recarregar: (tipo, ref) => buscar(tipo, ref, true),
    async gerar(tipo, ref, b, trocar) {
      if (trocar && !window.confirm('Gerar outro link? O link atual para de funcionar na hora e você precisa mandar o novo para a equipe. O que a equipe já enviou continua.')) return;
      await gravar(tipo, ref, 'os_link_gerar', { p_tipo: tipo, p_ref: ref }, trocar ? 'Link novo criado · o anterior parou de funcionar' : 'Link criado · mande para a equipe', b);
    },
    async cancelar(tipo, ref, b) {
      const L = L_(tipo, ref); if (!L) return;
      if (!window.confirm('Cancelar o link da equipe? Ele para de funcionar na hora. As fotos já enviadas ficam no cliente.')) return;
      await gravar(tipo, ref, 'os_link_cancelar', { p_id: L.id }, 'Link cancelado', b);
    },
    whats(tipo, ref) {
      const L = L_(tipo, ref); if (!L || !L.token) return;
      window.open('https://wa.me/?text=' + encodeURIComponent(mensagem(tipo, ref)), '_blank', 'noopener');
    },
    async copiar(tipo, ref) {
      const L = L_(tipo, ref); if (!L || !L.token) return;
      try { await navigator.clipboard.writeText(link(L.token)); toast('Link copiado'); }
      catch (_) { window.prompt('Copie o link:', link(L.token)); }
    },
    concluirObra(ref) {
      if (window.obras && typeof window.obras.concluirModal === 'function') window.obras.concluirModal();
      else toast('Abra a obra em Obras para concluir.');
    },
    devolverModal(tipo, ref) {
      modal(`<h3>${ic('undo-2')} Devolver para a equipe</h3>
        <p class="sub">O link volta a aceitar fotos e a equipe vê o motivo no topo da OS.</p>
        <div class="rd-fgrid"><div class="rd-fld full"><label for="osl-mot">O que precisa ajustar?</label><textarea id="osl-mot" rows="3" maxlength="500" placeholder="Ex.: falta foto do aterramento; nº de série ilegível"></textarea></div></div>
        <div class="rd-err" id="osl-err"></div>
        <div class="rd-mfoot"><button type="button" class="eg-btn pri" onclick="osLink.devolverOk('${tipo}','${ref}',this)">${ic('undo-2')}Devolver</button></div>`);
    },
    async devolverOk(tipo, ref, b) {
      const L = L_(tipo, ref); if (!L) return;
      const m = String((document.getElementById('osl-mot') || {}).value || '').trim();
      if (m.length < 3) { document.getElementById('osl-err').textContent = 'Diga o que a equipe precisa ajustar.'; return; }
      const d = await gravar(tipo, ref, 'os_link_devolver', { p_id: L.id, p_motivo: m }, 'Devolvida · a equipe vê o motivo no link', b);
      if (d) fecharModal();
    },
    pendenciaModal(ref) {
      modal(`<h3>${ic('triangle-alert')} Vistoria com pendência</h3>
        <p class="sub">A vistoria fica como <b>Pendência</b> na ficha e o link da equipe é encerrado.</p>
        <div class="rd-fgrid"><div class="rd-fld full"><label for="osl-pend">Qual é a pendência?</label><textarea id="osl-pend" rows="3" maxlength="500" placeholder="Ex.: padrão precisa ser trocado antes da instalação"></textarea></div></div>
        <div class="rd-err" id="osl-err"></div>
        <div class="rd-mfoot"><button type="button" class="eg-btn pri" onclick="osLink.pendenciaOk('${ref}',this)">${ic('check')}Salvar pendência</button></div>`);
    },
    async pendenciaOk(ref, b) {
      const m = String((document.getElementById('osl-pend') || {}).value || '').trim();
      if (m.length < 3) { document.getElementById('osl-err').textContent = 'Diga qual é a pendência.'; return; }
      if (await window.osLink.vistoria(ref, 'pendencia', b, m)) fecharModal();
    },
    async vistoria(ref, status, b, obs) {
      const L = L_('vist', ref); if (!L) return null;
      const d = await gravar('vist', ref, 'os_link_vistoria_concluir', { p_id: L.id, p_status: status, p_obs: obs || null }, status === 'realizada' ? 'Vistoria realizada' : 'Vistoria com pendência', b);
      if (d) {
        // a ficha mostra a situação nova
        const c = (state.clientes || []).find((x) => String(x.id) === String(ref));
        if (c) { c.vistoria_status = status; if (obs) c.vistoria_obs = obs; c.vistoria_atualizado_em = new Date().toISOString(); }
        if (typeof crmFetchAtividades === 'function') crmFetchAtividades(ref);
        if (typeof renderCrm360 === 'function') renderCrm360();
      }
      return d;
    },
    fecharModal,
  };
})();

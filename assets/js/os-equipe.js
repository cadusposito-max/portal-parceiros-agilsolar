// =====================================================================
// OS da equipe por link (/e/<código>) — sem login
// Instalação e vistoria. Tudo passa pelas funções os_link_* do banco
// (migration 20261116150000_os_link_equipe), que só aceitam o código desta OS.
// =====================================================================
(function () {
  'use strict';

  const TOKEN = (() => {
    const m = location.pathname.match(/\/e\/([A-Za-z0-9_-]{12,64})\/?$/);
    if (m) return m[1];
    const q = new URLSearchParams(location.search).get('t');
    return q && /^[A-Za-z0-9_-]{12,64}$/.test(q) ? q : null;
  })();

  // cliente próprio, sem sessão: a equipe nunca usa o login de quem estiver no celular
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'os-link-equipe' },
  });

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const icons = () => { if (window.lucide) window.lucide.createIcons(); };
  const pad = (n) => String(n).padStart(2, '0');
  const hora = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dataTxt = (v, tipo) => {
    if (!v) return 'Data a combinar';
    if (tipo === 'inst') { const d = new Date(String(v).slice(0, 10) + 'T12:00:00'); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} (${DIAS[d.getDay()]})`; }
    const d = new Date(v); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} (${DIAS[d.getDay()]}) · ${hora(v)}`;
  };
  const soDig = (s) => String(s || '').replace(/\D/g, '');

  const E = {
    d: null, nome: lsGet('osq_nome') || '', prev: {}, subindo: {}, sheet: null,
    sigTimer: null, obsTimer: null, campoTimer: {}, ocupado: false,
  };
  const app = () => document.getElementById('app');

  function toast(m, erro) {
    document.querySelectorAll('.osq-toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'osq-toast' + (erro ? ' err' : '');
    t.innerHTML = ic(erro ? 'circle-alert' : 'circle-check') + '<span>' + esc(m) + '</span>';
    document.body.appendChild(t); icons();
    setTimeout(() => t.remove(), erro ? 5000 : 2600);
  }
  const msgErro = (e) => String((e && (e.message || e.error_description)) || e || 'Erro').replace(/^.*?ERROR:\s*/, '');

  async function rpc(nome, args) {
    const { data, error } = await sb.rpc(nome, Object.assign({ p_token: TOKEN }, args || {}));
    if (error) throw error;
    return data;
  }
  // chamadas que devolvem a OS inteira atualizada
  async function acao(nome, args, okMsg) {
    try {
      const d = await rpc(nome, args);
      if (d && d.ok === false) { E.d = d; render(); return false; }
      if (d) E.d = d;
      render();
      if (okMsg) toast(okMsg);
      return true;
    } catch (e) {
      console.error('[os-equipe]', nome, e);
      toast(msgErro(e), true);
      // a OS pode ter mudado (finalizada, encerrada): recarrega
      if (/encerrada|não vale|conferência/i.test(msgErro(e))) carregar();
      return false;
    }
  }

  // ------------------------------------------------------------ telas
  function telaErro(motivo) {
    app().innerHTML = `<div class="osq-bd" style="padding-top:40px"><div class="osq-c"><div class="osq-fim"><div class="ic warn">${ic('link-2-off')}</div>
      <h3>Não deu para abrir a OS</h3><p>${esc(motivo || 'Link inválido.')}</p></div></div></div>`;
    icons();
  }
  function topo(d, extra) {
    const inst = d.tipo === 'inst';
    return `<header class="osq-hd"><div class="osq-brand"><img src="/assets/img/icon.png" alt="">Ágil Solar · OS de ${inst ? 'instalação' : 'vistoria'}</div>
      <h1>${esc(d.cliente.nome || 'Cliente')}</h1>
      <div class="osq-q">${ic('calendar')}${esc(dataTxt(d.data, d.tipo))}${inst && d.dias > 1 ? ` · ${d.dias} dias` : ''}${E.nome && E.entrou ? ` · ${ic('user')}${esc(E.nome)} <button type="button" class="osq-lnk" id="osq-troca" style="padding:0">trocar</button>` : ''}</div>
      ${extra || ''}</header>`;
  }
  function telaNome() {
    const d = E.d;
    app().innerHTML = topo(d) + `<div class="osq-bd"><div class="osq-c"><h2>${ic('user')}Quem está na obra?</h2>
      <p style="margin:0 0 12px">Seu nome fica em cada foto e registro desta OS. O celular lembra nas próximas vezes.</p>
      <input id="osq-nome" class="osq-in" placeholder="Seu nome" autocomplete="name" maxlength="40" value="${esc(E.nome)}">
      <button class="osq-b1 osq-wide" style="margin-top:10px" id="osq-entrar">${ic('arrow-right')}Abrir a OS</button></div>
      <p class="osq-dica">${ic('lock')} Link exclusivo desta OS. Não repasse.</p></div>`;
    icons();
    const inp = document.getElementById('osq-nome');
    const ir = async () => {
      const n = inp.value.trim().replace(/\s+/g, ' ');
      if (n.length < 2) { toast('Informe seu nome.', true); inp.focus(); return; }
      E.nome = n; lsSet('osq_nome', n); E.entrou = true;
      await acao('os_link_entrar', { p_nome: n });
    };
    document.getElementById('osq-entrar').onclick = ir;
    inp.onkeydown = (e) => { if (e.key === 'Enter') ir(); };
  }

  const fotosDo = (k) => (E.d.fotos || []).filter((f) => f.item === k);
  function thumb(f, rot, ro) {
    const src = E.prev[f.id];
    return `<div class="osq-th ${src ? '' : 'sem'}">${src ? `<img src="${src}" alt="">` : ic('image')}<em>${esc(rot || hora(f.em))}</em>
      ${ro ? '' : `<button type="button" class="x" title="Tirar esta foto" data-tirar="${esc(f.id)}">${ic('x')}</button>`}</div>`;
  }
  function itemHTML(it, ro) {
    const d = E.d, fs = fotosDo(it.k);
    let corpo = '';
    if (it.gps) {
      const loc = d.dados && d.dados.loc;
      corpo = loc
        ? `<div class="osq-gps"><span class="osq-chip">${ic('map-pin')}${esc(Number(loc.lat).toFixed(5))}, ${esc(Number(loc.lng).toFixed(5))}${loc.acc ? ` · ±${esc(loc.acc)} m` : ''}</span>${ro ? '' : `<button type="button" class="osq-lnk" data-gps="1">${ic('refresh-cw')}Pegar de novo</button>`}</div>`
        : (ro ? '' : `<div class="osq-gps"><button type="button" class="osq-b2" data-gps="1">${ic('locate-fixed')}Usar minha localização</button></div>`);
    } else {
      if (it.telhado) {
        const t = (d.dados && d.dados.telhado) || '';
        corpo += `<div class="campo"><select class="osq-sel" data-telhado="1" ${ro ? 'disabled' : ''}><option value="">Tipo de telhado…</option>${['Cerâmico', 'Fibrocimento', 'Metálico', 'Laje', 'Solo', 'Outro'].map((x) => `<option ${t === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`;
      }
      if (it.slots) {
        corpo += `<div class="osq-thumbs">${it.slots.map(([s, rot]) => {
          const f = fs.filter((x) => x.slot === s).pop();
          if (f) return thumb(f, rot, ro);
          if (ro) return '';
          const sub = E.subindo[it.k + ':' + s];
          return `<button type="button" class="osq-add" data-foto="${esc(it.k)}" data-slot="${esc(s)}" ${sub ? 'disabled' : ''}>${sub ? '<span class="osq-spin"></span>' : ic('camera')}${esc(rot)}</button>`;
        }).join('')}</div>`;
      } else {
        const sub = E.subindo[it.k];
        corpo += `<div class="osq-thumbs">${fs.map((f) => thumb(f, '', ro)).join('')}${ro ? '' : `<button type="button" class="osq-add" data-foto="${esc(it.k)}" ${sub ? 'disabled' : ''}>${sub ? '<span class="osq-spin"></span>' : ic('camera')}${sub ? 'Enviando' : 'Foto'}</button>`}</div>`;
      }
      if (it.campo) {
        const v = (d.dados && d.dados.campos && d.dados.campos[it.k]) || '';
        corpo += `<div class="campo"><input class="osq-in" data-campo="${esc(it.k)}" placeholder="${esc(it.campo)}" value="${esc(v)}" maxlength="80" ${ro ? 'disabled' : ''}></div>`;
      }
    }
    const cont = it.min > 1 ? ` · ${Math.min(it.slots ? new Set(fs.map((f) => f.slot)).size : fs.length, it.min)} de ${it.min}` : '';
    return `<div class="osq-it ${it.ok ? 'ok' : ''}"><span class="osq-ck">${it.ok ? ic('check') : ''}</span>
      <div class="osq-tx"><b>${esc(it.t)}</b><small>${esc(cont || !it.ob ? String(it.d).replace(/\.$/, '') : it.d)}${cont}${it.ob ? '' : ' · opcional'}</small>${corpo}</div></div>`;
  }

  function render() {
    const d = E.d;
    if (!d) return;
    if (d.ok === false) { telaErro(d.motivo); return; }
    if (!E.nome || !E.entrou) { telaNome(); return; }
    const inst = d.tipo === 'inst', st = d.estado || { itens: [], falta: [], feitos: 0, total: 0 };
    const ro = d.status !== 'aberta';
    const cl = d.cliente || {};
    const ender = [cl.endereco, [cl.cidade, cl.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    const destino = cl.lat && cl.lng ? `${cl.lat},${cl.lng}` : [cl.endereco, cl.cidade, cl.uf].filter(Boolean).join(', ');
    const tel = soDig(cl.telefone);
    const telBR = tel.length >= 12 ? tel : '55' + tel;
    const pct = st.total ? Math.round(st.feitos / st.total * 100) : 0;
    const falta = st.falta || [];

    const y = window.scrollY;
    app().innerHTML = topo(d, `<div class="osq-pb"><small>${st.feitos} de ${st.total} itens${ro ? ' · finalizada' : ''}</small><div class="osq-bar"><i style="width:${pct}%"></i></div></div>`)
      + `<div class="osq-bd">
      ${d.devolvido && !ro ? `<div class="osq-c aviso"><h2>${ic('undo-2')}Voltou da conferência</h2><p style="margin:0;color:var(--v2-ink)"><b>O que ajustar:</b> ${esc(d.devolvido.motivo)}</p></div>` : ''}
      ${ro ? `<div class="osq-c"><div class="osq-fim"><div class="ic">${ic('circle-check')}</div><h3>Enviado para conferência</h3>
        <p>Finalizado${d.finalizado ? ` por ${esc(d.finalizado.nome)} às ${esc(hora(d.finalizado.em))}` : ''}. Agora é com a gestão: se precisar ajustar algo, eles devolvem e o motivo aparece aqui.</p></div></div>` : ''}
      ${d.recado ? `<div class="osq-c recado"><h2>${ic('message-square')}${inst ? 'Recado' : 'Observação'}</h2><p>${esc(d.recado)}</p></div>` : ''}
      <div class="osq-c"><h2>${ic('map-pin')}Endereço</h2><div class="osq-big">${esc(ender || 'Endereço não informado')}</div>
        ${destino ? `<div class="osq-acts"><a class="osq-b2" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}" target="_blank" rel="noopener">${ic('navigation')}Mapa</a>
        <a class="osq-b2" href="https://waze.com/ul?${cl.lat && cl.lng ? 'll=' + encodeURIComponent(destino) : 'q=' + encodeURIComponent(destino)}&navigate=yes" target="_blank" rel="noopener">${ic('car')}Waze</a></div>` : ''}</div>
      ${tel ? `<div class="osq-c"><h2>${ic('phone')}Cliente</h2><div class="osq-big">${esc(cl.telefone)}</div>
        <div class="osq-acts"><a class="osq-b2" href="tel:+${telBR}">${ic('phone')}Ligar</a><a class="osq-b2" href="https://wa.me/${telBR}" target="_blank" rel="noopener">${ic('message-circle')}WhatsApp</a></div></div>` : ''}
      ${inst && d.kit ? `<div class="osq-c"><h2>${ic('package')}Kit</h2><div class="osq-big">${esc(d.kit.nome || '—')}</div>
        <p>${[d.kit.modulos ? d.kit.modulos + ' módulos' : '', d.kit.kwp ? String(Number(d.kit.kwp).toLocaleString('pt-BR', { maximumFractionDigits: 2 })) + ' kWp' : '', d.equipe ? 'equipe ' + d.equipe : ''].filter(Boolean).map(esc).join(' · ')}</p></div>` : ''}
      ${inst ? (d.chegou ? `<div class="osq-chegou">${ic('map-pin-check')}<div>Chegada às ${esc(hora(d.chegou.em))} · ${esc(d.chegou.nome)}<small>${d.chegou.dist != null ? (d.chegou.dist >= 1000 ? (d.chegou.dist / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km' : d.chegou.dist + ' m') + ' do endereço' : 'sem localização'}</small></div></div>`
        : (ro ? '' : `<button class="osq-bo osq-wide" id="osq-cheguei">${ic('map-pin-check')}Cheguei na obra</button>`)) : ''}
      <div class="osq-c ${ro ? 'lido' : ''}"><h2>${ic('list-checks')}${inst ? 'Checklist da instalação' : 'Fotos da vistoria'}</h2>${(st.itens || []).map((it) => itemHTML(it, ro)).join('')}</div>
      <div class="osq-c ${ro ? 'lido' : ''}"><h2>${ic('notebook-pen')}Observação</h2>
        <textarea class="osq-ta" id="osq-obs" maxlength="1000" placeholder="${inst ? 'Ex.: troquei 6 telhas, sobrou 1 trilho na garagem' : 'Ex.: padrão precisa trocar, telhado com infiltração'}" ${ro ? 'disabled' : ''}>${esc((d.dados && d.dados.obs) || '')}</textarea></div>
      ${inst ? `<div class="osq-c ${ro ? 'lido' : ''}"><h2>${ic('signature')}Assinatura do cliente</h2><p style="margin:0 0 10px">“Recebi a instalação do sistema solar no meu imóvel.”</p>
        ${d.assinado && !E.sigNova
          ? `<div class="osq-chegou">${ic('circle-check')}<div>Cliente assinou às ${esc(hora(d.assinado.em))}<small>recolhida por ${esc(d.assinado.nome)}</small></div></div>${ro ? '' : `<button type="button" class="osq-lnk" id="osq-sig-refazer">${ic('rotate-ccw')}Refazer a assinatura</button>`}`
          : `<canvas id="osq-sig" class="osq-sig"></canvas><div class="osq-sig-l"><span id="osq-sig-st">Assine com o dedo</span><button type="button" class="osq-lnk" id="osq-sig-limpar">Limpar</button></div>`}</div>` : ''}
      ${ro ? '' : `<div><button class="osq-bg osq-wide" id="osq-fim" ${falta.length ? 'disabled' : ''}>${ic('send')}Finalizar e mandar pra conferência</button>
        ${falta.length ? `<div class="osq-falta">Falta: ${falta.map(esc).join(', ')}</div>` : ''}
        <p class="osq-dica">Tudo salva sozinho. Pode fechar e voltar pelo mesmo link.</p></div>`}
      </div>
      ${E.sheet === 'fim' ? `<div class="osq-scrim" id="osq-scrim"><div class="osq-sheet"><h3><span>Finalizar a OS?</span><button class="osq-xf" id="osq-sheet-x" title="Fechar">${ic('x')}</button></h3>
        <p>Depois de finalizar, a OS fica só para leitura. A gestão confere ${inst ? 'e conclui a obra' : 'e marca a vistoria como realizada'}.</p>
        <button class="osq-bg osq-wide" id="osq-fim-ok">${ic('send')}Finalizar</button></div></div>` : ''}`;
    icons();
    window.scrollTo(0, y);
    ligar();
  }

  // ------------------------------------------------------------ eventos
  function ligar() {
    const root = app();
    root.querySelectorAll('[data-foto]').forEach((b) => { b.onclick = () => escolherFoto(b.dataset.foto, b.dataset.slot || null); });
    root.querySelectorAll('[data-tirar]').forEach((b) => { b.onclick = () => tirarFoto(b.dataset.tirar); });
    root.querySelectorAll('[data-gps]').forEach((b) => { b.onclick = () => gpsPadrao(b); });
    root.querySelectorAll('[data-campo]').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.campo;
        clearTimeout(E.campoTimer[k]);
        E.campoTimer[k] = setTimeout(() => salvarDados({ campos: { [k]: inp.value } }), 900);
      };
    });
    const tel = root.querySelector('[data-telhado]');
    if (tel) tel.onchange = () => salvarDados({ telhado: tel.value }, 'Telhado salvo');
    const obs = document.getElementById('osq-obs');
    if (obs && !obs.disabled) obs.oninput = () => { clearTimeout(E.obsTimer); E.obsTimer = setTimeout(() => salvarDados({ obs: obs.value }), 1200); };
    const ch = document.getElementById('osq-cheguei');
    if (ch) ch.onclick = () => cheguei(ch);
    const fim = document.getElementById('osq-fim');
    if (fim) fim.onclick = () => { E.sheet = 'fim'; render(); };
    const sx = document.getElementById('osq-sheet-x');
    if (sx) sx.onclick = () => { E.sheet = null; render(); };
    const sc = document.getElementById('osq-scrim');
    if (sc) sc.onclick = (e) => { if (e.target === sc) { E.sheet = null; render(); } };
    const fok = document.getElementById('osq-fim-ok');
    if (fok) fok.onclick = async () => { fok.disabled = true; E.sheet = null; await acao('os_link_finalizar', { p_nome: E.nome }, 'OS enviada para conferência'); };
    const tr = document.getElementById('osq-troca');
    if (tr) tr.onclick = () => { E.entrou = false; E.sheet = null; render(); };
    const ref = document.getElementById('osq-sig-refazer');
    if (ref) ref.onclick = () => { E.sigNova = true; render(); };
    ligarAssinatura();
  }

  async function salvarDados(dados, okMsg) {
    try {
      const d = await rpc('os_link_salvar', { p_nome: E.nome, p_dados: dados });
      if (d) {
        // não redesenha por cima do que está sendo digitado
        const foco = document.activeElement;
        const digitando = foco && (foco.id === 'osq-obs' || foco.dataset.campo);
        E.d = d;
        if (!digitando) render(); else atualizarProgresso();
      }
      if (okMsg) toast(okMsg);
    } catch (e) { console.error('[os-equipe] salvar', e); toast(msgErro(e), true); }
  }
  function atualizarProgresso() {
    const st = E.d.estado || {};
    const b = document.querySelector('.osq-bar i'), s = document.querySelector('.osq-pb small');
    if (b) b.style.width = (st.total ? Math.round(st.feitos / st.total * 100) : 0) + '%';
    if (s) s.textContent = `${st.feitos} de ${st.total} itens`;
    const f = document.getElementById('osq-fim');
    if (f) f.disabled = !!(st.falta && st.falta.length);
    const fx = document.querySelector('.osq-falta');
    const falta = st.falta || [];
    if (fx && !falta.length) fx.remove();
    else if (fx) fx.textContent = 'Falta: ' + falta.join(', ');
    else if (falta.length && f) f.insertAdjacentHTML('afterend', `<div class="osq-falta">Falta: ${falta.map(esc).join(', ')}</div>`);
  }

  function posicao() {
    return new Promise((ok) => {
      if (!navigator.geolocation) { ok(null); return; }
      navigator.geolocation.getCurrentPosition((p) => ok(p.coords), () => ok(null), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }
  async function cheguei(btn) {
    btn.disabled = true; btn.innerHTML = '<span class="osq-spin"></span>Pegando a localização…';
    const c = await posicao();
    if (!c && !window.confirm('Não deu para pegar a localização. Marcar a chegada mesmo assim?')) { render(); return; }
    await acao('os_link_chegada', { p_nome: E.nome, p_lat: c ? c.latitude : null, p_lng: c ? c.longitude : null }, 'Chegada registrada');
  }
  async function gpsPadrao(btn) {
    btn.disabled = true;
    const c = await posicao();
    if (!c) { btn.disabled = false; toast('Não deu para pegar a localização. Libere o GPS do celular e tente de novo.', true); return; }
    await salvarDados({ loc: { lat: c.latitude, lng: c.longitude, acc: Math.round(c.accuracy || 0) } }, 'Localização salva');
  }

  // ------------------------------------------------------------ fotos
  let alvoFoto = null;
  function escolherFoto(item, slot) {
    alvoFoto = { item, slot };
    const inp = document.getElementById('osq-file');
    inp.value = '';
    inp.multiple = !slot;
    inp.click();
  }
  document.getElementById('osq-file').addEventListener('change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    const alvo = alvoFoto; alvoFoto = null;
    if (!alvo || !files.length) return;
    for (const f of files.slice(0, alvo.slot ? 1 : 10)) await enviarFoto(alvo.item, alvo.slot, f);
  });

  async function comprimir(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
      return blob ? { blob, mime: 'image/jpeg', ext: 'jpg' } : null;
    } catch (_) { return null; }
  }
  async function enviarFoto(item, slot, file) {
    const chave = slot ? item + ':' + slot : item;
    E.subindo[chave] = true; render();
    try {
      let pronto = await comprimir(file);
      if (!pronto) {
        const mime = String(file.type || '').toLowerCase();
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[mime];
        if (!ext) throw new Error('Formato de foto não aceito.');
        if (file.size > 20 * 1024 * 1024) throw new Error('Foto grande demais (mais de 20 MB).');
        pronto = { blob: file, mime, ext };
      }
      const p = await rpc('os_link_foto_pedir', { p_nome: E.nome, p_item: item, p_slot: slot, p_ext: pronto.ext });
      const up = await sb.storage.from('crm-arquivos').upload(p.path, pronto.blob, { contentType: pronto.mime, upsert: false });
      if (up.error) throw up.error;
      const d = await rpc('os_link_foto_ok', { p_foto: p.id, p_mime: pronto.mime, p_tamanho: pronto.blob.size });
      E.prev[p.id] = URL.createObjectURL(pronto.blob);
      if (d) E.d = d;
      toast('Foto enviada');
    } catch (e) {
      console.error('[os-equipe] foto', e);
      toast('A foto não foi: ' + msgErro(e), true);
    } finally {
      delete E.subindo[chave];
      render();
    }
  }
  async function tirarFoto(id) {
    if (!window.confirm('Tirar esta foto da OS?')) return;
    await acao('os_link_foto_tirar', { p_foto: id }, 'Foto retirada');
  }

  // ------------------------------------------------------------ assinatura
  function ligarAssinatura() {
    const cv = document.getElementById('osq-sig');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr); c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#0F1B26';
    let on = false, riscou = false;
    const p = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.onpointerdown = (e) => { e.preventDefault(); on = true; cv.setPointerCapture(e.pointerId); const [x, y] = p(e); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y + 0.1); c.stroke(); riscou = true; };
    cv.onpointermove = (e) => { if (!on) return; e.preventDefault(); const [x, y] = p(e); c.lineTo(x, y); c.stroke(); };
    const solta = () => {
      if (!on) return; on = false;
      clearTimeout(E.sigTimer);
      const st = document.getElementById('osq-sig-st'); if (st) st.textContent = 'Salvando…';
      E.sigTimer = setTimeout(async () => {
        if (!riscou) return;
        // fundo branco: o PNG transparente some no modo escuro da plataforma
        const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
        const oc = out.getContext('2d'); oc.fillStyle = '#fff'; oc.fillRect(0, 0, out.width, out.height); oc.drawImage(cv, 0, 0);
        try {
          const d = await rpc('os_link_assinar', { p_nome: E.nome, p_png: out.toDataURL('image/png') });
          if (d) E.d = d;
          E.sigNova = false;
          const s2 = document.getElementById('osq-sig-st'); if (s2) s2.textContent = 'Assinatura salva';
          atualizarProgresso();
        } catch (e) { toast(msgErro(e), true); const s2 = document.getElementById('osq-sig-st'); if (s2) s2.textContent = 'Não salvou. Assine de novo.'; }
      }, 900);
    };
    cv.onpointerup = solta; cv.onpointercancel = solta;
    const lim = document.getElementById('osq-sig-limpar');
    if (lim) lim.onclick = async () => {
      clearTimeout(E.sigTimer); riscou = false;
      c.clearRect(0, 0, cv.width, cv.height);
      const st = document.getElementById('osq-sig-st'); if (st) st.textContent = 'Assine com o dedo';
      if (E.d.assinado) {
        try { const d = await rpc('os_link_assinar', { p_nome: E.nome, p_png: null }); if (d) E.d = d; atualizarProgresso(); } catch (e) { toast(msgErro(e), true); }
      }
    };
  }

  // ------------------------------------------------------------ início
  async function carregar() {
    try {
      const d = await rpc('os_link_abrir');
      E.d = d;
      if (d && d.ok !== false && E.nome && !E.entrou) {
        E.entrou = true;
        const d2 = await rpc('os_link_entrar', { p_nome: E.nome });
        if (d2) E.d = d2;
      }
      render();
    } catch (e) {
      console.error('[os-equipe] abrir', e);
      telaErro(/PGRST202|os_link_abrir/.test(String(e.code || e.message)) ? 'A plataforma ainda não está pronta para OS por link.' : 'Sem conexão. Confira a internet e abra o link de novo.');
    }
  }
  try {
    const escuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  } catch (_) { /* ignora */ }
  if (!TOKEN) telaErro('Link incompleto. Peça o link de novo para a gestão.');
  else carregar();
})();

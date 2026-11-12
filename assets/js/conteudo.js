// ==========================================================================
// CONTEÚDO — base dos ambientes Marketing (mkt.js) e Documentação (docs.js)
// --------------------------------------------------------------------------
// Arquivos: a lista fica na tabela conteudo_arquivos; o arquivo vai pro
// Cloudflare R2 (edge function conteudo-arquivos assina o link e o navegador
// envia/baixa direto). Enquanto o R2 não estiver configurado (sem os segredos
// R2_*), cai no bucket privado "conteudo" do Supabase. Imagem vira WebP aqui
// no navegador antes de subir (bem mais leve).
// Quem vê: quem tem a chave do ambiente no cadastro (user_accounts.mkt_enabled /
// docs_enabled, conferida no banco por conteudo_acesso). Admin vê e edita tudo.
// ==========================================================================
(function () {
  'use strict';
  const sb = () => supabaseClient;
  const CT = {};

  CT.PUBLICOS = [['gestor', 'Franqueados e gestores'], ['vendedor', 'Vendedores'], ['engenharia', 'Engenharia'], ['parceiro', 'Parceiros']];
  CT.esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  CT.ic = (n, cls) => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ''}></i>`;
  CT.icons = () => { if (typeof queueAppLucideCreateIcons === 'function') queueAppLucideCreateIcons(); else if (window.lucide) window.lucide.createIcons(); };
  CT.admin = () => !!state.isAdmin;
  CT.toast = (m) => { if (typeof showToast === 'function') showToast(m); };
  CT.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  CT.slug = (s) => CT.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'arquivo';
  CT.data = (iso) => { if (!iso) return ''; const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); };
  CT.dataCurta = (iso) => CT.data(iso).slice(0, 5);
  CT.tamanho = (b) => { const n = Number(b) || 0; if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'; return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB'; };
  CT.ext = (nome) => (String(nome || '').match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();
  CT.meuPublico = () => {
    const r = String(state.role || '').toLowerCase();
    if (state.isParceiro) return 'parceiro';
    if (r === 'gestor') return 'gestor';
    if (r === 'engenheiro' || r === 'coordenador_tecnico') return 'engenharia';
    return 'vendedor';
  };

  // ---------- armazenamento ----------
  let _r2 = null;
  async function r2Ativo() {
    if (_r2 !== null) return _r2;
    try {
      const { data, error } = await sb().functions.invoke('conteudo-arquivos', { body: { acao: 'status' } });
      _r2 = !error && !!(data && data.r2);
    } catch (_) { _r2 = false; }
    return _r2;
  }

  CT.carregarImg = (src) => new Promise((ok, falha) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('Não foi possível abrir a imagem'));
    img.src = src;
  });

  // Imagem → WebP (máx. `max` px no lado maior). Outros arquivos passam direto.
  CT.paraWebp = async (file, max = 2400, q = 0.9) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) return file;
    const url = URL.createObjectURL(file);
    try {
      const img = await CT.carregarImg(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
      if (!blob || blob.type !== 'image/webp' || (blob.size >= file.size && k === 1)) return file;
      return new File([blob], String(file.name || 'imagem').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
    } finally { URL.revokeObjectURL(url); }
  };

  // Envia e registra. Devolve a linha de conteudo_arquivos.
  CT.enviar = async (file, pasta) => {
    let provedor = null, caminho = null;
    if (await r2Ativo()) {
      const { data, error } = await sb().functions.invoke('conteudo-arquivos', { body: { acao: 'enviar', nome: file.name, pasta } });
      if (!error && data && data.url) {
        const put = await fetch(data.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
        if (!put.ok) throw new Error('Falha ao enviar o arquivo (' + put.status + ')');
        provedor = 'r2'; caminho = data.caminho;
      }
    }
    if (!provedor) {
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      const ext = CT.ext(file.name);
      caminho = `${pasta || 'geral'}/${id}-${CT.slug(String(file.name || '').replace(/\.[^.]+$/, ''))}${ext ? '.' + ext : ''}`;
      const { error } = await sb().storage.from('conteudo').upload(caminho, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      provedor = 'supabase';
    }
    const { data, error } = await sb().from('conteudo_arquivos')
      .insert({ provedor, caminho, nome: file.name || 'arquivo', mime: file.type || null, tamanho: file.size || null })
      .select('id, provedor, caminho, nome, mime, tamanho').single();
    if (error) throw error;
    CT._arq.set(data.id, data);
    return data;
  };

  CT._arq = new Map();
  CT.arquivos = async (ids) => {
    const faltam = [...new Set((ids || []).filter((id) => id && !CT._arq.has(id)))];
    if (faltam.length) {
      const { data } = await sb().from('conteudo_arquivos').select('id, provedor, caminho, nome, mime, tamanho').in('id', faltam);
      (data || []).forEach((a) => CT._arq.set(a.id, a));
    }
    return CT._arq;
  };

  const _urls = new Map();
  CT.url = async (arqOuId, opts) => {
    const download = !!(opts && opts.download);
    const arq = typeof arqOuId === 'string' ? (await CT.arquivos([arqOuId])).get(arqOuId) : arqOuId;
    if (!arq) return null;
    const chave = arq.id + (download ? ':d' : '');
    const c = _urls.get(chave);
    if (c && c.ate > Date.now()) return c.url;
    let url = null;
    if (arq.provedor === 'r2') {
      const { data, error } = await sb().functions.invoke('conteudo-arquivos', { body: { acao: 'baixar', id: arq.id, download } });
      if (!error && data && data.url) url = data.url;
    } else {
      const { data } = await sb().storage.from('conteudo').createSignedUrl(arq.caminho, 3600, download ? { download: arq.nome } : undefined);
      url = data && data.signedUrl;
    }
    if (url) _urls.set(chave, { url, ate: Date.now() + 50 * 60 * 1000 });
    return url;
  };

  // Imagem como objectURL (canvas não fica "sujo" e não depende de cabeçalho de cache)
  const _blobs = new Map();
  CT.imagem = async (arqId) => {
    if (_blobs.has(arqId)) return _blobs.get(arqId);
    const p = (async () => {
      const url = await CT.url(arqId);
      if (!url) throw new Error('Arquivo não encontrado');
      if (/^(blob|data):/.test(url)) return CT.carregarImg(url);
      const r = await fetch(url);
      if (!r.ok) throw new Error('Falha ao baixar a imagem');
      const obj = URL.createObjectURL(await r.blob());
      return CT.carregarImg(obj);
    })();
    _blobs.set(arqId, p);
    p.catch(() => _blobs.delete(arqId));
    return p;
  };

  // Baixa pela própria plataforma (o arquivo vem como blob): a pessoa não vê
  // o endereço do Cloudflare/Supabase nem abre aba nova. Se o navegador
  // bloquear, cai no link direto como antes.
  CT.baixarArquivo = async (arqId) => {
    const url = await CT.url(arqId, { download: true });
    if (!url) { CT.toast('Arquivo não encontrado.'); return false; }
    const arq = (await CT.arquivos([arqId])).get(arqId);
    try {
      CT.toast('Baixando…');
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      CT.baixarBlob(await r.blob(), (arq && arq.nome) || 'arquivo');
      return true;
    } catch (e) {
      console.warn('[conteudo] download direto', e);
    }
    const a = document.createElement('a');
    a.href = url; a.rel = 'noopener'; a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  };
  CT.baixarBlob = (blob, nome) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  CT.apagarArquivo = async (arqId) => {
    if (!arqId) return;
    const arq = (await CT.arquivos([arqId])).get(arqId);
    if (!arq) return;
    try {
      if (arq.provedor === 'r2') await sb().functions.invoke('conteudo-arquivos', { body: { acao: 'apagar', id: arq.id } });
      else await sb().storage.from('conteudo').remove([arq.caminho]);
    } catch (_) { /* o registro sai mesmo assim */ }
    await sb().from('conteudo_arquivos').delete().eq('id', arq.id);
    CT._arq.delete(arq.id);
  };

  // ---------- vídeo (YouTube) ----------
  CT.youtubeId = (url) => {
    const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  };
  CT.youtubeCapa = (url) => { const id = CT.youtubeId(url); return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : ''; };
  CT.youtubeEmbed = (url) => { const id = CT.youtubeId(url); return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : ''; };

  // ---------- HTML dos documentos (só admin escreve, mas limpa mesmo assim) ----------
  CT.limparHTML = (html) => {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form, input, textarea, select').forEach((e) => e.remove());
    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        const n = a.name.toLowerCase(), v = String(a.value || '');
        if (n.startsWith('on')) el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'src') && /^\s*(javascript|data:text)/i.test(v)) el.removeAttribute(a.name);
        else if (n === 'style') el.removeAttribute(a.name);
      });
    });
    return doc.body.firstChild.innerHTML;
  };

  // ---------- quem vê ----------
  CT.quemVeHTML = (sel, nome) => `<div class="ct-checks">${CT.PUBLICOS.map(([k, n]) =>
    `<label><input type="checkbox" name="${nome || 'publico'}" value="${k}" ${(sel || []).includes(k) ? 'checked' : ''}> ${n}</label>`).join('')}</div>`;
  CT.lerQuemVe = (root, nome) => [...root.querySelectorAll(`input[name="${nome || 'publico'}"]:checked`)].map((i) => i.value);

  // ---------- dados da unidade (artes) ----------
  let _uni = null;
  CT.unidade = async () => {
    if (_uni) return _uni;
    let f = null;
    if (state.franquiaId) {
      const { data } = await sb().from('franquias').select('nome, telefone, cidade, uf').eq('id', state.franquiaId).maybeSingle();
      f = data;
    }
    const tel = (f && f.telefone) || (state.profile && state.profile.telefone) || '';
    _uni = {
      unidade: (f && f.nome) || state.franquiaNome || 'Ágil Solar',
      whats: CT.formatarTelefone(tel),
      cidade: f && f.cidade ? f.cidade + (f.uf ? '/' + f.uf : '') : '',
    };
    return _uni;
  };
  CT.formatarTelefone = (t) => {
    const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(t || '');
  };

  // ---------- janela (modal) ----------
  CT.modal = (html, opts) => {
    CT.fecharModal();
    const s = document.createElement('div');
    s.className = 'ct-scrim';
    s.id = 'ct-scrim';
    s.innerHTML = `<div class="ct-modal${opts && opts.largo ? ' largo' : ''}" role="dialog">${html}</div>`;
    s.addEventListener('mousedown', (e) => { if (e.target === s) CT.fecharModal(); });
    document.body.appendChild(s);
    document.addEventListener('keydown', escFecha);
    CT.icons();
    return s.firstChild;
  };
  function escFecha(e) { if (e.key === 'Escape') CT.fecharModal(); }
  CT.fecharModal = () => {
    const s = document.getElementById('ct-scrim');
    if (s) s.remove();
    document.removeEventListener('keydown', escFecha);
  };
  CT.confirmar = (titulo, texto, botao) => new Promise((ok) => {
    const m = CT.modal(`<div class="ct-mh"><div><h3>${CT.esc(titulo)}</h3><p>${CT.esc(texto)}</p></div></div>
      <div class="ct-mf"><button class="ct-btn gh" data-r="0">Cancelar</button><button class="ct-btn perigo" data-r="1">${CT.esc(botao || 'Confirmar')}</button></div>`);
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; CT.fecharModal(); ok(b.dataset.r === '1'); });
  });

  // Título e subtítulo na barra de cima do visual novo
  CT.meta = (key, title, sub) => {
    window.uiV2PageMeta = { key, title, sub: sub || '' };
    if (window.uiV2Shell) window.uiV2Shell.refresh();
  };

  CT.vazio = (icone, titulo, texto, extra) => `<div class="ct-vazio">${CT.ic(icone)}<b>${CT.esc(titulo)}</b><span>${texto || ''}</span>${extra || ''}</div>`;
  CT.carregando = () => '<div class="ct-vazio">' + CT.ic('loader-circle', 'ct-gira') + '<span>Carregando…</span></div>';

  window.CT = CT;
})();

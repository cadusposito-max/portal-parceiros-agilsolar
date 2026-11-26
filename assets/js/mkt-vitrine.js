// ==========================================================================
// MARKETING → VITRINE DA PROPOSTA (só admin)
// --------------------------------------------------------------------------
// O que aparece nas propostas de cada unidade:
//   obras  — 3 obras com foto + depoimento (página "Quem somos" do PDF)
//   videos — vídeos do YouTube ("Conheça o nosso trabalho" da proposta online)
// Tabela proposta_vitrine: franquia_id NULL = padrão da rede; unidade sem
// linha própria usa o padrão (get_public_proposta devolve a certa).
// Fotos vão pro bucket público "proposta-vitrine" (o link abre sem login).
// ==========================================================================
(function () {
  'use strict';
  const CT = window.CT;
  const sb = () => supabaseClient;
  const { esc, ic } = CT;
  const BUCKET = 'proposta-vitrine';
  const MAX_NOME = 40, MAX_TEXTO = 170;

  const V = { container: null, franquias: null, linhas: null, sel: 'rede', erro: null, carregando: null, ocupado: false };
  const chave = (fid) => fid || 'rede';
  const linha = () => (V.linhas || {})[V.sel] || null;
  const padrao = () => (V.linhas || {}).rede || null;

  async function carregar(forcar) {
    if (V.linhas && !forcar) return;
    if (V.carregando) return V.carregando;
    V.carregando = (async () => {
      const [fr, vt] = await Promise.all([
        sb().from('franquias').select('id, nome, ativo').order('nome'),
        sb().from('proposta_vitrine').select('*'),
      ]);
      if (vt.error) throw vt.error;
      if (fr.error) throw fr.error;
      V.franquias = (fr.data || []).filter((f) => f.ativo !== false);
      V.linhas = {};
      (vt.data || []).forEach((r) => { V.linhas[chave(r.franquia_id)] = r; });
      V.erro = null;
    })().catch((e) => { V.erro = e; }).finally(() => { V.carregando = null; });
    return V.carregando;
  }

  function meta() {
    CT.meta('marketing:vitrine', 'Vitrine da proposta', 'Obras e vídeos que aparecem nas propostas de cada unidade');
  }

  async function render(container) {
    V.container = container;
    meta();
    if (!V.linhas) {
      container.innerHTML = CT.carregando();
      CT.icons();
      await carregar();
    }
    pintar();
  }

  function aqui() { return state.environment === 'marketing' && state.mktActiveTab === 'vitrine' && V.container; }

  function pintar() {
    if (!aqui()) return;
    meta();
    let html;
    if (V.erro) {
      const semTabela = /proposta_vitrine|relation|does not exist|schema cache/i.test(String(V.erro.message || V.erro));
      html = CT.vazio('triangle-alert', semTabela ? 'A vitrine ainda não foi ativada no banco' : 'Não deu pra carregar a vitrine',
        semTabela ? 'Falta rodar a migration 20261126120000_proposta_vitrine.sql no Supabase.' : esc(V.erro.message || 'Verifique a internet e tente de novo.'),
        `<button class="ct-btn gh" data-vt="recarregar">${ic('rotate-cw')}Tentar de novo</button>`);
    } else {
      html = vTopo() + vCorpo();
    }
    V.container.innerHTML = `<div class="ct-root" id="vt-root">${html}</div>`;
    ligar(V.container.firstChild);
    CT.icons();
  }

  // ------------------------------------------------------------ telas
  function vTopo() {
    const opts = [`<option value="rede" ${V.sel === 'rede' ? 'selected' : ''}>Padrão da rede (todas)</option>`]
      .concat((V.franquias || []).map((f) => `<option value="${esc(f.id)}" ${V.sel === f.id ? 'selected' : ''}>${esc(f.nome)}${V.linhas[f.id] ? ' · própria' : ''}</option>`));
    return `<div class="vt-topo"><label class="vt-uni"><span>Unidade</span><select class="ct-inp" data-vt-sel>${opts.join('')}</select></label></div>`;
  }

  function vCorpo() {
    if (V.sel === 'rede') {
      const r = padrao();
      return `<p class="ct-note vt-aviso">${ic('info')}<span>Vale para toda unidade que não tiver vitrine própria.</span></p>` + (r ? vEdicao(r) : vSemPadrao());
    }
    const r = linha();
    if (!r) {
      return `<div class="ct-vazio">${ic('store')}<b>Esta unidade usa o padrão da rede</b><span>As propostas dela mostram as mesmas obras e vídeos das outras.</span>
        <button class="ct-btn or" data-vt="personalizar">${ic('pencil')}Personalizar esta unidade</button>
        <small class="vt-mini">Começa com uma cópia do padrão pra você trocar só o que quiser</small></div>`;
    }
    return `<div class="mk-dcard vt-propria"><span class="vt-chip">${ic('badge-check')}Vitrine própria</span><span class="sub">As propostas desta unidade usam isto</span>
        <button class="ct-btn gh" data-vt="voltar-padrao">${ic('undo-2')}Voltar ao padrão</button></div>` + vEdicao(r);
  }

  function vSemPadrao() {
    return CT.vazio('images', 'Sem padrão da rede', 'As propostas estão usando as obras e vídeos de antes.',
      `<button class="ct-btn or" data-vt="criar-padrao">${ic('plus')}Criar o padrão</button>`);
  }

  function vEdicao(r) {
    const obras = Array.isArray(r.obras) ? r.obras : [];
    const videos = Array.isArray(r.videos) ? r.videos : [];
    const slots = [0, 1, 2].map((i) => {
      const o = obras[i];
      if (!o) return `<button class="vt-obra vazia" data-vt="obra" data-i="${i}">${ic('image-plus')}<b>Adicionar obra</b><small>Vazio, o PDF usa uma obra padrão</small></button>`;
      return `<div class="vt-obra"><div class="ft" style="background-image:url(&quot;${esc(String(o.foto || '').replace(/["\\]/g, ''))}&quot;)"></div>
        <div class="vt-depo"><div class="estrelas">★★★★★</div><b>${esc(o.nome)}</b><p>“${esc(o.texto)}”</p></div>
        <div class="vt-acts"><button class="ct-btn gh" data-vt="obra" data-i="${i}">${ic('pencil')}Editar</button><button class="ct-btn gh ic" data-vt="obra-del" data-i="${i}" title="Remover">${ic('trash-2')}</button></div></div>`;
    }).join('');
    const vids = videos.length ? videos.map((v, i) => `<div class="vt-vid">
        <img src="${esc(CT.youtubeCapa(v.url))}" alt="" loading="lazy">
        <div class="tx"><b>${esc(v.titulo || 'Vídeo ' + (i + 1))}</b><small>${esc(v.url)}</small></div>
        <button class="ct-btn gh ic" data-vt="vid-sobe" data-i="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>${ic('arrow-up')}</button>
        <button class="ct-btn gh ic" data-vt="vid-desce" data-i="${i}" title="Descer" ${i === videos.length - 1 ? 'disabled' : ''}>${ic('arrow-down')}</button>
        <button class="ct-btn gh ic" data-vt="vid-del" data-i="${i}" title="Remover">${ic('trash-2')}</button></div>`).join('')
      : `<div class="ct-dica">Sem vídeos: o bloco "Conheça o nosso trabalho" não aparece na proposta online.</div>`;
    return `<section class="mk-dcard"><h3>${ic('images')}Obras com depoimento<span class="vt-conta">${Math.min(obras.length, 3)} de 3</span></h3>
        <p class="sub">Página "Quem somos" do PDF · sempre 3 obras</p>
        <div class="vt-obras">${slots}</div></section>
      <section class="mk-dcard"><h3>${ic('youtube')}Vídeos<button class="ct-btn or vt-add" data-vt="vid-add">${ic('plus')}Vídeo</button></h3>
        <p class="sub">"Conheça o nosso trabalho" da proposta online · na ordem da lista</p>
        <div class="vt-vids">${vids}</div></section>`;
  }

  // ------------------------------------------------------------ gravar
  async function salvar(campos) {
    const r = V.sel === 'rede' ? padrao() : linha();
    if (!r) return false;
    const { data, error } = await sb().from('proposta_vitrine').update({ ...campos, updated_at: new Date().toISOString(), updated_by: state.currentUser && state.currentUser.id })
      .eq('id', r.id).select().single();
    if (error) { CT.toast('Não deu pra salvar: ' + error.message); return false; }
    V.linhas[chave(data.franquia_id)] = data;
    return true;
  }

  async function criarLinha(fid) {
    const base = padrao();
    const { data, error } = await sb().from('proposta_vitrine').insert({
      franquia_id: fid || null,
      obras: base ? base.obras : [],
      videos: base ? base.videos : [],
    }).select().single();
    if (error) { CT.toast('Não deu pra criar: ' + error.message); return; }
    V.linhas[chave(data.franquia_id)] = data;
  }

  // Foto que subiu por aqui (bucket da vitrine) e ninguém mais usa: apaga.
  function caminhoNoBucket(url) {
    const m = String(url || '').match(new RegExp('/storage/v1/object/public/' + BUCKET + '/(.+)$'));
    return m ? decodeURIComponent(m[1].split('?')[0]) : null;
  }
  async function apagarFotoSeSobrou(url) {
    const cam = caminhoNoBucket(url);
    if (!cam) return;
    const usada = Object.values(V.linhas || {}).some((r) => (r.obras || []).some((o) => o && o.foto === url));
    if (usada) return;
    try { await sb().storage.from(BUCKET).remove([cam]); } catch (_) { /* fica no bucket, sem problema */ }
  }

  async function subirFoto(file) {
    const leve = await CT.paraWebp(file, 1400, 0.85);
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const ext = CT.ext(leve.name) || 'jpg';
    const caminho = `${V.sel}/${id}.${ext}`;
    const { error } = await sb().storage.from(BUCKET).upload(caminho, leve, { contentType: leve.type || 'image/jpeg', upsert: false, cacheControl: '31536000' });
    if (error) throw error;
    return sb().storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }

  // ------------------------------------------------------------ janelas
  function abrirObra(i) {
    const r = V.sel === 'rede' ? padrao() : linha();
    if (!r) return;
    const atual = (r.obras || [])[i] || null;
    const S = { file: null, prev: atual ? atual.foto : null };
    const m = CT.modal('');
    const desenha = () => {
      const val = (n, d) => { const el = m.querySelector(`[name="${n}"]`); return el ? el.value : d; };
      const nome = val('nome', atual ? atual.nome : ''), texto = val('texto', atual ? atual.texto : '');
      m.innerHTML = `<div class="ct-mh"><div><h3>${atual ? 'Editar obra' : 'Adicionar obra'}</h3><p>Aparece na página "Quem somos" do PDF</p></div><button class="ct-x" data-o="fechar">${ic('x')}</button></div>
        <button class="ct-drop ${S.prev ? 'has' : ''}" data-o="foto">${S.prev ? `<img src="${esc(S.prev)}" alt="">` : ic('upload')}
          <b>${S.file ? esc(S.file.name) : S.prev ? 'Foto da obra' : 'Escolher foto'}</b><small>${S.prev ? 'Clique pra trocar' : 'JPG ou PNG, de preferência em pé (retrato)'}</small></button>
        <div class="ct-fld"><label>Cliente / obra <span class="cnt" data-cnt="nome">${nome.length}/${MAX_NOME}</span></label><input class="ct-inp" name="nome" maxlength="${MAX_NOME}" value="${esc(nome)}" placeholder="Ex.: Mercado Bom Preço · comercial"></div>
        <div class="ct-fld"><label>Depoimento <span class="cnt" data-cnt="texto">${texto.length}/${MAX_TEXTO}</span></label><textarea class="ct-inp vt-txt" name="texto" maxlength="${MAX_TEXTO}" rows="3" placeholder="Ex.: Pagávamos R$ 1.200 e hoje só a taxa mínima.">${esc(texto)}</textarea></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-o-file>
        <div class="ct-mf"><button class="ct-btn gh" data-o="fechar">Cancelar</button><button class="ct-btn or" data-o="ok">Salvar</button></div>`;
      CT.icons();
    };
    desenha();
    m.addEventListener('input', (e) => {
      const n = e.target.name, c = n && m.querySelector(`[data-cnt="${n}"]`);
      if (c) c.textContent = `${e.target.value.length}/${n === 'nome' ? MAX_NOME : MAX_TEXTO}`;
    });
    m.addEventListener('change', (e) => {
      if (!e.target.matches('[data-o-file]')) return;
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) { CT.toast('Use uma foto JPG, PNG ou WebP.'); return; }
      S.file = f; S.prev = URL.createObjectURL(f);
      desenha();
    });
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      if (b.dataset.o === 'fechar') { CT.fecharModal(); return; }
      if (b.dataset.o === 'foto') { m.querySelector('[data-o-file]').click(); return; }
      if (b.dataset.o !== 'ok' || V.ocupado) return;
      const nome = m.querySelector('[name="nome"]').value.trim();
      const texto = m.querySelector('[name="texto"]').value.trim();
      if (!S.file && !(atual && atual.foto)) { CT.toast('Escolha a foto da obra.'); return; }
      if (!nome) { CT.toast('Escreva o nome do cliente ou da obra.'); return; }
      if (!texto) { CT.toast('Escreva o depoimento.'); return; }
      V.ocupado = true; b.disabled = true; b.textContent = S.file ? 'Enviando foto…' : 'Salvando…';
      try {
        const fotoAntiga = atual ? atual.foto : null;
        const foto = S.file ? await subirFoto(S.file) : atual.foto;
        const obras = [...(r.obras || [])];
        while (obras.length < i) obras.push(null);
        obras[i] = { nome, texto, foto };
        const ok = await salvar({ obras: obras.filter(Boolean) });
        if (ok) {
          CT.fecharModal();
          CT.toast('Obra salva');
          if (S.file && fotoAntiga && fotoAntiga !== foto) apagarFotoSeSobrou(fotoAntiga);
          pintar();
        }
      } catch (err) {
        CT.toast('Não deu pra enviar a foto: ' + (err.message || err));
      } finally {
        V.ocupado = false;
        if (document.body.contains(b)) { b.disabled = false; b.textContent = 'Salvar'; }
      }
    });
  }

  function abrirVideo() {
    const m = CT.modal(`<div class="ct-mh"><div><h3>Adicionar vídeo</h3><p>Entra no fim da lista da proposta online</p></div><button class="ct-x" data-o="fechar">${ic('x')}</button></div>
      <div class="ct-fld"><label>Link do vídeo no YouTube</label><input class="ct-inp" name="url" placeholder="https://youtu.be/…"></div>
      <div class="ct-fld"><label>Nome (só pra você achar aqui)</label><input class="ct-inp" name="titulo" maxlength="60" placeholder="Ex.: Obra Mercado Bom Preço"></div>
      <p class="ct-note">${ic('info')}<span>O vídeo precisa estar <b>público</b> ou <b>não listado</b> no YouTube.</span></p>
      <div class="ct-mf"><button class="ct-btn gh" data-o="fechar">Cancelar</button><button class="ct-btn or" data-o="ok">Adicionar</button></div>`);
    setTimeout(() => { const i = m.querySelector('[name="url"]'); if (i) i.focus(); }, 30);
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      if (b.dataset.o === 'fechar') { CT.fecharModal(); return; }
      if (V.ocupado) return;
      const url = m.querySelector('[name="url"]').value.trim();
      const vid = CT.youtubeId(url);
      if (!vid) { CT.toast('Cole um link do YouTube válido.'); return; }
      const r = V.sel === 'rede' ? padrao() : linha();
      const titulo = m.querySelector('[name="titulo"]').value.trim() || 'Vídeo ' + ((r.videos || []).length + 1);
      V.ocupado = true; b.disabled = true;
      const ok = await salvar({ videos: [...(r.videos || []), { url: 'https://www.youtube.com/watch?v=' + vid, titulo }] });
      V.ocupado = false; b.disabled = false;
      if (ok) { CT.fecharModal(); CT.toast('Vídeo adicionado'); pintar(); }
    });
  }

  // ------------------------------------------------------------ cliques
  function ligar(root) {
    if (!root) return;
    const sel = root.querySelector('[data-vt-sel]');
    if (sel) sel.addEventListener('change', () => { V.sel = sel.value; pintar(); });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-vt]');
      if (!b || V.ocupado) return;
      const a = b.dataset.vt, i = Number(b.dataset.i);
      const r = V.sel === 'rede' ? padrao() : linha();
      switch (a) {
        case 'recarregar': V.linhas = null; V.erro = null; render(V.container); break;
        case 'personalizar':
        case 'criar-padrao':
          V.ocupado = true; b.disabled = true;
          await criarLinha(a === 'criar-padrao' ? null : V.sel);
          V.ocupado = false; pintar(); break;
        case 'voltar-padrao': {
          if (!r) return;
          const nome = ((V.franquias || []).find((f) => f.id === V.sel) || {}).nome || 'esta unidade';
          const ok = await CT.confirmar('Voltar ao padrão?', `As propostas de ${nome} passam a mostrar as obras e vídeos do padrão da rede. A vitrine própria dela é apagada.`, 'Voltar ao padrão');
          if (!ok) return;
          V.ocupado = true;
          const { error } = await sb().from('proposta_vitrine').delete().eq('id', r.id);
          V.ocupado = false;
          if (error) { CT.toast('Não deu: ' + error.message); return; }
          delete V.linhas[V.sel];
          (r.obras || []).forEach((o) => o && apagarFotoSeSobrou(o.foto));
          CT.toast('Unidade voltou ao padrão');
          pintar(); break;
        }
        case 'obra': abrirObra(i); break;
        case 'obra-del': {
          if (!r) return;
          const o = (r.obras || [])[i];
          const ok = await CT.confirmar('Remover esta obra?', 'No lugar dela, o PDF mostra uma obra padrão.', 'Remover');
          if (!ok) return;
          V.ocupado = true;
          const salvo = await salvar({ obras: (r.obras || []).filter((_, k) => k !== i) });
          V.ocupado = false;
          if (salvo && o) apagarFotoSeSobrou(o.foto);
          pintar(); break;
        }
        case 'vid-add': abrirVideo(); break;
        case 'vid-sobe':
        case 'vid-desce': {
          if (!r) return;
          const l = [...(r.videos || [])], j = a === 'vid-sobe' ? i - 1 : i + 1;
          if (j < 0 || j >= l.length) return;
          [l[i], l[j]] = [l[j], l[i]];
          V.ocupado = true; await salvar({ videos: l }); V.ocupado = false; pintar(); break;
        }
        case 'vid-del': {
          if (!r) return;
          const ok = await CT.confirmar('Remover este vídeo?', 'Ele sai da proposta online desta vitrine.', 'Remover');
          if (!ok) return;
          V.ocupado = true; await salvar({ videos: (r.videos || []).filter((_, k) => k !== i) }); V.ocupado = false; pintar(); break;
        }
        default: break;
      }
    });
  }

  window.MktVitrine = { render };
})();

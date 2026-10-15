-- Estruturas (tipo de telhado) no orçamento do catálogo completo.
-- Levantamento na Helte em 15/10/2026 (13 estruturas, 22 combinações, conferido em 7 cotações).
-- Telhado: a estrutura vem em blocos de 4 placas + no máximo 1 bloco de 2, contando a próxima
-- quantidade PAR de placas (o kit continua com as placas exatas; só a estrutura é dimensionada assim).
-- Solo: 1 mesa a cada N placas.
-- O custo cadastrado dos kits (produtos_custo.detalhe.pecas) já inclui a estrutura padrão do
-- tamanho do módulo (cerâmico Standard; cerâmico Smart no 710W). Trocar a estrutura = tirar a
-- padrão e pôr a escolhida, e o frete da unidade é recalculado sobre as peças.
-- Promocionais NÃO entram: preço tabelado, sempre com a estrutura padrão.

create table if not exists public.estruturas (
  id text primary key,
  distribuidora_id uuid not null references public.distribuidoras(id) on delete cascade,
  telhado text not null,          -- chave do telhado (ceramico, fibro_metal, ..., solo)
  telhado_nome text not null,
  linha text not null,            -- standard | flex | smart | pratyc
  tamanho smallint not null,      -- tamanho do módulo na distribuidora: 1 = até ~620 W, 2 = 700 W+
  modo text not null check (modo in ('blocos', 'mesa')),
  custo_bloco4 numeric,
  custo_bloco2 numeric,
  placas_mesa integer,
  custo_mesa numeric,
  padrao boolean not null default false,
  ativo boolean not null default true,
  ordem integer not null default 0,
  detalhe jsonb,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists estruturas_padrao_tamanho on public.estruturas (distribuidora_id, tamanho) where padrao;

alter table public.estruturas enable row level security;
drop policy if exists estruturas_admin on public.estruturas;
create policy estruturas_admin on public.estruturas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.estruturas to authenticated;

insert into public.estruturas (id, distribuidora_id, telhado, telhado_nome, linha, tamanho, modo, custo_bloco4, custo_bloco2, placas_mesa, custo_mesa, padrao, ordem, detalhe)
select v.id, '23a51365-a37f-444c-9c45-22645515f2cc', v.telhado, v.nome, v.linha, v.tam, v.modo, v.b4, v.b2, v.pm, v.cm, v.padrao, v.ordem, v.det::jsonb
from (values
  ('helte_ceramico_standard_1',   'ceramico',        'Cerâmico / colonial',                 'standard', 1, 'blocos', 314.19, 162.00, null, null, true,  10, '{"helte":[1,27],"pecas":"fix. 4 135,63 · fix. 2 72,71 · perfil 2,40 m 44,64 (4 e 2)"}'),
  ('helte_ceramico_flex_1',       'ceramico',        'Cerâmico / colonial',                 'flex',     1, 'blocos', 376.51, 166.46, null, null, false, 11, '{"helte":[1,46],"pecas":"fix. 4 154,11 · fix. 2 55,26 · perfil Flex 55,60 (4 e 2)"}'),
  ('helte_ceramico_smart_2',      'ceramico',        'Cerâmico / colonial',                 'smart',    2, 'blocos', 335.00, 172.50, null, null, true,  12, '{"helte":[1,77],"pecas":"fix. 4 135,00 · fix. 2 72,50 · perfil Smart 1,37 m 25,00 (8 e 4)"}'),
  ('helte_fibro_metal_standard_1','fibro_metal',     'Fibrocimento · estrutura metálica',   'standard', 1, 'blocos', 253.96, 131.81, null, null, false, 20, '{"helte":[6,27],"pecas":"fix. 4 75,40 · fix. 2 42,53 · perfil 44,64 (4 e 2)"}'),
  ('helte_fibro_metal_flex_1',    'fibro_metal',     'Fibrocimento · estrutura metálica',   'flex',     1, 'blocos', 320.88, 168.21, null, null, false, 21, '{"helte":[6,46],"pecas":"fix. 4 98,48 · fix. 2 57,01 · perfil Flex 55,60 (4 e 2)"}'),
  ('helte_fibro_metal_smart_2',   'fibro_metal',     'Fibrocimento · estrutura metálica',   'smart',    2, 'blocos', 313.75, 156.25, null, null, false, 22, '{"helte":[6,77],"pecas":"fix. 4 113,75 · fix. 2 56,25 · perfil Smart 25,00 (8 e 4)"}'),
  ('helte_fibro_madeira_standard_1','fibro_madeira', 'Fibrocimento · estrutura de madeira', 'standard', 1, 'blocos', 279.47, 144.62, null, null, false, 30, '{"helte":[5,27],"pecas":"fix. 4 100,91 · fix. 2 55,34 · perfil 44,64 (4 e 2)"}'),
  ('helte_fibro_madeira_flex_1',  'fibro_madeira',   'Fibrocimento · estrutura de madeira', 'flex',     1, 'blocos', 346.39, 179.21, null, null, false, 31, '{"helte":[5,46],"pecas":"fix. 4 123,99 · fix. 2 68,01 · perfil Flex 55,60 (4 e 2)"}'),
  ('helte_fibro_madeira_smart_2', 'fibro_madeira',   'Fibrocimento · estrutura de madeira', 'smart',    2, 'blocos', 301.25, 155.00, null, null, false, 32, '{"helte":[5,77],"pecas":"fix. 4 101,25 · fix. 2 55,00 · perfil Smart 25,00 (8 e 4)"}'),
  ('helte_trapezoidal_standard_1','trapezoidal',     'Metálico trapezoidal',                'standard', 1, 'blocos', 242.86, 125.08, null, null, false, 40, '{"helte":[3,27],"pecas":"fix. 4 64,30 · fix. 2 35,80 · perfil 44,64 (4 e 2)"}'),
  ('helte_trapezoidal_flex_1',    'trapezoidal',     'Metálico trapezoidal',                'flex',     1, 'blocos', 291.53, 151.73, null, null, false, 41, '{"helte":[3,46],"pecas":"fix. 4 69,13 · fix. 2 40,53 · perfil Flex 55,60 (4 e 2)"}'),
  ('helte_mini_trilho_standard_1','mini_trilho',     'Metálico · mini trilho',              'standard', 1, 'blocos', 113.33, 70.76,  null, null, false, 50, '{"helte":[17,27],"pecas":"fix. 4 27,83 · fix. 2 19,46 · perfil plano 35 cm 8,55 (10 e 6)"}'),
  ('helte_mini_trilho_smart_2',   'mini_trilho',     'Metálico · mini trilho',              'smart',    2, 'blocos', 153.00, 95.48,  null, null, false, 51, '{"helte":[4,77],"pecas":"fix. 4 28,00 · fix. 2 20,48 · perfil Smart 55 cm 12,50 (10 e 6)"}'),
  ('helte_mini_trilho_alto_standard_1','mini_trilho_alto','Metálico · mini trilho alto',    'standard', 1, 'blocos', 220.53, 134.46, null, null, false, 60, '{"helte":[16,27],"pecas":"kit mini trilho alto 4 220,53 · 2 134,46"}'),
  ('helte_mini_trilho_alto_smart_2','mini_trilho_alto','Metálico · mini trilho alto',       'smart',    2, 'blocos', 254.00, 156.00, null, null, false, 61, '{"helte":[18,77],"pecas":"kit mini trilho alto 4 254,00 · 2 156,00"}'),
  ('helte_kalhetao_standard_1',   'kalhetao',        'Kalhetão',                            'standard', 1, 'blocos', 310.40, 159.06, null, null, false, 70, '{"helte":[7,27],"pecas":"fix. 4 131,84 · fix. 2 69,78 · perfil 44,64 (4 e 2)","obs":"Kalhetão Flex fora: Helte cobrava R$ 0 nas fixações em 15/10/2026"}'),
  ('helte_shingle_standard_1',    'shingle',         'Shingle',                             'standard', 1, 'blocos', 311.29, 158.26, null, null, false, 80, '{"helte":[9,27],"pecas":"fix. 4 132,73 · fix. 2 68,98 · perfil 44,64 (4 e 2)"}'),
  ('helte_shingle_flex_1',        'shingle',         'Shingle',                             'flex',     1, 'blocos', 363.37, 185.96, null, null, false, 81, '{"helte":[9,46],"pecas":"fix. 4 140,97 · fix. 2 74,76 · perfil Flex 55,60 (4 e 2)"}'),
  ('helte_laje_standard_1',       'laje',            'Laje',                                'standard', 1, 'blocos', 630.77, 396.49, null, null, false, 90, '{"helte":[8,27],"pecas":"fix. 4 39,71 · fix. 2 32,21 · perfil 44,64 (4 e 2) · triângulo L 137,50 (3 e 2)"}'),
  ('helte_solo_pratyc_1',         'solo',            'Solo',                                'pratyc',   1, 'mesa',   null,   null,   8,    1500.00, false, 100, '{"helte":[11,53],"pecas":"mesa Pratyc 2 linhas 8 módulos 1.500,00"}'),
  ('helte_solo_pratyc_2',         'solo',            'Solo',                                'pratyc',   2, 'mesa',   null,   null,   6,    1341.46, false, 101, '{"helte":[11,53],"pecas":"mesa Pratyc 6 módulos (700 W) 1.341,46"}')
) as v(id, telhado, nome, linha, tam, modo, b4, b2, pm, cm, padrao, ordem, det)
on conflict (id) do update set telhado = excluded.telhado, telhado_nome = excluded.telhado_nome, linha = excluded.linha,
  tamanho = excluded.tamanho, modo = excluded.modo, custo_bloco4 = excluded.custo_bloco4, custo_bloco2 = excluded.custo_bloco2,
  placas_mesa = excluded.placas_mesa, custo_mesa = excluded.custo_mesa, padrao = excluded.padrao, ordem = excluded.ordem,
  detalhe = excluded.detalhe, atualizado_em = now();

-- Tamanho do módulo para a estrutura (Helte: 710 W = 2; até 620 W = 1).
update public.componentes set ficha = coalesce(ficha, '{}'::jsonb) || jsonb_build_object('tamanho_estrutura', case when potencia_wp >= 700 then 2 else 1 end)
 where tipo = 'modulo' and id in ('c799745d-2d85-46e0-b7da-24a40fdb6868', 'dffc81b2-d203-4f6d-8b61-57cd822461a0',
                                  '4a7f1549-9510-4475-ad9b-b8cafb6ce316', '8623e833-03d7-4b46-9c79-3a3a62003e53');

create or replace function private.cc_tamanho_modulo(p_componente_id uuid)
returns smallint language sql stable set search_path to '' as $function$
  select coalesce((c.ficha->>'tamanho_estrutura')::smallint, case when c.potencia_wp >= 700 then 2 else 1 end)::smallint
    from public.componentes c where c.id = p_componente_id
$function$;

-- Custo da estrutura para n placas.
create or replace function private.cc_custo_estrutura(p_estrutura_id text, p_placas integer)
returns numeric language plpgsql stable set search_path to '' as $function$
declare e public.estruturas%rowtype; par integer;
begin
  select * into e from public.estruturas where id = p_estrutura_id;
  if not found or coalesce(p_placas, 0) <= 0 then return null; end if;
  if e.modo = 'mesa' then return round(ceil(p_placas::numeric / e.placas_mesa) * e.custo_mesa, 2); end if;
  par := 2 * ceil(p_placas / 2.0)::integer;
  return round((par / 4) * e.custo_bloco4 + ((par % 4) / 2) * e.custo_bloco2, 2);
end $function$;

-- Custo do kit para a unidade, com a estrutura escolhida (null = a padrão já cadastrada).
drop function if exists private.cc_custo_kit(uuid, uuid);
create or replace function private.cc_custo_kit(p_produto_id uuid, p_franquia_id uuid, p_estrutura_id text default null)
returns numeric
language plpgsql
stable security definer
set search_path to ''
as $function$
declare pr public.produtos%rowtype; c public.produtos_custo%rowtype; f public.frete_regra_unidade%rowtype;
        e public.estruturas%rowtype; pecas numeric; tam smallint; padrao text;
begin
  select * into pr from public.produtos where id = p_produto_id;
  if not found then return null; end if;
  select * into c from public.produtos_custo where produto_id = pr.id;
  if not found and pr.modulo_id is not null and pr.inversor_id is not null then
    select pc.* into c from public.produtos p2 join public.produtos_custo pc on pc.produto_id = p2.id
     where p2.modulo_id = pr.modulo_id and p2.modulo_qtd = pr.modulo_qtd
       and p2.inversor_id = pr.inversor_id and p2.inversor_qtd = pr.inversor_qtd
       and coalesce(p2.linha, 'catalogo') = 'catalogo' and p2.ativo
       and (pr.distribuidora_id is null or p2.distribuidora_id = pr.distribuidora_id)
     order by pc.atualizado_em desc limit 1;
  end if;
  if c.custo is null then return null; end if;
  pecas := nullif(c.detalhe->>'pecas', '')::numeric;

  if p_estrutura_id is not null then
    select * into e from public.estruturas where id = p_estrutura_id and ativo;
    if not found or pecas is null or e.distribuidora_id is distinct from pr.distribuidora_id then return null; end if;
    tam := private.cc_tamanho_modulo(pr.modulo_id);
    if e.tamanho <> tam then return null; end if;
    select id into padrao from public.estruturas where distribuidora_id = e.distribuidora_id and tamanho = tam and padrao;
    if padrao is null then return null; end if;
    if padrao <> e.id then
      pecas := round(pecas - private.cc_custo_estrutura(padrao, pr.modulo_qtd) + private.cc_custo_estrutura(e.id, pr.modulo_qtd), 2);
    end if;
  end if;

  if pecas is null then return c.custo; end if;
  if p_franquia_id is null then
    if p_estrutura_id is null then return c.custo; end if;
    return round(pecas + case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end, 2);
  end if;
  select * into f from public.frete_regra_unidade
   where franquia_id = p_franquia_id and distribuidora_id = pr.distribuidora_id;
  if not found then
    if p_estrutura_id is null then return c.custo; end if;
    return round(pecas + case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end, 2);
  end if;
  return round(pecas + case when pecas < f.limite then greatest(f.minimo_ate, pecas * f.pct_ate)
                            else greatest(f.minimo_acima, pecas * f.pct_acima) end, 2);
end $function$;

-- Preço do kit na unidade com a estrutura. Markup: preço da unidade + diferença da regra
-- entre o custo com a estrutura e o custo padrão. Custos + margem: centro de custo da unidade.
create or replace function private.cc_preco_kit_estrutura(p_produto_id uuid, p_franquia_id uuid, p_estrutura_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare pr public.produtos%rowtype; pf public.precos_franquia%rowtype; base numeric; custo numeric;
        micro boolean; preco numeric; v jsonb; kwi numeric;
begin
  select * into pr from public.produtos where id = p_produto_id;
  if not found or coalesce(pr.linha, 'catalogo') <> 'catalogo' then return null; end if;
  select * into pf from public.precos_franquia where produto_id = pr.id and franquia_id = p_franquia_id;
  if not found then return null; end if;
  custo := private.cc_custo_kit(pr.id, p_franquia_id, p_estrutura_id);
  if custo is null then return null; end if;
  if coalesce(pf.price_custos, 0) > 0 then
    select coalesce(ci.potencia_wp, 0) / 1000 * coalesce(pr.inversor_qtd, 1) into kwi from public.componentes ci where ci.id = pr.inversor_id;
    v := private.cc_preco_dimensionado(p_franquia_id, custo, coalesce(pr.modulo_qtd, 0), coalesce(pr.power, 0), coalesce(pr.inversor_qtd, 1), coalesce(kwi, 0));
    preco := (v->>'venda')::numeric;
  else
    micro := pr.categoria = 'kitsMicro';
    base := private.cc_custo_kit(pr.id, p_franquia_id);
    preco := round(coalesce(nullif(pf.price, 0), pr.price) + private.cc_preco_markup(custo, micro) - private.cc_preco_markup(base, micro), 2);
  end if;
  if coalesce(preco, 0) <= 0 then return null; end if;
  return jsonb_build_object('price', preco, 'list_price', private.cc_preco_de(preco), 'custo', custo);
end $function$;

-- Escolhe a estrutura do telhado/linha para o tamanho do módulo do kit (710 W → Smart).
create or replace function private.cc_estrutura_do_kit(p_produto_id uuid, p_telhado text, p_linha text)
returns text language sql stable security definer set search_path to '' as $function$
  select e.id from public.produtos pr
    join public.estruturas e on e.distribuidora_id = pr.distribuidora_id and e.ativo
         and e.telhado = p_telhado and e.tamanho = private.cc_tamanho_modulo(pr.modulo_id)
   where pr.id = p_produto_id
   order by (e.linha = p_linha) desc, (e.linha <> 'flex') desc, e.ordem
   limit 1
$function$;

-- Opções de telhado para a tela (sem custos).
create or replace function public.estruturas_opcoes()
returns jsonb language sql stable security definer set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'telhado', telhado, 'telhado_nome', telhado_nome, 'linha', linha,
           'tamanho', tamanho, 'padrao', padrao, 'distribuidora_id', distribuidora_id) order by ordem), '[]'::jsonb)
    from public.estruturas where ativo
$function$;
grant execute on function public.estruturas_opcoes() to authenticated;

-- Preços dos kits do catálogo da unidade com o telhado escolhido (kit sem estrutura compatível não volta).
create or replace function public.precos_kits_estrutura(p_telhado text, p_linha text default 'standard', p_franquia_id uuid default null)
returns table (produto_id uuid, estrutura_id text, price numeric, list_price numeric)
language plpgsql stable security definer set search_path to '' as $function$
declare unidade uuid := case when public.is_admin() and p_franquia_id is not null then p_franquia_id else public.get_franquia_id() end;
begin
  if unidade is null then return; end if;
  return query
  select k.id, k.est, (r->>'price')::numeric, (r->>'list_price')::numeric
    from (select pr.id, private.cc_estrutura_do_kit(pr.id, p_telhado, p_linha) est
            from public.produtos pr
            join public.precos_franquia pf on pf.produto_id = pr.id and pf.franquia_id = unidade
           where pr.ativo and coalesce(pr.linha, 'catalogo') = 'catalogo') k
    cross join lateral (select private.cc_preco_kit_estrutura(k.id, unidade, k.est) r) x
   where k.est is not null and x.r is not null;
end $function$;
grant execute on function public.precos_kits_estrutura(text, text, uuid) to authenticated;

-- Proposta: estrutura escolhida.
alter table public.propostas add column if not exists estrutura_id text references public.estruturas(id);

create or replace function public.tg_propostas_conferir_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_admin    boolean := public.is_admin();
  v_prod     public.produtos%rowtype;
  v_pf       public.precos_franquia%rowtype;
  v_mod      public.componentes%rowtype;
  v_inv      public.componentes%rowtype;
  v_cot      public.cotacoes_distribuidora%rowtype;
  v_est      public.estruturas%rowtype;
  v_estp     jsonb;
  v_preco    numeric;
  v_de       numeric;
  v_subtotal numeric;
  v_dv       numeric;
  v_desconto numeric;
  v_total    numeric;
begin
  if new.proposal_mode = 'EQUIPAMENTOS' then
    raise exception 'O modo Equipamentos foi desativado. Use a proposta personalizada.' using errcode = '42501';
  end if;

  -- ---------- KIT COTADO NA DISTRIBUIDORA ----------
  if new.cotacao_id is not null then
    select * into v_cot from public.cotacoes_distribuidora where id = new.cotacao_id;
    if not found then
      raise exception 'Cotação não encontrada. Cote o kit de novo.' using errcode = '22023';
    end if;
    if not v_admin and v_cot.criado_por is distinct from auth.uid() then
      raise exception 'Esta cotação é de outro usuário. Cote o kit de novo.' using errcode = '42501';
    end if;
    if v_cot.expira_em < now() then
      raise exception 'Esta cotação venceu. Cote o kit de novo.' using errcode = '22023';
    end if;
    new.proposal_mode     := coalesce(new.proposal_mode, 'PROMOCIONAL');
    new.source_product_id := null;
    new.estrutura_id      := null;
    new.kit_price         := v_cot.preco;
    new.kit_list_price    := greatest(v_cot.preco_de, v_cot.preco);
    new.kit_nome          := v_cot.titulo;
    new.kit_brand         := v_cot.marca;
    new.kit_power         := v_cot.kwp;
    new.distribuidora_id  := v_cot.distribuidora_id;
    new.kit_snapshot := jsonb_build_object(
      'tipo', 'cotacao',
      'cotacao_id', v_cot.id,
      'provedor', v_cot.provedor,
      'nome', v_cot.titulo,
      'categoria', v_cot.categoria,
      'marca', v_cot.marca,
      'potencia_kwp', v_cot.kwp,
      'preco', new.kit_price,
      'preco_de', new.kit_list_price,
      'modulo', v_cot.modulo,
      'inversor', v_cot.inversor,
      'itens', v_cot.itens,
      'capturado_em', now());
    return new;
  end if;

  -- ---------- PERSONALIZADA ----------
  if new.proposal_mode = 'PERSONALIZADA' then
    if not (v_admin or public.is_gestor()) then
      raise exception 'Apenas administrador ou gestor pode gerar proposta personalizada.' using errcode = '42501';
    end if;
    new.estrutura_id := null;

    if jsonb_typeof(new.custom_config -> 'itens') = 'array' then
      select round(coalesce(sum(coalesce((i ->> 'qtd')::numeric, 0) * coalesce((i ->> 'preco')::numeric, 0)), 0), 2)
        into v_subtotal
        from jsonb_array_elements(new.custom_config -> 'itens') i
       where coalesce((i ->> 'qtd')::numeric, 0) > 0;
      v_dv := greatest(coalesce(new.custom_discount_value, 0), 0);
      v_desconto := round(least(
        case when new.custom_discount_type = 'percent' then v_subtotal * least(v_dv, 100) / 100 else v_dv end,
        v_subtotal), 2);
      v_total := round(v_subtotal - v_desconto + greatest(coalesce(new.custom_frete, 0), 0), 2);
      if abs(coalesce(new.custom_total_price, 0) - v_total) > 0.05 then
        raise exception 'O total da proposta (R$ %) não confere com os itens (R$ %).', new.custom_total_price, v_total
          using errcode = '22023';
      end if;
    end if;

    new.kit_snapshot := jsonb_build_object(
      'tipo', 'personalizada',
      'descricao', new.kit_nome,
      'potencia_kwp', new.custom_system_power_kwp,
      'itens', coalesce(new.custom_config -> 'itens', '[]'::jsonb),
      'totais', new.custom_totals,
      'total', new.custom_total_price,
      'capturado_em', now());
    return new;
  end if;

  -- ---------- PROMOCIONAL ----------
  if new.source_product_id is null then
    if v_admin then
      return new;
    end if;
    raise exception 'Kit não identificado. Atualize a página e gere a proposta de novo.' using errcode = '22023';
  end if;

  select * into v_prod from public.produtos where id = new.source_product_id;
  if not found then
    if v_admin then
      return new;
    end if;
    raise exception 'Kit não encontrado no catálogo.' using errcode = '22023';
  end if;

  -- Estrutura escolhida (só catálogo completo; promocional é tabelado com a estrutura padrão).
  if new.estrutura_id is not null then
    if coalesce(v_prod.linha, 'catalogo') <> 'catalogo' then
      new.estrutura_id := null;
    else
      select * into v_est from public.estruturas where id = new.estrutura_id and ativo;
      if not found then
        raise exception 'Estrutura não encontrada. Escolha o telhado de novo.' using errcode = '22023';
      end if;
      v_estp := private.cc_preco_kit_estrutura(v_prod.id, new.franquia_id, new.estrutura_id);
      if v_estp is null then
        raise exception 'A estrutura % não serve para este kit.', v_est.telhado_nome using errcode = '22023';
      end if;
    end if;
  end if;

  if not v_admin then
    select * into v_pf
      from public.precos_franquia
     where produto_id = v_prod.id and franquia_id = new.franquia_id;
    if not found then
      raise exception 'Este kit não tem preço na sua unidade.' using errcode = '22023';
    end if;
    v_preco := case when coalesce(v_pf.price_custos, 0) > 0 then v_pf.price_custos
                    when coalesce(v_pf.price, 0) > 0 then v_pf.price else coalesce(v_prod.price, 0) end;
    v_de    := case when coalesce(v_pf.price_custos, 0) > 0 then coalesce(v_pf.list_price_custos, v_pf.price_custos)
                    when coalesce(v_pf.list_price, 0) > 0 then v_pf.list_price else coalesce(v_prod.list_price, 0) end;
    if v_estp is not null then
      v_preco := (v_estp->>'price')::numeric;
      v_de    := (v_estp->>'list_price')::numeric;
    end if;
    if v_preco <= 0 then
      raise exception 'Este kit não tem preço na sua unidade.' using errcode = '22023';
    end if;
    new.kit_price      := v_preco;
    new.kit_list_price := greatest(v_de, v_preco);
    new.kit_nome       := v_prod.name;
    new.kit_brand      := v_prod.brand;
    new.kit_power      := v_prod.power;
  end if;

  select * into v_mod from public.componentes where id = v_prod.modulo_id;
  select * into v_inv from public.componentes where id = v_prod.inversor_id;

  new.kit_snapshot := jsonb_build_object(
    'tipo', 'kit',
    'produto_id', v_prod.id,
    'nome', new.kit_nome,
    'categoria', v_prod.categoria,
    'marca', new.kit_brand,
    'potencia_kwp', new.kit_power,
    'preco', new.kit_price,
    'preco_de', new.kit_list_price,
    'preco_por', case when coalesce(v_pf.price_custos, 0) > 0 then 'custos' else 'markup' end,
    'modulo', case when v_mod.id is null then null else jsonb_build_object(
      'id', v_mod.id, 'nome', v_mod.nome, 'marca', v_mod.marca, 'potencia_wp', v_mod.potencia_wp, 'qtd', v_prod.modulo_qtd) end,
    'inversor', case when v_inv.id is null then null else jsonb_build_object(
      'id', v_inv.id, 'nome', v_inv.nome, 'marca', v_inv.marca, 'potencia_wp', v_inv.potencia_wp, 'qtd', v_prod.inversor_qtd) end,
    'estrutura', case when v_est.id is null then null else jsonb_build_object(
      'id', v_est.id, 'telhado', v_est.telhado, 'nome', v_est.telhado_nome, 'linha', v_est.linha) end,
    'capturado_em', now());
  return new;
end
$function$;

-- Trava de preço: estrutura também não muda depois de pronta (exceto admin).
create or replace function public.tg_propostas_trava_preco()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;
  if (new.kit_price, new.kit_list_price, new.kit_nome, new.kit_brand, new.kit_power,
      new.proposal_mode, new.source_product_id, new.kit_snapshot, new.cotacao_id,
      new.custom_config, new.custom_totals, new.custom_total_price, new.custom_subtotal_price,
      new.custom_equipment_price, new.custom_service_price, new.custom_price_before_discount,
      new.custom_discount_type, new.custom_discount_value, new.custom_frete, new.custom_system_power_kwp,
      new.custom_markup_percent, new.custom_markup_value, new.estrutura_id)
     is distinct from
     (old.kit_price, old.kit_list_price, old.kit_nome, old.kit_brand, old.kit_power,
      old.proposal_mode, old.source_product_id, old.kit_snapshot, old.cotacao_id,
      old.custom_config, old.custom_totals, old.custom_total_price, old.custom_subtotal_price,
      old.custom_equipment_price, old.custom_service_price, old.custom_price_before_discount,
      old.custom_discount_type, old.custom_discount_value, old.custom_frete, old.custom_system_power_kwp,
      old.custom_markup_percent, old.custom_markup_value, old.estrutura_id)
  then
    raise exception 'O preço e o kit de uma proposta pronta só podem ser alterados por um administrador.' using errcode = '42501';
  end if;
  return new;
end
$function$;

-- DRE: custo do kit com a estrutura da proposta.
create or replace function private.get_cc_proposta_contexto(p_proposta_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare p public.propostas%rowtype;c public.cotacoes_distribuidora%rowtype; qtd integer;kwp numeric; inv integer; kwi numeric; custo numeric;
begin
  if not public.cc_pode_proposta(p_proposta_id) then raise exception 'Sem permissão' using errcode='42501';end if;
  select * into p from public.propostas where id=p_proposta_id;
  if p.cotacao_id is not null then
    select * into c from public.cotacoes_distribuidora where id=p.cotacao_id;
    return jsonb_build_object('modulos',c.placas,'kwp',c.kwp,'inversores',coalesce((c.inversor->>'qtd')::integer,1),
      'kw_inversor',round(coalesce((c.inversor->>'potencia_wp')::numeric,0)/1000*coalesce((c.inversor->>'qtd')::numeric,1),3),'custo',c.custo,'precificacao',c.precificacao);
  end if;
  select sum((i->>'qtd')::numeric)::integer into qtd from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo'='modulo';
  select sum((i->>'qtd')::numeric)::integer into inv from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo' in ('inversor','micro');
  qtd:=coalesce(qtd,p.custom_modulo_qty,(p.kit_snapshot->'modulo'->>'qtd')::integer,0);
  inv:=coalesce(inv,p.custom_inversor_qty,(p.kit_snapshot->'inversor'->>'qtd')::integer,1);
  kwp:=coalesce(p.custom_system_power_kwp,p.kit_power,0);
  kwi:=coalesce((p.kit_snapshot->'inversor'->>'potencia_wp')::numeric/1000*coalesce((p.kit_snapshot->'inversor'->>'qtd')::numeric,1),
    (select c2.potencia_wp/1000*coalesce(p.custom_inversor_qty,1) from public.componentes c2 where c2.id=p.custom_inversor_id),0);
  if coalesce(p.proposal_mode,'') not in ('PERSONALIZADA','EQUIPAMENTOS') then
    custo := private.cc_custo_kit(coalesce(p.source_product_id, nullif(p.kit_snapshot->>'produto_id','')::uuid), p.franquia_id, p.estrutura_id);
  end if;
  return jsonb_build_object('modulos',qtd,'kwp',kwp,'inversores',inv,'kw_inversor',round(kwi,3))
    || case when custo > 0 then jsonb_build_object('custo',custo,'custo_fonte','catalogo') else '{}'::jsonb end;
end $function$;

revoke execute on function public.estruturas_opcoes() from anon;
revoke execute on function public.precos_kits_estrutura(text, text, uuid) from anon;

-- Página/PDF da proposta: nome da estrutura escolhida (kit do catálogo com outro telhado).
create or replace function private.get_public_proposta_data(p_id uuid)
 returns json
 language sql
 stable security definer
 set search_path to ''
as $function$
  SELECT row_to_json(t) FROM (
    SELECT
      p.cliente_nome,
      p.kit_nome,
      p.kit_brand,
      p.kit_power,
      p.kit_price,
      p.kit_list_price,
      p.proposal_mode,
      p.custom_total_price,
      p.custom_system_power_kwp,
      p.custom_payment_note,
      p.custom_commercial_note,
      p.geracao_estimada,
      p.geracao_ajustada,
      p.created_at,
      p.vendedor_nome,
      p.vendedor_telefone,
      coalesce(rt.cartao_taxas, '{}'::jsonb) AS cartao_taxas,
      p.numero,
      p.public_token,
      f.nome                   AS franquia_nome,
      f.cnpj                   AS franquia_cnpj,
      f.razao_social           AS franquia_razao_social,
      f.endereco               AS franquia_endereco,
      f.cidade                 AS franquia_cidade,
      f.telefone               AS franquia_telefone,
      f.email                  AS franquia_email,
      f.site                   AS franquia_site,
      f.garantia_paineis_anos  AS franquia_garantia_paineis_anos,
      f.garantia_inversor_anos AS franquia_garantia_inversor_anos,
      COALESCE(p.cliente_cidade, c.cidade) AS cliente_cidade,
      c.uf                     AS cliente_uf,
      ch.hsp_anual             AS cidade_hsp_anual,
      ch.hsp_mensal            AS cidade_hsp_mensal,
      p.kit_snapshot -> 'estrutura' ->> 'nome'  AS estrutura_nome,
      p.kit_snapshot -> 'estrutura' ->> 'linha' AS estrutura_linha
    FROM public.propostas p
    LEFT JOIN public.franquias f    ON f.id = p.franquia_id
    LEFT JOIN public.rede_taxas rt  ON rt.franquia_id = p.franquia_id
    LEFT JOIN public.clientes c     ON c.id = p.cliente_id
    LEFT JOIN public.cidades_hsp ch ON ch.ibge_code = c.cidade_ibge
    WHERE p.id = p_id
  ) t
$function$;

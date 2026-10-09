-- Preço por custos no lugar do markup (09/10/2026). Depende de 20261009122917_centro_custo_dimensionado.
--
-- * Elétrica em duas linhas: fixa por obra (quadro, disjuntores, DPS) e a que cresce com o
--   sistema (por kWp ou por módulo).
-- * Cada unidade escolhe como calcula o preço: 'markup' (como hoje) ou 'custos'
--   (kit + custos da unidade + imposto + comissão + margem alvo). Padrão: markup.
-- * O custo Helte de cada kit do catálogo fica em produtos_custo (só admin lê).
-- * precos_franquia.price continua sendo o preço do markup (quem grava preço hoje não muda).
--   price_custos / list_price_custos são calculados aqui para as unidades no modo custos e
--   valem no lugar do price. Promocionais (produtos.linha = 'promocional') nunca entram.

-- ---------------------------------------------------------------- linhas do centro de custo
create or replace function public.cc_linhas_validas()
returns text[] language sql immutable as $$
  select array['imposto','comissao','deducoes','projeto','instalacao','eletrica_fixa','eletrica','placas','ajuda','vistoria','outros']
$$;

create or replace function public.cc_linhas_padrao()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with c as (select chave, (valor #>> '{}')::numeric as v from public.fin_config)
  select jsonb_build_object(
    'imposto',       jsonb_build_object('t','pct','v', coalesce((select v from c where chave='imposto_pct'), 18), 'b','vk'),
    'comissao',      jsonb_build_object('t','pct','v', coalesce((select v from c where chave='comissao_pct'), 10), 'b','v'),
    'deducoes',      jsonb_build_object('t','pct','v', coalesce((select v from c where chave='deducoes_pct'), 0), 'b','v'),
    'projeto',       jsonb_build_object('t','brl','v',0,'b','v'),
    'instalacao',    jsonb_build_object('t','brl','v',0,'b','v'),
    'eletrica_fixa', jsonb_build_object('t','brl','v',0,'b','v'),
    'eletrica',      jsonb_build_object('t','brl','v',0,'b','v'),
    'placas',        jsonb_build_object('t','brl','v',0,'b','v'),
    'ajuda',         jsonb_build_object('t','brl','v',0,'b','v'),
    'vistoria',      jsonb_build_object('t','brl','v',0,'b','v'),
    'outros',        jsonb_build_object('t','brl','v',0,'b','v')
  )
$$;

-- ---------------------------------------------------------------- modo de preço da unidade
alter table public.fin_centro_custo add column if not exists modo_preco text not null default 'markup';
do $$ begin
  alter table public.fin_centro_custo add constraint fin_centro_custo_modo_chk check (modo_preco in ('markup','custos'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- custo dos kits (só admin)
create table if not exists public.produtos_custo (
  produto_id uuid primary key references public.produtos(id) on delete cascade,
  custo numeric not null check (custo > 0),           -- kit completo com frete
  fonte text not null default 'helte',
  detalhe jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.produtos_custo enable row level security;
drop policy if exists produtos_custo_admin on public.produtos_custo;
create policy produtos_custo_admin on public.produtos_custo for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.produtos_custo to authenticated;

-- ---------------------------------------------------------------- preço por custos na unidade
alter table public.precos_franquia add column if not exists price_custos numeric;
alter table public.precos_franquia add column if not exists list_price_custos numeric;

-- "De" pela mesma regra das planilhas: +13,38%; acima de R$ 30 mil cresce pela raiz.
create or replace function private.cc_preco_de(p numeric)
returns numeric language sql immutable set search_path = '' as $$
  select round(case when p <= 30000 then p * 1.1337538962526612
                    else p + 0.1337538962526612 * 30000 * sqrt(p / 30000) end, 2)
$$;

create or replace function private.cc_modo_preco(p_franquia_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select modo_preco from public.fin_centro_custo where franquia_id = p_franquia_id), 'markup')
$$;
revoke all on function private.cc_modo_preco(uuid) from public, anon, authenticated;
grant execute on function private.cc_modo_preco(uuid) to service_role;

-- Recalcula o preço por custos dos kits do catálogo de uma unidade. No modo markup, limpa.
-- Kit sem custo, sem módulos/potência ou que a conta recusa (ex.: projeto fora da tabela)
-- fica sem price_custos e segue com o preço do markup.
create or replace function private.cc_aplicar_precos(p_franquia_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare r record; v jsonb; n integer := 0;
begin
  if p_franquia_id is null then return 0; end if;
  if private.cc_modo_preco(p_franquia_id) <> 'custos' then
    update public.precos_franquia set price_custos = null, list_price_custos = null
     where franquia_id = p_franquia_id and (price_custos is not null or list_price_custos is not null);
    return 0;
  end if;
  for r in
    select pf.produto_id, c.custo, coalesce(p.modulo_qtd, 0) as modulos, coalesce(p.power, 0) as kwp
      from public.precos_franquia pf
      join public.produtos p on p.id = pf.produto_id
      left join public.produtos_custo c on c.produto_id = p.id
     where pf.franquia_id = p_franquia_id and coalesce(p.linha, 'catalogo') = 'catalogo'
  loop
    v := null;
    if r.custo > 0 and r.modulos > 0 and r.kwp > 0 then
      begin
        v := private.cc_preco_dimensionado(p_franquia_id, r.custo, r.modulos, r.kwp);
      exception when others then v := null;
      end;
    end if;
    update public.precos_franquia
       set price_custos = (v->>'venda')::numeric,
           list_price_custos = case when v is null then null else private.cc_preco_de((v->>'venda')::numeric) end
     where franquia_id = p_franquia_id and produto_id = r.produto_id;
    if v is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function private.cc_aplicar_precos(uuid) from public, anon, authenticated;
grant execute on function private.cc_aplicar_precos(uuid) to service_role;

-- Gatilhos: centro de custo salvo, custo de kit trocado ou taxa da Rede alterada.
create or replace function private.tg_cc_recalcular_unidade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.cc_aplicar_precos(new.franquia_id);
  return null;
end $$;
drop trigger if exists tg_fin_centro_custo_precos on public.fin_centro_custo;
create trigger tg_fin_centro_custo_precos after insert or update on public.fin_centro_custo
  for each row execute function private.tg_cc_recalcular_unidade();
drop trigger if exists tg_rede_taxas_precos on public.rede_taxas;
create trigger tg_rede_taxas_precos after insert or update on public.rede_taxas
  for each row execute function private.tg_cc_recalcular_unidade();

create or replace function private.tg_cc_recalcular_todas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  for f in select franquia_id from public.fin_centro_custo where modo_preco = 'custos' loop
    perform private.cc_aplicar_precos(f);
  end loop;
  return null;
end $$;
drop trigger if exists tg_produtos_custo_precos on public.produtos_custo;
create trigger tg_produtos_custo_precos after insert or update or delete on public.produtos_custo
  for each statement execute function private.tg_cc_recalcular_todas();
drop trigger if exists tg_rede_padroes_precos on public.rede_padroes;
create trigger tg_rede_padroes_precos after update on public.rede_padroes
  for each statement execute function private.tg_cc_recalcular_todas();

-- ---------------------------------------------------------------- get/set do centro de custo
create or replace function public.get_centro_custo(p_franquia_id uuid default null::uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_fr uuid := coalesce(p_franquia_id, public.get_franquia_id());
  v_f  public.franquias%rowtype;
  v_cc public.fin_centro_custo%rowtype;
  v_roy numeric; v_pub numeric;
  v_mmin numeric; v_malvo numeric;
  v_nome text;
begin
  if v_fr is null or not public.cc_pode_franquia(v_fr) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  select * into v_f from public.franquias where id = v_fr;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  select * into v_cc from public.fin_centro_custo where franquia_id = v_fr;

  select coalesce(t.royalties_pct, p.royalties_pct, 0), coalesce(t.publicidade_pct, p.publicidade_pct, 0)
    into v_roy, v_pub
    from (select 1) x
    left join public.rede_taxas t on t.franquia_id = v_fr
    left join public.rede_padroes p on p.id = 1;
  if coalesce(v_f.tipo, '') = 'propria' then v_roy := 0; v_pub := 0; end if;

  select (valor #>> '{}')::numeric into v_mmin  from public.fin_config where chave = 'margem_min';
  select (valor #>> '{}')::numeric into v_malvo from public.fin_config where chave = 'margem_alvo';
  select coalesce(ua.nome, ua.email) into v_nome from public.user_accounts ua where ua.user_id = v_cc.updated_by;

  return jsonb_build_object(
    'franquia_id', v_fr,
    'franquia_nome', v_f.nome,
    'linhas', public.cc_linhas_padrao() || coalesce(v_cc.linhas, '{}'::jsonb),
    'contrato', jsonb_build_object(
      'royalties',   jsonb_build_object('t','pct','v', v_roy, 'b','v'),
      'publicidade', jsonb_build_object('t','pct','v', v_pub, 'b','v')),
    'margem_min',  coalesce(v_cc.margem_min,  v_mmin,  15),
    'margem_alvo', coalesce(v_cc.margem_alvo, v_malvo, 22),
    'modo_preco',  coalesce(v_cc.modo_preco, 'markup'),
    'projeto_rede', (select jsonb_build_object('cobrar', coalesce(t.projeto_cobrar, v_f.tipo = 'franquia'), 'faixas', case when jsonb_array_length(coalesce(t.projeto_faixas, '[]')) > 0 then t.projeto_faixas else coalesce(p.projeto_faixas,'[]') end) from (select 1) x left join public.rede_taxas t on t.franquia_id=v_fr left join public.rede_padroes p on p.id=1),
    'kits_custos', (select count(*) from public.precos_franquia pf where pf.franquia_id = v_fr and pf.price_custos is not null),
    'salvo', v_cc.franquia_id is not null,
    'updated_at', v_cc.updated_at,
    'updated_by_nome', v_nome
  );
end $function$;

drop function if exists public.set_centro_custo(uuid, jsonb, numeric, numeric);
create or replace function public.set_centro_custo(p_franquia_id uuid, p_linhas jsonb, p_margem_min numeric, p_margem_alvo numeric, p_modo_preco text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  k text; l jsonb; v_t text; v_b text; v_v numeric;
  v_out jsonb := '{}'::jsonb;
begin
  if p_franquia_id is null or not public.cc_pode_franquia(p_franquia_id) then
    raise exception 'Sem permissão para esta unidade' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_linhas, '{}'::jsonb)) <> 'object' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;
  if p_margem_min is not null and (p_margem_min < 0 or p_margem_min > 100)
     or p_margem_alvo is not null and (p_margem_alvo < 0 or p_margem_alvo >= 100) then
    raise exception 'Margem deve ficar entre 0 e 100' using errcode = '22023';
  end if;
  if p_margem_alvo < p_margem_min or p_margem_alvo::text in ('NaN','Infinity','-Infinity') or p_margem_min::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Margem alvo deve ser maior ou igual à mínima e menor que 100%%' using errcode='22023';
  end if;
  if p_modo_preco is not null and p_modo_preco not in ('markup','custos') then
    raise exception 'Modo de preço inválido' using errcode = '22023';
  end if;
  for k, l in select * from jsonb_each(coalesce(p_linhas, '{}'::jsonb)) loop
    if not (k = any (public.cc_linhas_validas())) then continue; end if;
    if jsonb_typeof(l) <> 'object' then raise exception 'Linha % inválida', k using errcode = '22023'; end if;
    v_t := coalesce(l->>'t', 'pct');
    v_b := coalesce(l->>'b', 'v');
    begin v_v := (l->>'v')::numeric; exception when others then v_v := null; end;
    if v_t not in ('pct','brl') or (v_t='pct' and v_b not in ('v','vk')) or (v_t='brl' and v_b not in ('v','modulo','kwp')) or v_v is null or v_v::text in ('NaN','Infinity','-Infinity') or v_v < 0
       or (v_t = 'pct' and v_v > 100) then
      raise exception 'Valor inválido em %', k using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_object(k, jsonb_build_object('t', v_t, 'v', round(v_v, 4), 'b', v_b));
  end loop;

  insert into public.fin_centro_custo as cc (franquia_id, linhas, margem_min, margem_alvo, modo_preco, updated_at, updated_by)
  values (p_franquia_id, v_out, p_margem_min, p_margem_alvo, coalesce(p_modo_preco, 'markup'), now(), auth.uid())
  on conflict (franquia_id) do update set
    linhas = excluded.linhas, margem_min = excluded.margem_min, margem_alvo = excluded.margem_alvo,
    modo_preco = coalesce(p_modo_preco, cc.modo_preco),
    updated_at = now(), updated_by = excluded.updated_by;
  -- o gatilho tg_fin_centro_custo_precos recalcula os preços da unidade
  return public.get_centro_custo(p_franquia_id);
end $function$;
revoke all on function public.set_centro_custo(uuid, jsonb, numeric, numeric, text) from public, anon;
grant execute on function public.set_centro_custo(uuid, jsonb, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------- proposta usa o preço da unidade
-- Igual à versão de 20261007_integracao_distribuidoras, trocando só a leitura do preço:
-- unidade no modo custos usa price_custos quando o kit tem.
create or replace function public.tg_propostas_conferir_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_admin    boolean := public.is_admin();
  v_prod     public.produtos%rowtype;
  v_pf       public.precos_franquia%rowtype;
  v_mod      public.componentes%rowtype;
  v_inv      public.componentes%rowtype;
  v_cot      public.cotacoes_distribuidora%rowtype;
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
    'capturado_em', now());
  return new;
end
$function$;

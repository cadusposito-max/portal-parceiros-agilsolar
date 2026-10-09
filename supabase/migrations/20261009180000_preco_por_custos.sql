-- Preço por custos no lugar do markup (09/10/2026). Depende de 20261009122917_centro_custo_dimensionado.
--
-- * Elétrica em duas linhas: fixa por obra (quadro, disjuntores, DPS) e a que cresce com o
--   sistema (por kWp ou por módulo).
-- * Formas de cálculo de cada linha: R$ fixo, por módulo, por kWp, por inversor/micro, tabela
--   por faixa de kWp; % da venda, da venda − kit ou do custo do kit. Linhas personalizadas
--   (chave extra_*, com nome) entram na mesma conta.
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

-- ---------------------------------------------------------------- conta do preço por custos
-- Substitui a versão de 4 parâmetros (20261009122917): agora recebe a quantidade de inversores.
drop function if exists public.cc_preco_dimensionado(uuid, numeric, integer, numeric);
drop function if exists private.cc_preco_dimensionado(uuid, numeric, integer, numeric);
create or replace function private.cc_preco_dimensionado(p_franquia_id uuid, p_kit numeric, p_modulos integer, p_kwp numeric, p_inversores integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  fid uuid := coalesce(p_franquia_id,(select id from public.franquias where tipo='propria' order by created_at limit 1));
  f public.franquias%rowtype; cc public.fin_centro_custo%rowtype;
  linhas jsonb; r record; x jsonb; val numeric; fv numeric; fixo numeric:=0;
  p numeric:=0; q numeric:=0; m numeric; den numeric; venda numeric; soma numeric;
  roy numeric; pub numeric; proj numeric:=0; cobrar boolean; faixas jsonb; i integer;
  inv integer := greatest(coalesce(p_inversores, 1), 1);
begin
  if p_kit is null or p_kit<=0 or p_kit::text in ('NaN','Infinity','-Infinity') or p_modulos is null or p_modulos<=0 or p_kwp is null or p_kwp<=0 or p_kwp::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Informe custo completo, quantidade de módulos e potência válidos.' using errcode='22023';
  end if;
  select * into f from public.franquias where id=fid;
  if not found then raise exception 'Unidade não encontrada'; end if;
  select * into cc from public.fin_centro_custo where franquia_id=fid;
  if not found then raise exception 'Configure e salve o centro de custo da unidade antes de usar custos + margem.'; end if;
  linhas := public.cc_linhas_padrao() || cc.linhas;
  select coalesce(t.royalties_pct,d.royalties_pct,0),coalesce(t.publicidade_pct,d.publicidade_pct,0),
    coalesce(t.projeto_cobrar,f.tipo='franquia'),case when jsonb_array_length(coalesce(t.projeto_faixas,'[]'))>0 then t.projeto_faixas else coalesce(d.projeto_faixas,'[]') end
    into roy,pub,cobrar,faixas from (select 1) z left join public.rede_taxas t on t.franquia_id=fid left join public.rede_padroes d on d.id=1;
  if f.tipo='propria' then roy:=0;pub:=0;end if;
  if cobrar then
    select (value->>'valor')::numeric into proj from jsonb_array_elements(faixas) with ordinality where p_kwp <= (value->>'ate')::numeric order by ordinality limit 1;
    if proj is null then raise exception 'Projeto fora da tabela da Rede; configure a faixa de kWp antes de precificar.';end if;
  end if;
  linhas := linhas || jsonb_build_object('projeto_rede',jsonb_build_object('t','brl','v',proj,'b','v'),
    'royalties',jsonb_build_object('t','pct','v',roy,'b','v'),'publicidade',jsonb_build_object('t','pct','v',pub,'b','v'));
  for r in select key,value from jsonb_each(linhas) loop
    x:=r.value; val:=coalesce((x->>'v')::numeric,0); fv:=null;
    if x->>'t'='brl' then
      if x->>'b'='faixa' then
        -- primeira faixa que cobre a potência; acima da última, vale a última
        select (e->>'valor')::numeric into fv from jsonb_array_elements(coalesce(x->'faixas','[]')) e
         where (e->>'ate')::numeric >= p_kwp order by (e->>'ate')::numeric limit 1;
        if fv is null then
          select (e->>'valor')::numeric into fv from jsonb_array_elements(coalesce(x->'faixas','[]')) e order by (e->>'ate')::numeric desc limit 1;
        end if;
        if fv is null then raise exception 'Preencha a tabela por faixa de kWp de %.', r.key using errcode='22023'; end if;
        val:=round(fv,2);
      else
        val:=round(val * case x->>'b' when 'modulo' then p_modulos when 'kwp' then p_kwp when 'inversor' then inv else 1 end,2);
      end if;
      fixo:=fixo+val;
    elsif x->>'b'='kit' then fixo:=fixo+round(p_kit*val/100,2);
    elsif x->>'b'='vk' then q:=q+val/100;
    else p:=p+val/100;end if;
  end loop;
  m:=coalesce(cc.margem_alvo,(select (valor#>>'{}')::numeric from public.fin_config where chave='margem_alvo'),22)/100;
  den:=1-p-q-m;
  if den<=0 then raise exception 'Percentuais e margem devem somar menos de 100%%.' using errcode='22023';end if;
  venda:=ceil((p_kit+fixo-q*p_kit)/den*100)/100;
  if venda<p_kit then venda:=ceil((p_kit+fixo)/(1-p-m)*100)/100;end if;
  -- Protege a margem contra arredondamentos individuais em centavos.
  for i in 1..100 loop
    soma:=p_kit+fixo;
    for x in select value from jsonb_each(linhas) where value->>'t'='pct' and coalesce(value->>'b','v')<>'kit' loop
      soma:=soma+round((x->>'v')::numeric/100 * case when x->>'b'='vk' then greatest(0,venda-p_kit) else venda end,2);
    end loop;
    exit when venda*(1-m)>=soma;
    venda:=venda+.01;
  end loop;
  return jsonb_build_object('modo','custos','versao',4,'venda',venda,'margem_alvo',m*100,'linhas',linhas,'modulos',p_modulos,'kwp',p_kwp,'inversores',inv,'fixo',fixo,'projeto_rede',proj,'art_inclusa',false,'franquia_id',fid);
end $$;
revoke all on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer) from public,anon,authenticated;
grant execute on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer) to service_role;
create or replace function public.cc_preco_dimensionado(p_franquia_id uuid,p_kit numeric,p_modulos integer,p_kwp numeric,p_inversores integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.cc_preco_dimensionado(p_franquia_id,p_kit,p_modulos,p_kwp,p_inversores) $$;
revoke all on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer) from public,anon,authenticated;
grant execute on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer) to service_role;

-- Contexto da DRE da proposta: agora com a quantidade de inversores.
create or replace function private.get_cc_proposta_contexto(p_proposta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.propostas%rowtype;c public.cotacoes_distribuidora%rowtype; qtd integer;kwp numeric; inv integer;
begin
  if not public.cc_pode_proposta(p_proposta_id) then raise exception 'Sem permissão' using errcode='42501';end if;
  select * into p from public.propostas where id=p_proposta_id;
  if p.cotacao_id is not null then
    select * into c from public.cotacoes_distribuidora where id=p.cotacao_id;
    return jsonb_build_object('modulos',c.placas,'kwp',c.kwp,'inversores',coalesce((c.inversor->>'qtd')::integer,1),'custo',c.custo,'precificacao',c.precificacao);
  end if;
  select sum((i->>'qtd')::numeric)::integer into qtd from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo'='modulo';
  select sum((i->>'qtd')::numeric)::integer into inv from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo' in ('inversor','micro');
  qtd:=coalesce(qtd,p.custom_modulo_qty,(p.kit_snapshot->'modulo'->>'qtd')::integer,0);
  inv:=coalesce(inv,p.custom_inversor_qty,(p.kit_snapshot->'inversor'->>'qtd')::integer,1);
  kwp:=coalesce(p.custom_system_power_kwp,p.kit_power,0);
  return jsonb_build_object('modulos',qtd,'kwp',kwp,'inversores',inv);
end $$;

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

-- Recalcula o preço por custos de todos os kits do catálogo da unidade (qualquer distribuidora
-- ou cadastrado à mão) que têm custo em produtos_custo. Promocionais ficam de fora. No modo markup, limpa.
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
    select pf.produto_id, c.custo, coalesce(p.modulo_qtd, 0) as modulos, coalesce(p.power, 0) as kwp, coalesce(p.inversor_qtd, 1) as inversores
      from public.precos_franquia pf
      join public.produtos p on p.id = pf.produto_id
      left join public.produtos_custo c on c.produto_id = p.id
     where pf.franquia_id = p_franquia_id and coalesce(p.linha, 'catalogo') = 'catalogo'
  loop
    v := null;
    if r.custo > 0 and r.modulos > 0 and r.kwp > 0 then
      begin
        v := private.cc_preco_dimensionado(p_franquia_id, r.custo, r.modulos, r.kwp, r.inversores);
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
  v_out jsonb := '{}'::jsonb; v_linha jsonb; v_fx jsonb; v_f jsonb; v_extra boolean; v_n_extra integer := 0;
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
    v_extra := k ~ '^extra_[a-z0-9]{1,20}$';
    if not (k = any (public.cc_linhas_validas()) or v_extra) then continue; end if;
    if jsonb_typeof(l) <> 'object' then raise exception 'Linha % inválida', k using errcode = '22023'; end if;
    v_t := coalesce(l->>'t', 'pct');
    v_b := coalesce(l->>'b', 'v');
    begin v_v := coalesce((l->>'v')::numeric, 0); exception when others then v_v := null; end;
    if v_t not in ('pct','brl') or (v_t='pct' and v_b not in ('v','vk','kit')) or (v_t='brl' and v_b not in ('v','modulo','kwp','inversor','faixa'))
       or v_v is null or v_v::text in ('NaN','Infinity','-Infinity') or v_v < 0 or (v_t = 'pct' and v_v > 100) then
      raise exception 'Valor inválido em %', coalesce(l->>'nome', k) using errcode = '22023';
    end if;
    v_linha := jsonb_build_object('t', v_t, 'v', round(v_v, 4), 'b', v_b);
    if v_t = 'brl' and v_b = 'faixa' then
      v_fx := '[]'::jsonb;
      for v_f in select * from jsonb_array_elements(case when jsonb_typeof(l->'faixas') = 'array' then l->'faixas' else '[]'::jsonb end) loop
        begin
          if (v_f->>'ate')::numeric > 0 and (v_f->>'valor')::numeric >= 0 then
            v_fx := v_fx || jsonb_build_array(jsonb_build_object('ate', round((v_f->>'ate')::numeric, 2), 'valor', round((v_f->>'valor')::numeric, 2)));
          end if;
        exception when others then raise exception 'Tabela por faixa inválida em %', coalesce(l->>'nome', k) using errcode = '22023';
        end;
      end loop;
      if jsonb_array_length(v_fx) = 0 or jsonb_array_length(v_fx) > 20 then
        raise exception 'Preencha de 1 a 20 faixas de kWp em %', coalesce(l->>'nome', k) using errcode = '22023';
      end if;
      v_linha := v_linha || jsonb_build_object('faixas', (select jsonb_agg(e order by (e->>'ate')::numeric) from jsonb_array_elements(v_fx) e));
    end if;
    if v_extra then
      if coalesce(btrim(l->>'nome'), '') = '' then raise exception 'Dê um nome ao custo personalizado' using errcode = '22023'; end if;
      v_n_extra := v_n_extra + 1;
      if v_n_extra > 15 then raise exception 'No máximo 15 custos personalizados' using errcode = '22023'; end if;
      v_linha := v_linha || jsonb_build_object('nome', left(btrim(l->>'nome'), 40));
    end if;
    v_out := v_out || jsonb_build_object(k, v_linha);
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

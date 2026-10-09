-- Forma de cálculo "R$ por kW do inversor" (10/10/2026). Depende de 20261009180000_preco_por_custos.
-- kW de inversor = potência do inversor × quantidade (kit do catálogo: cadastro de equipamentos;
-- cotação: inversor cotado; DRE: foto do kit). Só muda o que usa essa forma; o resto fica igual.

drop function if exists public.cc_preco_dimensionado(uuid, numeric, integer, numeric, integer);
drop function if exists private.cc_preco_dimensionado(uuid, numeric, integer, numeric, integer);
create or replace function private.cc_preco_dimensionado(p_franquia_id uuid, p_kit numeric, p_modulos integer, p_kwp numeric, p_inversores integer default 1, p_kw_inversor numeric default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  fid uuid := coalesce(p_franquia_id,(select id from public.franquias where tipo='propria' order by created_at limit 1));
  f public.franquias%rowtype; cc public.fin_centro_custo%rowtype;
  linhas jsonb; r record; x jsonb; val numeric; fv numeric; fixo numeric:=0;
  p numeric:=0; q numeric:=0; m numeric; den numeric; venda numeric; soma numeric;
  roy numeric; pub numeric; proj numeric:=0; cobrar boolean; faixas jsonb; i integer;
  inv integer := greatest(coalesce(p_inversores, 1), 1);
  kwi numeric := greatest(coalesce(p_kw_inversor, 0), 0);
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
        if x->>'b'='kw_inversor' and val>0 and kwi<=0 then
          raise exception 'Informe a potência do inversor (kW) para %.', r.key using errcode='22023';
        end if;
        val:=round(val * case x->>'b' when 'modulo' then p_modulos when 'kwp' then p_kwp when 'inversor' then inv when 'kw_inversor' then kwi else 1 end,2);
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
  return jsonb_build_object('modo','custos','versao',4,'venda',venda,'margem_alvo',m*100,'linhas',linhas,'modulos',p_modulos,'kwp',p_kwp,'inversores',inv,'kw_inversor',kwi,'fixo',fixo,'projeto_rede',proj,'art_inclusa',false,'franquia_id',fid);
end $$;
revoke all on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer,numeric) from public,anon,authenticated;
grant execute on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer,numeric) to service_role;
create or replace function public.cc_preco_dimensionado(p_franquia_id uuid,p_kit numeric,p_modulos integer,p_kwp numeric,p_inversores integer default 1,p_kw_inversor numeric default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.cc_preco_dimensionado(p_franquia_id,p_kit,p_modulos,p_kwp,p_inversores,p_kw_inversor) $$;
revoke all on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer,numeric) from public,anon,authenticated;
grant execute on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric,integer,numeric) to service_role;

create or replace function private.get_cc_proposta_contexto(p_proposta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.propostas%rowtype;c public.cotacoes_distribuidora%rowtype; qtd integer;kwp numeric; inv integer; kwi numeric;
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
  -- kW de inversor: foto do kit (potência × qtd) ou o inversor da personalizada
  kwi:=coalesce((p.kit_snapshot->'inversor'->>'potencia_wp')::numeric/1000*coalesce((p.kit_snapshot->'inversor'->>'qtd')::numeric,1),
    (select c2.potencia_wp/1000*coalesce(p.custom_inversor_qty,1) from public.componentes c2 where c2.id=p.custom_inversor_id),0);
  return jsonb_build_object('modulos',qtd,'kwp',kwp,'inversores',inv,'kw_inversor',round(kwi,3));
end $$;

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
    select pf.produto_id, c.custo, coalesce(p.modulo_qtd, 0) as modulos, coalesce(p.power, 0) as kwp, coalesce(p.inversor_qtd, 1) as inversores,
           coalesce(ci.potencia_wp, 0) / 1000 * coalesce(p.inversor_qtd, 1) as kw_inversor
      from public.precos_franquia pf
      join public.produtos p on p.id = pf.produto_id
      left join public.produtos_custo c on c.produto_id = p.id
      left join public.componentes ci on ci.id = p.inversor_id
     where pf.franquia_id = p_franquia_id and coalesce(p.linha, 'catalogo') = 'catalogo'
  loop
    v := null;
    if r.custo > 0 and r.modulos > 0 and r.kwp > 0 then
      begin
        v := private.cc_preco_dimensionado(p_franquia_id, r.custo, r.modulos, r.kwp, r.inversores, r.kw_inversor);
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
    if v_t not in ('pct','brl') or (v_t='pct' and v_b not in ('v','vk','kit')) or (v_t='brl' and v_b not in ('v','modulo','kwp','inversor','kw_inversor','faixa'))
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

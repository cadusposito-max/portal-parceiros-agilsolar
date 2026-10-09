CREATE OR REPLACE FUNCTION public.get_centro_custo(p_franquia_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fr uuid := coalesce(p_franquia_id, public.get_franquia_id());
  v_f  public.franquias%ROWTYPE;
  v_cc public.fin_centro_custo%ROWTYPE;
  v_roy numeric; v_pub numeric;
  v_mmin numeric; v_malvo numeric;
  v_nome text;
BEGIN
  IF v_fr IS NULL OR NOT public.cc_pode_franquia(v_fr) THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade' USING errcode = '42501';
  END IF;
  SELECT * INTO v_f FROM public.franquias WHERE id = v_fr;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unidade não encontrada' USING errcode = 'P0002'; END IF;
  SELECT * INTO v_cc FROM public.fin_centro_custo WHERE franquia_id = v_fr;

  -- Contrato: taxas da unidade; sem linha, os padrões da rede. Unidade própria não paga.
  SELECT coalesce(t.royalties_pct, p.royalties_pct, 0), coalesce(t.publicidade_pct, p.publicidade_pct, 0)
    INTO v_roy, v_pub
    FROM (SELECT 1) x
    LEFT JOIN public.rede_taxas t ON t.franquia_id = v_fr
    LEFT JOIN public.rede_padroes p ON p.id = 1;
  IF coalesce(v_f.tipo, '') = 'propria' THEN v_roy := 0; v_pub := 0; END IF;

  SELECT (valor #>> '{}')::numeric INTO v_mmin  FROM public.fin_config WHERE chave = 'margem_min';
  SELECT (valor #>> '{}')::numeric INTO v_malvo FROM public.fin_config WHERE chave = 'margem_alvo';
  SELECT coalesce(ua.nome, ua.email) INTO v_nome FROM public.user_accounts ua WHERE ua.user_id = v_cc.updated_by;

  RETURN jsonb_build_object(
    'franquia_id', v_fr,
    'franquia_nome', v_f.nome,
    'linhas', public.cc_linhas_padrao() || coalesce(v_cc.linhas, '{}'::jsonb),
    'contrato', jsonb_build_object(
      'royalties',   jsonb_build_object('t','pct','v', v_roy, 'b','v'),
      'publicidade', jsonb_build_object('t','pct','v', v_pub, 'b','v')),
    'margem_min',  coalesce(v_cc.margem_min,  v_mmin,  15),
    'margem_alvo', coalesce(v_cc.margem_alvo, v_malvo, 22),
    'projeto_rede', (select jsonb_build_object('cobrar', coalesce(t.projeto_cobrar, v_f.tipo = 'franquia'), 'faixas', case when jsonb_array_length(coalesce(t.projeto_faixas, '[]')) > 0 then t.projeto_faixas else coalesce(p.projeto_faixas,'[]') end) from (select 1) x left join public.rede_taxas t on t.franquia_id=v_fr left join public.rede_padroes p on p.id=1),
    'salvo', v_cc.franquia_id IS NOT NULL,
    'updated_at', v_cc.updated_at,
    'updated_by_nome', v_nome
  );
END $function$
;
CREATE OR REPLACE FUNCTION public.set_centro_custo(p_franquia_id uuid, p_linhas jsonb, p_margem_min numeric, p_margem_alvo numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text; l jsonb; v_t text; v_b text; v_v numeric;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_franquia_id IS NULL OR NOT public.cc_pode_franquia(p_franquia_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_linhas, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Formato inválido' USING errcode = '22023';
  END IF;
  IF p_margem_min IS NOT NULL AND (p_margem_min < 0 OR p_margem_min > 100)
     OR p_margem_alvo IS NOT NULL AND (p_margem_alvo < 0 OR p_margem_alvo >= 100) THEN
    RAISE EXCEPTION 'Margem deve ficar entre 0 e 100' USING errcode = '22023';
  END IF;

  IF p_margem_alvo < p_margem_min OR p_margem_alvo::text IN ('NaN','Infinity','-Infinity') OR p_margem_min::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Margem alvo deve ser maior ou igual à mínima e menor que 100%%' USING errcode='22023';
  END IF;
  FOR k, l IN SELECT * FROM jsonb_each(coalesce(p_linhas, '{}'::jsonb)) LOOP
    IF NOT (k = ANY (public.cc_linhas_validas())) THEN CONTINUE; END IF;  -- ignora royalties/publicidade e lixo
    IF jsonb_typeof(l) <> 'object' THEN RAISE EXCEPTION 'Linha % inválida', k USING errcode = '22023'; END IF;
    v_t := coalesce(l->>'t', 'pct');
    v_b := coalesce(l->>'b', 'v');
    BEGIN v_v := (l->>'v')::numeric; EXCEPTION WHEN others THEN v_v := NULL; END;
    IF v_t NOT IN ('pct','brl') OR (v_t='pct' AND v_b NOT IN ('v','vk')) OR (v_t='brl' AND v_b NOT IN ('v','vk','modulo','kwp')) OR v_v IS NULL OR v_v::text IN ('NaN','Infinity','-Infinity') OR v_v < 0
       OR (v_t = 'pct' AND v_v > 100) THEN
      RAISE EXCEPTION 'Valor inválido em %', k USING errcode = '22023';
    END IF;
    v_out := v_out || jsonb_build_object(k, jsonb_build_object('t', v_t, 'v', round(v_v, 4), 'b', v_b));
  END LOOP;

  INSERT INTO public.fin_centro_custo AS cc (franquia_id, linhas, margem_min, margem_alvo, updated_at, updated_by)
  VALUES (p_franquia_id, v_out, p_margem_min, p_margem_alvo, now(), auth.uid())
  ON CONFLICT (franquia_id) DO UPDATE SET
    linhas = excluded.linhas, margem_min = excluded.margem_min, margem_alvo = excluded.margem_alvo,
    updated_at = now(), updated_by = excluded.updated_by;

  RETURN public.get_centro_custo(p_franquia_id);
END $function$
;

-- RPC interna da integração. O custo nunca é devolvido ao vendedor.
create or replace function private.cc_preco_dimensionado(p_franquia_id uuid, p_kit numeric, p_modulos integer, p_kwp numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  fid uuid := coalesce(p_franquia_id,(select id from public.franquias where tipo='propria' order by created_at limit 1));
  f public.franquias%rowtype; cc public.fin_centro_custo%rowtype;
  linhas jsonb; rede jsonb; r record; x jsonb; val numeric; fixo numeric:=0;
  p numeric:=0; q numeric:=0; m numeric; den numeric; venda numeric; soma numeric;
  roy numeric; pub numeric; proj numeric:=0; cobrar boolean; faixas jsonb; i integer;
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
    linhas := jsonb_set(linhas,'{projeto}', '{"t":"brl","v":0,"b":"v"}');
  end if;
  linhas := linhas || jsonb_build_object('projeto_rede',jsonb_build_object('t','brl','v',proj,'b','v'),
    'royalties',jsonb_build_object('t','pct','v',roy,'b','v'),'publicidade',jsonb_build_object('t','pct','v',pub,'b','v'));
  for r in select key,value from jsonb_each(linhas) loop
    x:=r.value;val:=coalesce((x->>'v')::numeric,0);
    if x->>'t'='brl' then
      val:=round(val * case x->>'b' when 'modulo' then p_modulos when 'kwp' then p_kwp else 1 end,2);
      fixo:=fixo+val;
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
    for x in select value from jsonb_each(linhas) where value->>'t'='pct' loop
      soma:=soma+round((x->>'v')::numeric/100 * case when x->>'b'='vk' then greatest(0,venda-p_kit) else venda end,2);
    end loop;
    exit when venda*(1-m)>=soma;
    venda:=venda+.01;
  end loop;
  return jsonb_build_object('modo','custos','versao',3,'venda',venda,'margem_alvo',m*100,'linhas',linhas,'modulos',p_modulos,'kwp',p_kwp,'fixo',fixo,'projeto_rede',proj,'art_inclusa',cobrar,'franquia_id',fid);
end $$;
revoke all on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric) from public,anon,authenticated;
grant execute on function private.cc_preco_dimensionado(uuid,numeric,integer,numeric) to service_role;
create or replace function public.cc_preco_dimensionado(p_franquia_id uuid,p_kit numeric,p_modulos integer,p_kwp numeric)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.cc_preco_dimensionado(p_franquia_id,p_kit,p_modulos,p_kwp) $$;
revoke all on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric) from public,anon,authenticated;
grant execute on function public.cc_preco_dimensionado(uuid,numeric,integer,numeric) to service_role;

create or replace function private.get_cc_proposta_contexto(p_proposta_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.propostas%rowtype;c public.cotacoes_distribuidora%rowtype; qtd integer;kwp numeric;
begin
  if not public.cc_pode_proposta(p_proposta_id) then raise exception 'Sem permissão' using errcode='42501';end if;
  select * into p from public.propostas where id=p_proposta_id;
  if p.cotacao_id is not null then
    select * into c from public.cotacoes_distribuidora where id=p.cotacao_id;
    return jsonb_build_object('modulos',c.placas,'kwp',c.kwp,'custo',c.custo,'precificacao',c.precificacao);
  end if;
  select sum((i->>'qtd')::numeric)::integer into qtd from jsonb_array_elements(coalesce(p.custom_config->'itens','[]')) i where i->>'tipo'='modulo';
  qtd:=coalesce(qtd,p.custom_modulo_qty,(p.kit_snapshot->'modulo'->>'qtd')::integer,0);
  kwp:=coalesce(p.custom_system_power_kwp,p.kit_power,0);
  return jsonb_build_object('modulos',qtd,'kwp',kwp);
end $$;
revoke all on function private.get_cc_proposta_contexto(uuid) from public,anon;
grant execute on function private.get_cc_proposta_contexto(uuid) to authenticated;
create or replace function public.get_cc_proposta_contexto(p_proposta_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_cc_proposta_contexto(p_proposta_id) $$;
revoke all on function public.get_cc_proposta_contexto(uuid) from public,anon;
grant execute on function public.get_cc_proposta_contexto(uuid) to authenticated;
grant usage on schema private to authenticated,service_role;

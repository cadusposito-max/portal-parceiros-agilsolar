-- Centro de custo: limite "cobra só acima de" nas formas por quantidade (20/10/2026).
-- Ex.: elétrica fixa R$ 600 por obra + R$ 50 por módulo acima de 10 módulos.
-- A linha ganha "acima" (opcional, > 0) nas bases modulo | kwp | inversor | kw_inversor;
-- o valor passa a ser v × max(0, quantidade − acima). Sem "acima", a conta não muda.
-- Mesma conta do assets/js/centro-custo-calc.js. Aditiva: só recria as duas funções.

create or replace function public.set_centro_custo(p_franquia_id uuid, p_linhas jsonb, p_margem_min numeric, p_margem_alvo numeric, p_modo_preco text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  k text; l jsonb; v_t text; v_b text; v_v numeric; v_acima numeric;
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
    -- Limite "cobra só acima de" (só nas formas por quantidade)
    if v_t = 'brl' and v_b in ('modulo','kwp','inversor','kw_inversor') and l ? 'acima' then
      begin v_acima := coalesce((l->>'acima')::numeric, 0); exception when others then v_acima := null; end;
      if v_acima is null or v_acima::text in ('NaN','Infinity','-Infinity') or v_acima < 0 then
        raise exception 'Limite inválido em %', coalesce(l->>'nome', k) using errcode = '22023';
      end if;
      if v_acima > 0 then v_linha := v_linha || jsonb_build_object('acima', round(v_acima, 4)); end if;
    end if;
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

create or replace function private.cc_preco_dimensionado(p_franquia_id uuid, p_kit numeric, p_modulos integer, p_kwp numeric, p_inversores integer default 1, p_kw_inversor numeric default null::numeric)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  fid uuid := coalesce(p_franquia_id,(select id from public.franquias where tipo='propria' order by created_at limit 1));
  f public.franquias%rowtype; cc public.fin_centro_custo%rowtype;
  linhas jsonb; r record; x jsonb; val numeric; fv numeric; fixo numeric:=0; qtd numeric; acima numeric;
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
        qtd := case x->>'b' when 'modulo' then p_modulos when 'kwp' then p_kwp when 'inversor' then inv when 'kw_inversor' then kwi else 1 end;
        -- "cobra só acima de": até o limite fica na parte fixa; acima, só o excedente
        acima := case when x->>'b' in ('modulo','kwp','inversor','kw_inversor') then coalesce((x->>'acima')::numeric,0) else 0 end;
        if acima > 0 then qtd := greatest(qtd - acima, 0); end if;
        val:=round(val * qtd,2);
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
end $function$;

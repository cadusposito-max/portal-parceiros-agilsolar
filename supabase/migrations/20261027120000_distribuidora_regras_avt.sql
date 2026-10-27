-- AVT Energy como distribuidora "de cálculo", igual à Helte (kits do catálogo, outro telhado e modo avançado).
-- A conta da Helte estava fixa nas funções; agora cada distribuidora traz a dela e a Helte continua igual.
-- Regras da AVT levantadas no portal dela em 27/10/2026 (conferidas no centavo em 1.933 kits):
--   estrutura = placas × custo por placa + grupos de 4 (ou 8) placas × custo do grupo;
--   cabo em rolo fechado (4 mm R$ 5/m em mono/micro; 6 mm R$ 6/m em tri), 2 × placas metros por cor;
--   conector = kit com 2 pares (R$ 12,60), quantidade fixa por inversor; no micro, 1 kit por placa;
--   frete: N = peças × 1,02; total = maior entre N + mínimo e N / (1 − p), p por faixa de N (por cidade).

-- Estrutura "por grupo": placas × custo_placa + ceil(placas / placas_mesa) × custo_mesa.
alter table public.estruturas add column if not exists custo_placa numeric;
alter table public.estruturas drop constraint if exists estruturas_modo_check;
alter table public.estruturas add constraint estruturas_modo_check check (modo in ('blocos', 'mesa', 'grupo'));

create or replace function private.cc_custo_estrutura(p_estrutura_id text, p_placas integer)
returns numeric language plpgsql stable set search_path to '' as $function$
declare e public.estruturas%rowtype; par integer;
begin
  select * into e from public.estruturas where id = p_estrutura_id;
  if not found or coalesce(p_placas, 0) <= 0 then return null; end if;
  if e.modo = 'mesa' then return round(ceil(p_placas::numeric / e.placas_mesa) * e.custo_mesa, 2); end if;
  if e.modo = 'grupo' then return round(p_placas * coalesce(e.custo_placa, 0) + ceil(p_placas::numeric / e.placas_mesa) * coalesce(e.custo_mesa, 0), 2); end if;
  par := 2 * ceil(p_placas / 2.0)::integer;
  return round((par / 4) * e.custo_bloco4 + ((par % 4) / 2) * e.custo_bloco2, 2);
end $function$;

-- Frete com regra própria da distribuidora na unidade: {"da": 0.02, "minimo": 420, "faixas": [[4000, 0.105], ..., [null, 0.04]]}.
alter table public.frete_regra_unidade add column if not exists regra jsonb;

-- Ficha do equipamento NA distribuidora (conectores e faixa de kWp com 1 inversor), por cima da ficha geral.
alter table public.distribuidora_componentes add column if not exists ficha jsonb;

-- Arredondamento bancário em centavos (meio centavo vai pro par), como a AVT faz (.NET Math.Round).
create or replace function private.round_par(x numeric)
returns numeric language sql immutable set search_path to '' as $function$
  select case when abs(x * 100 - trunc(x * 100)) = 0.5
              then (trunc(x * 100) + (abs(trunc(x * 100))::bigint % 2) * sign(x)) / 100
              else round(x, 2) end
$function$;

-- Frete da distribuidora para a unidade (sem unidade ou sem regra da unidade: o padrão da distribuidora).
create or replace function private.frete_distribuidora(p_distribuidora_id uuid, p_franquia_id uuid, p_pecas numeric)
returns numeric language plpgsql stable security definer set search_path to '' as $function$
declare f public.frete_regra_unidade%rowtype; r jsonb; n numeric; p numeric;
begin
  if p_pecas is null then return null; end if;
  if p_franquia_id is not null then
    select * into f from public.frete_regra_unidade where franquia_id = p_franquia_id and distribuidora_id = p_distribuidora_id;
  end if;
  r := case when f.franquia_id is not null then f.regra
            else (select d.regras_kit->'frete_padrao' from public.distribuidoras d where d.id = p_distribuidora_id) end;
  if r is not null then
    n := private.round_par(p_pecas * (1 + coalesce((r->>'da')::numeric, 0)));
    select (x->>1)::numeric into p from jsonb_array_elements(r->'faixas') x
     where x->>0 is null or n < (x->>0)::numeric
     order by coalesce((x->>0)::numeric, 1e15) limit 1;
    return private.round_par(greatest(n + coalesce((r->>'minimo')::numeric, 0), n / (1 - coalesce(p, 0)))) - p_pecas;
  end if;
  if f.franquia_id is null then
    return round(case when p_pecas < 25000 then greatest(400, p_pecas * 0.038494) else p_pecas * 0.031394 end, 2);
  end if;
  return round(case when p_pecas < f.limite then greatest(f.minimo_ate, p_pecas * f.pct_ate)
                    else greatest(f.minimo_acima, p_pecas * f.pct_acima) end, 2);
end $function$;

-- Cabo do kit: rolo fechado (regras_kit.cabo.tipo = 'rolo') ou por metro (Helte).
create or replace function private.cabo_kit(p_regras jsonb, p_placas integer, p_tri boolean)
returns jsonb language plpgsql immutable set search_path to '' as $function$
declare c jsonb; m integer; metros integer; maior integer;
begin
  if p_regras->'cabo'->>'tipo' = 'rolo' then
    c := p_regras->'cabo'->(case when p_tri then 'tri' else 'mono' end);
    m := 2 * p_placas;
    select max(x::integer) into maior from jsonb_array_elements_text(c->'rolos') x;
    if m <= maior then select min(x::integer) into metros from jsonb_array_elements_text(c->'rolos') x where x::integer >= m;
    else metros := ceil(m / 100.0)::integer * 100; end if;
    return jsonb_build_object('metros', metros, 'mm', (c->>'mm')::integer, 'custo', round(2 * metros * (c->>'preco_m')::numeric, 2));
  end if;
  metros := case when p_placas <= 19 then 3 * p_placas when p_placas <= 50 then ceil(2.5 * p_placas)::integer else 2 * p_placas end;
  return jsonb_build_object('metros', metros, 'mm', 4, 'custo', round(2 * metros * coalesce((p_regras->>'cabo_m')::numeric, 0), 2));
end $function$;

-- Custo do kit para a unidade: o frete agora vem da regra da distribuidora.
create or replace function private.cc_custo_kit(p_produto_id uuid, p_franquia_id uuid, p_estrutura_id text default null)
returns numeric language plpgsql stable security definer set search_path to '' as $function$
declare pr public.produtos%rowtype; c public.produtos_custo%rowtype;
        e public.estruturas%rowtype; pecas numeric; tam smallint; v_padrao text;
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
    if e.bloqueia_micro and (pr.categoria = 'kitsMicro'
        or exists (select 1 from public.componentes ci where ci.id = pr.inversor_id and (ci.ficha->>'micro')::boolean)) then
      return null;
    end if;
    select es.id into v_padrao from public.estruturas es where es.distribuidora_id = e.distribuidora_id and es.tamanho = tam and es.padrao;
    if v_padrao is null then return null; end if;
    if v_padrao <> e.id then
      pecas := round(pecas - private.cc_custo_estrutura(v_padrao, pr.modulo_qtd) + private.cc_custo_estrutura(e.id, pr.modulo_qtd), 2);
    end if;
  end if;

  if pecas is null then return c.custo; end if;
  if p_franquia_id is null or not exists (select 1 from public.frete_regra_unidade f
                                           where f.franquia_id = p_franquia_id and f.distribuidora_id = pr.distribuidora_id) then
    if p_estrutura_id is null then return c.custo; end if;
    return round(pecas + private.frete_distribuidora(pr.distribuidora_id, null, pecas), 2);
  end if;
  return round(pecas + private.frete_distribuidora(pr.distribuidora_id, p_franquia_id, pecas), 2);
end $function$;

-- Opções do modo avançado: faixa da distribuidora primeiro; tensões que a distribuidora monta (220 e/ou 380).
create or replace function public.kit_montado_opcoes(p_distribuidora_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare d public.distribuidoras%rowtype; redes text[];
begin
  if not private.kit_montado_pode() then raise exception 'Sem permissão para montar kit.' using errcode = '42501'; end if;
  select * into d from public.distribuidoras where id = p_distribuidora_id and ativo;
  if not found or d.regras_kit is null then return jsonb_build_object('modulos', '[]'::jsonb, 'inversores', '[]'::jsonb); end if;
  redes := array['mono_220', 'tri_220'] || case when d.regras_kit->'tensoes' ? '380' then array['tri_380'] else '{}'::text[] end;
  return jsonb_build_object(
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'marca', c.marca, 'potencia_wp', c.potencia_wp,
        'tamanho', private.cc_tamanho_modulo(c.id)) order by c.potencia_wp, c.nome)
      from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
     where dc.distribuidora_id = d.id and dc.ativo and c.ativo and c.tipo = 'modulo' and coalesce(dc.preco_unitario, 0) > 0), '[]'::jsonb),
    'inversores', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'marca', c.marca, 'kw', c.potencia_wp / 1000,
        'rede', case when (c.ficha->>'micro')::boolean then 'micro' else c.ficha->>'rede' end,
        'faixa_kwp', coalesce(dc.ficha->'faixa_kwp', c.ficha->'faixa_kwp'))
        order by (c.ficha->>'micro')::boolean nulls first, c.potencia_wp, c.marca)
      from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
     where dc.distribuidora_id = d.id and dc.ativo and c.tipo = 'inversor' and coalesce(dc.preco_unitario, 0) > 0
       and not coalesce((c.ficha->>'hibrido')::boolean, false)
       and c.potencia_wp / 1000 <= coalesce((d.regras_kit->>'kw_max')::numeric, 75)
       and ((c.ficha->>'micro')::boolean or c.ficha->>'rede' = any(redes))
       and (dc.ficha ? 'pares_conector' or c.ficha ? 'pares_conector' or (c.ficha->>'micro')::boolean)), '[]'::jsonb));
end $function$;

-- Kit montado: cabo, conectores, extras do micro e frete pela regra da distribuidora.
create or replace function private.kit_montado_calcular(p_distribuidora_id uuid, p_franquia_id uuid, p_modulo_id uuid, p_placas integer,
                                                        p_inversores jsonb, p_estrutura_id text)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare d public.distribuidoras%rowtype; r jsonb; m record; e public.estruturas%rowtype;
        tam smallint; est_id text; est_custo numeric; pecas numeric; frete numeric; custo numeric; kwp numeric;
        inv jsonb := '[]'::jsonb; x record; un jsonb := '[]'::jsonb; kw_tot numeric := 0; qtd_tot integer := 0; micro_n integer := 0; str_n integer := 0;
        redes text[] := '{}'; erros text[] := '{}'; avisos text[] := '{}'; linhas jsonb := '[]'::jsonb; k integer; u record;
        cabo jsonb; pares integer := 0; inv_valor numeric := 0; seguro numeric := 0; ol numeric; marcas text[] := '{}';
begin
  select * into d from public.distribuidoras where id = p_distribuidora_id and ativo;
  if not found or d.regras_kit is null then return jsonb_build_object('ok', false, 'erros', jsonb_build_array('Essa distribuidora não monta kit pela plataforma.')); end if;
  r := d.regras_kit;
  if coalesce(p_placas, 0) < 1 or p_placas > 300 then return jsonb_build_object('ok', false, 'erros', jsonb_build_array('Informe a quantidade de placas.')); end if;
  select c.id, c.nome, c.marca, c.potencia_wp, dc.preco_unitario preco into m
    from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
   where dc.distribuidora_id = d.id and dc.componente_id = p_modulo_id and dc.ativo and c.tipo = 'modulo';
  if not found then return jsonb_build_object('ok', false, 'erros', jsonb_build_array('Módulo indisponível nessa distribuidora.')); end if;
  kwp := round(p_placas * m.potencia_wp / 1000, 3);
  tam := private.cc_tamanho_modulo(m.id);

  for x in select (j->>'id')::uuid id, greatest(1, least(200, coalesce((j->>'qtd')::integer, 1))) qtd
             from jsonb_array_elements(coalesce(p_inversores, '[]'::jsonb)) j loop
    select c.id, c.nome, c.marca, c.potencia_wp / 1000 kw, dc.preco_unitario preco, coalesce((c.ficha->>'micro')::boolean, false) micro,
           c.ficha->>'rede' rede, coalesce((dc.ficha->>'pares_conector')::integer, (c.ficha->>'pares_conector')::integer, 0) pares,
           coalesce(dc.ficha->'faixa_kwp', c.ficha->'faixa_kwp') faixa into u
      from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
     where dc.distribuidora_id = d.id and dc.componente_id = x.id and dc.ativo and c.tipo = 'inversor' and coalesce(dc.preco_unitario, 0) > 0;
    if not found then erros := erros || 'Um dos inversores não está disponível nessa distribuidora.'::text; continue; end if;
    inv := inv || jsonb_build_object('id', u.id, 'nome', u.nome, 'marca', u.marca, 'kw', u.kw, 'qtd', x.qtd, 'micro', u.micro,
                                     'pares', u.pares, 'faixa', u.faixa, 'preco', u.preco);
    if u.micro then micro_n := micro_n + x.qtd; else str_n := str_n + x.qtd; redes := redes || coalesce(u.rede, ''); end if;
    kw_tot := kw_tot + u.kw * x.qtd; qtd_tot := qtd_tot + x.qtd;
    if not (upper(coalesce(u.marca, '')) = any(marcas)) then marcas := marcas || upper(coalesce(u.marca, '')); end if;
  end loop;
  if jsonb_array_length(inv) = 0 then erros := erros || 'Escolha pelo menos um inversor.'::text; end if;
  if micro_n > 0 and str_n > 0 then erros := erros || 'Não dá pra misturar microinversor com inversor de string no mesmo kit.'::text; end if;
  if (select count(distinct rr.rede) from unnest(redes) as rr(rede)) > 1 then erros := erros || 'Os inversores precisam ser da mesma fase (todos monofásicos ou todos trifásicos).'::text; end if;

  est_id := coalesce(p_estrutura_id, (select id from public.estruturas where distribuidora_id = d.id and tamanho = tam and padrao));
  select * into e from public.estruturas where id = est_id and ativo and distribuidora_id = d.id;
  if not found or e.tamanho <> tam then erros := erros || 'A distribuidora não tem essa estrutura para o módulo escolhido.'::text;
  elsif e.bloqueia_micro and micro_n > 0 then erros := erros || 'Microinversor não cabe no mini trilho baixo. Troque o telhado.'::text;
  else est_custo := private.cc_custo_estrutura(e.id, p_placas); end if;

  if micro_n > 0 and str_n = 0 then
    if micro_n * coalesce((r->>'placas_por_micro')::integer, 4) < p_placas then
      erros := erros || format('Faltam microinversores: %s micros ligam %s placas e o kit tem %s.', micro_n, micro_n * coalesce((r->>'placas_por_micro')::integer, 4), p_placas);
    end if;
    linhas := (select jsonb_agg(jsonb_build_object('id', i->>'id', 'qtd', (i->>'qtd')::integer, 'placas_min', null, 'placas_max', null, 'ok', true)) from jsonb_array_elements(inv) i);
  elsif str_n > 0 and micro_n = 0 then
    with unidades as (
      select i.ord, g, (i.v->>'kw')::numeric kw, p_placas * (i.v->>'kw')::numeric / kw_tot ideal
        from jsonb_array_elements(inv) with ordinality i(v, ord), generate_series(1, (i.v->>'qtd')::integer) g
    ), base as (select *, floor(ideal)::integer p, ideal - floor(ideal) frac from unidades),
    sobra as (select p_placas - sum(p)::integer s from base),
    final as (select b.ord, b.g, b.p + case when row_number() over (order by b.frac desc, b.ord, b.g) <= (select s from sobra) then 1 else 0 end placas from base b)
    select jsonb_agg(jsonb_build_object('ord', ord, 'placas', placas) order by ord, g) into un from final;
    for k in 1 .. jsonb_array_length(inv) loop
      declare v jsonb := inv -> (k - 1); pmin integer; pmax integer; fmin integer; fmax integer; ok boolean := true;
      begin
        select min((x2->>'placas')::integer), max((x2->>'placas')::integer) into pmin, pmax from jsonb_array_elements(un) x2 where (x2->>'ord')::integer = k;
        if jsonb_typeof(v->'faixa') = 'array' then
          fmin := ceil(((v->'faixa'->>0)::numeric) * 1000 / m.potencia_wp); fmax := floor(((v->'faixa'->>1)::numeric) * 1000 / m.potencia_wp);
          ok := pmin >= fmin and pmax <= fmax;
          if not ok then erros := erros || format('%s fica com %s placas e aguenta de %s a %s.', v->>'nome', case when pmin = pmax then pmin::text else pmin || ' a ' || pmax end, fmin, fmax); end if;
        end if;
        linhas := linhas || jsonb_build_object('id', v->>'id', 'qtd', (v->>'qtd')::integer, 'placas_min', pmin, 'placas_max', pmax,
                                               'faixa_min', fmin, 'faixa_max', fmax, 'ok', ok);
      end;
    end loop;
    ol := round(kwp / nullif(kw_tot, 0) * 100);
    if ol > 135 then avisos := avisos || format('Overload de %s%%: dentro do limite da distribuidora, confira com a engenharia.', ol); end if;
  end if;

  cabo := private.cabo_kit(r, p_placas, micro_n = 0 and exists (select 1 from unnest(redes) rr where rr like 'tri%'));
  select coalesce(sum((i->>'qtd')::integer * (i->>'preco')::numeric), 0),
         coalesce(sum(case when (i->>'micro')::boolean then
                    case when r->>'conectores_micro' = 'placa' then 0 else (i->>'qtd')::integer * coalesce((r->>'pares_por_micro')::integer, 4) end
                  else (i->>'qtd')::integer * (i->>'pares')::integer end), 0)
           + case when micro_n > 0 and r->>'conectores_micro' = 'placa' then p_placas else 0 end,
         coalesce(sum(case when (i->>'micro')::boolean then (i->>'qtd')::integer * coalesce((r->>'fix_micro')::numeric, 0) else 0 end), 0)
           + coalesce(sum(coalesce((r->'seguro'->>upper(i->>'marca'))::numeric, 0)), 0)
    into inv_valor, pares, seguro from jsonb_array_elements(inv) i;
  pecas := round(p_placas * m.preco + inv_valor + pares * coalesce((r->>'conector_par')::numeric, 12)
                 + (cabo->>'custo')::numeric + coalesce(est_custo, 0) + seguro, 2);
  frete := private.frete_distribuidora(d.id, p_franquia_id, pecas);
  custo := pecas + frete;

  return jsonb_build_object('ok', cardinality(erros) = 0, 'erros', to_jsonb(erros), 'avisos', to_jsonb(avisos),
    'modulo', jsonb_build_object('id', m.id, 'nome', m.nome, 'marca', m.marca, 'potencia_wp', m.potencia_wp, 'qtd', p_placas),
    'inversores', inv, 'linhas', linhas, 'divisao', (select jsonb_agg((x3->>'placas')::integer) from jsonb_array_elements(un) x3),
    'kwp', kwp, 'kw_inversores', kw_tot, 'qtd_inversores', qtd_tot, 'micro', micro_n > 0, 'overload', ol,
    'estrutura', case when e.id is null then null else jsonb_build_object('id', e.id, 'telhado', e.telhado, 'nome', e.telhado_nome, 'linha', e.linha) end,
    'custo', custo, 'pecas', pecas, 'frete', frete, 'cabo_m', (cabo->>'metros')::integer, 'cabo_mm', (cabo->>'mm')::integer,
    'pares', pares, 'conector_nome', coalesce(r->>'conector_nome', 'Par de conectores'), 'estrutura_custo', est_custo);
end $function$;

-- Itens da cotação com a bitola do cabo e o conector da distribuidora (antes fixo "4 mm" e "Par de conectores").
create or replace function public.kit_montado_cotar(p_distribuidora_id uuid, p_modulo_id uuid, p_placas integer, p_inversores jsonb,
                                                    p_estrutura_id text default null, p_salvar boolean default false, p_franquia_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare unidade uuid; c jsonb; preco numeric; de numeric; v jsonb; prec jsonb; titulo text; cot uuid; invs text;
begin
  if not private.kit_montado_pode() then raise exception 'Sem permissão para montar kit.' using errcode = '42501'; end if;
  unidade := case when public.is_admin() and p_franquia_id is not null then p_franquia_id
                  else coalesce(public.get_franquia_id(), public.franqueado_franquia_id()) end;
  c := private.kit_montado_calcular(p_distribuidora_id, unidade, p_modulo_id, p_placas, p_inversores, p_estrutura_id);
  if not (c->>'ok')::boolean or (c->>'custo') is null then
    return jsonb_build_object('ok', false, 'erros', c->'erros', 'avisos', coalesce(c->'avisos', '[]'::jsonb), 'linhas', coalesce(c->'linhas', '[]'::jsonb),
                              'divisao', c->'divisao', 'kwp', c->'kwp', 'overload', c->'overload', 'kw_inversores', c->'kw_inversores');
  end if;
  if private.cc_modo_preco(unidade) = 'custos' then
    v := private.cc_preco_dimensionado(unidade, (c->>'custo')::numeric, p_placas, (c->>'kwp')::numeric, (c->>'qtd_inversores')::integer, (c->>'kw_inversores')::numeric);
    preco := (v->>'venda')::numeric; prec := jsonb_build_object('modo', 'custos') || coalesce(v, '{}'::jsonb);
  else
    preco := private.cc_preco_markup((c->>'custo')::numeric, (c->>'micro')::boolean); prec := jsonb_build_object('modo', 'markup');
  end if;
  de := private.cc_preco_de(preco);
  invs := (select string_agg(case when (i->>'micro')::boolean then (i->>'qtd') || '× MICROINVERSOR ' || upper(coalesce(i->>'marca', ''))
                                  else (i->>'qtd') || '× INV. ' || upper(coalesce(i->>'marca', '')) || ' ' || replace(trim_scale((i->>'kw')::numeric)::text, '.', ',') || 'KW' end, ' + ')
             from jsonb_array_elements(c->'inversores') i);
  titulo := format('KIT %s MOD. %sW + %s', p_placas, trim(to_char((c->'modulo'->>'potencia_wp')::numeric, 'FM9999')), invs);
  if p_salvar then
    insert into public.cotacoes_distribuidora (provedor, distribuidora_id, franquia_id, criado_por, categoria, placas, kwp, titulo, marca,
                                               modulo, inversor, itens, custo, detalhe_custo, preco, preco_de, precificacao)
    values ('calculo', p_distribuidora_id, unidade, auth.uid(), case when (c->>'micro')::boolean then 'kitsMicro' else 'kitsInversor' end,
            p_placas, (c->>'kwp')::numeric, titulo, c->'modulo'->>'marca',
            c->'modulo',
            jsonb_build_object('qtd', (c->>'qtd_inversores')::integer, 'nome', invs, 'micro', (c->>'micro')::boolean,
                               'marca', (select string_agg(distinct upper(i->>'marca'), ' + ') from jsonb_array_elements(c->'inversores') i),
                               'potencia_wp', round((c->>'kw_inversores')::numeric * 1000 / greatest((c->>'qtd_inversores')::integer, 1), 2),
                               'modelos', (select jsonb_agg(jsonb_build_object('id', i->>'id', 'nome', i->>'nome', 'marca', i->>'marca', 'qtd', (i->>'qtd')::integer,
                                                                                'potencia_wp', (i->>'kw')::numeric * 1000)) from jsonb_array_elements(c->'inversores') i)),
            jsonb_build_array(jsonb_build_object('tipo', 'modulo', 'descricao', c->'modulo'->>'nome', 'qtd', p_placas))
              || coalesce((select jsonb_agg(jsonb_build_object('tipo', case when (i->>'micro')::boolean then 'micro' else 'inversor' end, 'descricao', i->>'nome', 'qtd', (i->>'qtd')::integer))
                             from jsonb_array_elements(c->'inversores') i), '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('tipo', 'estrutura', 'descricao', 'Estrutura ' || coalesce(c->'estrutura'->>'nome', '') , 'qtd', 1),
                                   jsonb_build_object('tipo', 'outro', 'descricao', 'Cabo solar ' || coalesce(c->>'cabo_mm', '4') || ' mm (preto e vermelho)', 'qtd', 2 * (c->>'cabo_m')::integer),
                                   jsonb_build_object('tipo', 'outro', 'descricao', coalesce(c->>'conector_nome', 'Par de conectores'), 'qtd', (c->>'pares')::integer)),
            (c->>'custo')::numeric,
            jsonb_build_object('pecas', c->'pecas', 'frete', c->'frete', 'estrutura', c->'estrutura', 'estrutura_custo', c->'estrutura_custo',
                               'divisao', c->'divisao', 'inversores', c->'inversores', 'montado', true),
            preco, de, prec)
    returning id into cot;
  end if;
  return jsonb_build_object('ok', true, 'avisos', c->'avisos', 'linhas', c->'linhas', 'divisao', c->'divisao', 'titulo', titulo,
    'kwp', c->'kwp', 'kw_inversores', c->'kw_inversores', 'overload', c->'overload', 'micro', c->'micro', 'categoria', case when (c->>'micro')::boolean then 'kitsMicro' else 'kitsInversor' end,
    'preco', preco, 'preco_de', de, 'cotacao_id', cot, 'estrutura', c->'estrutura')
    || case when public.is_admin() then jsonb_build_object('custo', c->'custo') else '{}'::jsonb end;
end $function$;

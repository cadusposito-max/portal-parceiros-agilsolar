-- Orçamento no MODO AVANÇADO (kit montado pelo vendedor): admin, gestor e franqueado.
-- O vendedor escolhe distribuidora, módulo, quantidade EXATA de placas, telhado e quantos
-- inversores quiser (vários modelos, qualquer quantidade). A plataforma só confere e calcula.
-- Distribuidora "de cálculo" (Helte): preço peça a peça com a regra conferida em 15/10/2026
-- (módulos + inversores + conectores + cabo + estrutura + frete da unidade), igual aos kits.
-- A proposta usa o caminho da cotação (cotacoes_distribuidora, provedor 'calculo'): preço
-- travado no servidor, custo no DRE e equipamentos pra engenharia, como a cotação da Belenus.
-- Depende de 20261015170000_estruturas.sql.

-- Regras de montagem por distribuidora (só as de cálculo têm).
alter table public.distribuidoras add column if not exists regras_kit jsonb;
update public.distribuidoras set regras_kit = jsonb_build_object(
  'modo', 'calculo', 'cabo_m', 4.25, 'conector_par', 12.00, 'fix_micro', 9.00, 'placas_por_micro', 4, 'pares_por_micro', 4,
  'seguro', jsonb_build_object('GROWATT', 1.00, 'GOODWE', 1.00), 'tensoes', jsonb_build_array('220'), 'kw_max', 75)
 where id = '23a51365-a37f-444c-9c45-22645515f2cc';

-- Preços de módulo conferidos peça a peça (15/10).
update public.distribuidora_componentes dc set preco_unitario = v.preco
  from (values ('8623e833-03d7-4b46-9c79-3a3a62003e53'::uuid, 520.00), ('dffc81b2-d203-4f6d-8b61-57cd822461a0'::uuid, 613.76),
               ('4a7f1549-9510-4475-ad9b-b8cafb6ce316'::uuid, 540.00), ('c799745d-2d85-46e0-b7da-24a40fdb6868'::uuid, 548.00)) v(id, preco)
 where dc.componente_id = v.id and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc';

-- Inversores da Helte: ids que faltavam, pares de conector e faixa de potência DC (kWp) em que a
-- Helte sugere 1 inversor (varredura de 15/10). Unipower é sistema com bateria: fora do modo avançado.
update public.componentes c set ficha = coalesce(c.ficha, '{}'::jsonb) || jsonb_build_object('helte_id', v.hid)
  from (values ('1be9f104-1c6e-4b60-8f20-65a99953f682'::uuid, 1647054), ('6608cc1a-6e6d-474f-ba5f-6024a5652e41'::uuid, 1647055),
               ('84385f24-8f7f-444e-81a0-6828970baa70'::uuid, 1647056), ('add74485-0616-4ffa-a8e4-f374b476d055'::uuid, 1647057),
               ('24f0cede-787e-4390-a538-1b02dd7c34d4'::uuid, 1646904), ('7468c64b-40c1-4b03-8cd9-5af8dcc29a07'::uuid, 1646998),
               ('c799745d-2d85-46e0-b7da-24a40fdb6868'::uuid, 1647000)) v(id, hid)
 where c.id = v.id;
update public.componentes set ficha = ficha || '{"hibrido": true}'::jsonb where ficha->>'helte_id' in ('1647011', '1647012');
update public.componentes set ficha = ficha || '{"rede": "mono_220"}'::jsonb where id = '7468c64b-40c1-4b03-8cd9-5af8dcc29a07';
update public.componentes c set ficha = c.ficha || jsonb_strip_nulls(jsonb_build_object('pares_conector', v.pares, 'faixa_kwp', v.faixa))
  from (values
    (93, 8, jsonb_build_array(9.0, 21.24)),
    (108, 4, null),
    (115, 24, null),
    (874, 20, null),
    (3030, 6, jsonb_build_array(9.0, 25.37)),
    (3037, 6, null),
    (3038, 6, null),
    (3803, 1, jsonb_build_array(2.36, 3.54)),
    (3811, 4, null),
    (3813, 6, null),
    (3814, 6, null),
    (3815, 6, null),
    (3819, 20, null),
    (3820, 24, null),
    (3821, 24, null),
    (4650, 1, jsonb_build_array(1.18, 2.36)),
    (4651, 1, jsonb_build_array(1.77, 2.95)),
    (4656, 3, jsonb_build_array(5.31, 10.62)),
    (4659, 4, jsonb_build_array(7.67, 14.75)),
    (4660, 2, null),
    (4661, 2, null),
    (4662, 3, null),
    (4663, 14, null),
    (4664, 20, null),
    (4665, 20, null),
    (4667, 20, null),
    (4668, 24, null),
    (4677, 8, jsonb_build_array(22.5, 63.72)),
    (4685, 5, null),
    (4686, 12, jsonb_build_array(18.0, 38.94)),
    (4687, 12, jsonb_build_array(21.6, 46.61)),
    (4688, 16, jsonb_build_array(45.0, 94.4)),
    (5111, 16, jsonb_build_array(36.0, 89.68)),
    (5112, 16, jsonb_build_array(30.0, 74.93)),
    (5113, 8, jsonb_build_array(12.0, 29.5)),
    (5406, 3, jsonb_build_array(7.08, 14.16)),
    (5408, 4, null),
    (5411, 2, null),
    (5412, 3, null),
    (5413, 4, null),
    (5414, 12, null),
    (5418, 2, null),
    (5510, 4, null),
    (5512, 2, null),
    (5516, 12, null),
    (5517, 10, null),
    (5567, 4, null),
    (6038, 2, jsonb_build_array(3.54, 8.26)),
    (6042, 6, jsonb_build_array(7.67, 15.93)),
    (6046, 6, null),
    (6047, 10, null),
    (6049, 18, null),
    (6050, 18, null),
    (6053, 10, jsonb_build_array(18.0, 50.74)),
    (6055, 18, jsonb_build_array(45.0, 118.0)),
    (6349, 12, jsonb_build_array(15.0, 31.86)),
    (6765, 8, jsonb_build_array(9.0, 22.42)),
    (6953, 6, null),
    (7133, 6, jsonb_build_array(9.0, 24.78)),
    (7135, 8, jsonb_build_array(12.0, 33.63)),
    (7136, 4, jsonb_build_array(15.0, 42.48)),
    (7205, 4, null),
    (7207, 6, null),
    (1646903, 4, jsonb_build_array(4.72, 10.03)),
    (1646904, 4, jsonb_build_array(5.9, 12.39)),
    (1647011, 1, null),
    (1647012, 0, null),
    (1647013, 2, jsonb_build_array(3.54, 8.26)),
    (1647052, 16, jsonb_build_array(45.0, 118.0)),
    (1647054, 1, jsonb_build_array(2.36, 4.72)),
    (1647055, 2, jsonb_build_array(3.54, 8.26)),
    (1647056, 2, jsonb_build_array(4.72, 10.03)),
    (1647057, 2, jsonb_build_array(5.9, 10.62)),
    (1647058, 3, jsonb_build_array(8.26, 15.93))
  ) v(hid, pares, faixa)
 where c.tipo = 'inversor' and c.ficha->>'helte_id' = v.hid::text;

-- Inversores da Helte que mudaram de preço (conferido 15/10).
update public.distribuidora_componentes dc set preco_unitario = v.preco
  from public.componentes c, (values (4660, 2500.00), (4661, 2600.00), (4662, 2700.00), (4663, 12000.00), (4664, 14500.00),
                                      (4665, 15500.00), (4667, 16500.00), (4668, 33500.00), (4685, 3700.00)) v(hid, preco)
 where dc.componente_id = c.id and c.ficha->>'helte_id' = v.hid::text and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc';

-- Quem pode montar kit.
create or replace function private.kit_montado_pode()
returns boolean language sql stable security definer set search_path to '' as $function$
  select public.is_admin() or public.is_gestor() or public.is_franqueado()
$function$;

-- Equipamentos que a distribuidora oferece para montar (sem preço de custo).
create or replace function public.kit_montado_opcoes(p_distribuidora_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare d public.distribuidoras%rowtype;
begin
  if not private.kit_montado_pode() then raise exception 'Sem permissão para montar kit.' using errcode = '42501'; end if;
  select * into d from public.distribuidoras where id = p_distribuidora_id and ativo;
  if not found or d.regras_kit is null then return jsonb_build_object('modulos', '[]'::jsonb, 'inversores', '[]'::jsonb); end if;
  return jsonb_build_object(
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'marca', c.marca, 'potencia_wp', c.potencia_wp,
        'tamanho', private.cc_tamanho_modulo(c.id)) order by c.potencia_wp, c.nome)
      from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
     where dc.distribuidora_id = d.id and dc.ativo and c.ativo and c.tipo = 'modulo' and coalesce(dc.preco_unitario, 0) > 0), '[]'::jsonb),
    'inversores', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'marca', c.marca, 'kw', c.potencia_wp / 1000,
        'rede', case when (c.ficha->>'micro')::boolean then 'micro' else c.ficha->>'rede' end, 'faixa_kwp', c.ficha->'faixa_kwp')
        order by (c.ficha->>'micro')::boolean nulls first, c.potencia_wp, c.marca)
      from public.distribuidora_componentes dc join public.componentes c on c.id = dc.componente_id
     where dc.distribuidora_id = d.id and dc.ativo and c.tipo = 'inversor' and coalesce(dc.preco_unitario, 0) > 0
       and not coalesce((c.ficha->>'hibrido')::boolean, false)
       and c.potencia_wp / 1000 <= coalesce((d.regras_kit->>'kw_max')::numeric, 75)
       and ((c.ficha->>'micro')::boolean or c.ficha->>'rede' in ('mono_220', 'tri_220'))
       and (c.ficha ? 'pares_conector' or (c.ficha->>'micro')::boolean)), '[]'::jsonb));
end $function$;

-- Confere e calcula o kit montado. p_inversores = [{"id": uuid, "qtd": n}, ...]
create or replace function private.kit_montado_calcular(p_distribuidora_id uuid, p_franquia_id uuid, p_modulo_id uuid, p_placas integer,
                                                        p_inversores jsonb, p_estrutura_id text)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare d public.distribuidoras%rowtype; r jsonb; m record; e public.estruturas%rowtype; f public.frete_regra_unidade%rowtype;
        tam smallint; est_id text; est_custo numeric; pecas numeric; frete numeric; custo numeric; kwp numeric;
        inv jsonb := '[]'::jsonb; x record; un jsonb := '[]'::jsonb; kw_tot numeric := 0; qtd_tot integer := 0; micro_n integer := 0; str_n integer := 0;
        redes text[] := '{}'; erros text[] := '{}'; avisos text[] := '{}'; resto integer; linhas jsonb := '[]'::jsonb; k integer; u record;
        cabo integer; pares integer := 0; inv_valor numeric := 0; seguro numeric := 0; ol numeric; marcas text[] := '{}';
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

  -- inversores escolhidos
  for x in select (j->>'id')::uuid id, greatest(1, least(200, coalesce((j->>'qtd')::integer, 1))) qtd
             from jsonb_array_elements(coalesce(p_inversores, '[]'::jsonb)) j loop
    select c.id, c.nome, c.marca, c.potencia_wp / 1000 kw, dc.preco_unitario preco, coalesce((c.ficha->>'micro')::boolean, false) micro,
           c.ficha->>'rede' rede, coalesce((c.ficha->>'pares_conector')::integer, 0) pares, c.ficha->'faixa_kwp' faixa into u
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

  -- estrutura do telhado (padrão do tamanho do módulo se não escolheu)
  est_id := coalesce(p_estrutura_id, (select id from public.estruturas where distribuidora_id = d.id and tamanho = tam and padrao));
  select * into e from public.estruturas where id = est_id and ativo and distribuidora_id = d.id;
  if not found or e.tamanho <> tam then erros := erros || 'A distribuidora não tem essa estrutura para o módulo escolhido.'::text;
  elsif e.bloqueia_micro and micro_n > 0 then erros := erros || 'Microinversor não cabe no mini trilho baixo. Troque o telhado.'::text;
  else est_custo := private.cc_custo_estrutura(e.id, p_placas); end if;

  -- divisão das placas: micro liga N placas por unidade; string reparte proporcional à potência
  if micro_n > 0 and str_n = 0 then
    if micro_n * coalesce((r->>'placas_por_micro')::integer, 4) < p_placas then
      erros := erros || format('Faltam microinversores: %s micros ligam %s placas e o kit tem %s.', micro_n, micro_n * coalesce((r->>'placas_por_micro')::integer, 4), p_placas);
    end if;
    linhas := (select jsonb_agg(jsonb_build_object('id', i->>'id', 'qtd', (i->>'qtd')::integer, 'placas_min', null, 'placas_max', null, 'ok', true)) from jsonb_array_elements(inv) i);
  elsif str_n > 0 and micro_n = 0 then
    -- unidades com a parte inteira e a sobra pelas maiores frações
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

  -- custo peça a peça
  cabo := case when p_placas <= 19 then 3 * p_placas when p_placas <= 50 then ceil(2.5 * p_placas)::integer else 2 * p_placas end;
  select coalesce(sum((i->>'qtd')::integer * (i->>'preco')::numeric), 0),
         coalesce(sum((i->>'qtd')::integer * case when (i->>'micro')::boolean then coalesce((r->>'pares_por_micro')::integer, 4) else (i->>'pares')::integer end), 0),
         coalesce(sum(case when (i->>'micro')::boolean then (i->>'qtd')::integer * coalesce((r->>'fix_micro')::numeric, 0) else 0 end), 0)
           + coalesce(sum(coalesce((r->'seguro'->>upper(i->>'marca'))::numeric, 0)), 0)
    into inv_valor, pares, seguro from jsonb_array_elements(inv) i;
  pecas := round(p_placas * m.preco + inv_valor + pares * coalesce((r->>'conector_par')::numeric, 12)
                 + 2 * cabo * coalesce((r->>'cabo_m')::numeric, 0) + coalesce(est_custo, 0) + seguro, 2);
  select * into f from public.frete_regra_unidade where franquia_id = p_franquia_id and distribuidora_id = d.id;
  frete := round(case when f.franquia_id is null then (case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end)
                      when pecas < f.limite then greatest(f.minimo_ate, pecas * f.pct_ate) else greatest(f.minimo_acima, pecas * f.pct_acima) end, 2);
  custo := pecas + frete;

  return jsonb_build_object('ok', cardinality(erros) = 0, 'erros', to_jsonb(erros), 'avisos', to_jsonb(avisos),
    'modulo', jsonb_build_object('id', m.id, 'nome', m.nome, 'marca', m.marca, 'potencia_wp', m.potencia_wp, 'qtd', p_placas),
    'inversores', inv, 'linhas', linhas, 'divisao', (select jsonb_agg((x3->>'placas')::integer) from jsonb_array_elements(un) x3),
    'kwp', kwp, 'kw_inversores', kw_tot, 'qtd_inversores', qtd_tot, 'micro', micro_n > 0, 'overload', ol,
    'estrutura', case when e.id is null then null else jsonb_build_object('id', e.id, 'telhado', e.telhado, 'nome', e.telhado_nome, 'linha', e.linha) end,
    'custo', custo, 'pecas', pecas, 'frete', frete, 'cabo_m', cabo, 'pares', pares, 'estrutura_custo', est_custo);
end $function$;

-- Simula (p_salvar = false) ou grava a cotação do kit montado (p_salvar = true, na hora de gerar a proposta).
create or replace function public.kit_montado_cotar(p_distribuidora_id uuid, p_modulo_id uuid, p_placas integer, p_inversores jsonb,
                                                    p_estrutura_id text default null, p_salvar boolean default false, p_franquia_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path to '' as $function$
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
                                   jsonb_build_object('tipo', 'outro', 'descricao', 'Cabo solar 4 mm (preto e vermelho)', 'qtd', 2 * (c->>'cabo_m')::integer),
                                   jsonb_build_object('tipo', 'outro', 'descricao', 'Par de conectores', 'qtd', (c->>'pares')::integer)),
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

revoke all on function public.kit_montado_opcoes(uuid) from public, anon;
revoke all on function public.kit_montado_cotar(uuid, uuid, integer, jsonb, text, boolean, uuid) from public, anon;
grant execute on function public.kit_montado_opcoes(uuid) to authenticated;
grant execute on function public.kit_montado_cotar(uuid, uuid, integer, jsonb, text, boolean, uuid) to authenticated;

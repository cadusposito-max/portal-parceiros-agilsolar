-- 28/10/2026: checagem de preços da Helte. Preços exatos pelo "delta" nos orçamentos 3956000–3956003
-- (cotações reais: 10×620 SOFAR 5K = 8.895,97; 60×620 Growatt 30K = 49.425,15; 10×710 SOFAR 5K = 9.515,40).
-- Subiram: módulo RONMA 620W 548,00 → 575,71; ERA 710W 613,76 → 632,44; GOKIN 620W ~579,70 (0,935 R$/W);
-- inversores CHINT, SOFAR e HYXIPOWER +5%. Conector, cabo, fixações e perfis iguais.
-- Pedido do usuário:
--   * micros NÃO mudam (o Hoymiles HMS-2250 saiu da Helte, mas os kits micro ficam como estão, custo e preço);
--   * kits com inversor do catálogo completo: custo exato novo + preço pela regra (Matriz e Goiânia, que usam o catálogo geral);
--   * promocionais de 5 a 9 placas: inversor trocado pelo HYXIPOWER 3,6K, preço tabelado mantido;
--   * Solis 75K-5G-PRO saiu da Helte: oferta desligada.

-- 1) Ofertas da Helte
with novo(helte, preco) as (values
  ('1647000', 575.71), ('1647049', 632.44), ('1647015', 579.70),
  ('6038', 1751.44), ('1647013', 1751.44), ('1646903', 1850.20), ('1646904', 2496.57), ('6042', 3415.04),
  ('7133', 7073.06), ('7135', 7159.21), ('7136', 9063.29), ('6053', 9388.54), ('6055', 19950.00),
  ('1647054', 1468.95), ('1647055', 1669.50), ('1647056', 1774.50), ('1647057', 2730.00),
  ('1647065', 1459.50), ('1647066', 1614.52), ('1647067', 1722.16), ('1647068', 2026.50)
), ofe as (
  update public.distribuidora_componentes dc set preco_unitario = n.preco
    from public.componentes c join novo n on n.helte = c.ficha->>'helte_id'
   where dc.componente_id = c.id and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc'
  returning dc.componente_id
), fora as (
  update public.distribuidora_componentes dc set ativo = false
    from public.componentes c
   where dc.componente_id = c.id and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc' and c.ficha->>'helte_id' = '6165'
  returning dc.componente_id
)
select (select count(*) from ofe) ofertas_atualizadas, (select count(*) from fora) ofertas_desligadas;

-- 2) Custo dos kits com inversor do catálogo (peças + diferença × quantidade; frete de Araçatuba)
with mud(helte, antes, hoje) as (values
  ('1647000', 548.00, 575.71), ('1647049', 613.76, 632.44),
  ('6038', 1668.04, 1751.44), ('1647013', 1668.04, 1751.44), ('1646903', 1762.10, 1850.20), ('1646904', 2377.69, 2496.57), ('6042', 3252.42, 3415.04),
  ('7133', 6736.25, 7073.06), ('7135', 6818.29, 7159.21), ('7136', 8631.71, 9063.29), ('6053', 8941.46, 9388.54), ('6055', 19000.00, 19950.00),
  ('1647054', 1399.00, 1468.95), ('1647055', 1590.00, 1669.50), ('1647056', 1690.00, 1774.50), ('1647057', 2600.00, 2730.00)
), comp as (select c.id, m.hoje - m.antes dif from public.componentes c join mud m on m.helte = c.ficha->>'helte_id'),
calc as (
  select p.id, round((pc.detalhe->>'pecas')::numeric + coalesce((select dif from comp where id = p.modulo_id), 0) * p.modulo_qtd
                                                      + coalesce((select dif from comp where id = p.inversor_id), 0) * p.inversor_qtd, 2) pecas
    from public.produtos p join public.produtos_custo pc on pc.produto_id = p.id
   where p.ativo and coalesce(p.linha, 'catalogo') = 'catalogo' and p.categoria = 'kitsInversor'
     and p.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc' and pc.detalhe ? 'pecas'
     and (p.modulo_id in (select id from comp) or p.inversor_id in (select id from comp))
), cst as (
  select id, pecas, round(pecas + case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end, 2) custo from calc
), up as (
  update public.produtos_custo pc set custo = c.custo, atualizado_em = now(),
         detalhe = pc.detalhe || jsonb_build_object('pecas', c.pecas, 'frete', c.custo - c.pecas, 'data', '2026-10-28', 'conferido', '2026-10-28')
    from cst c where pc.produto_id = c.id
  returning pc.produto_id
)
select count(*) custos_atualizados from up;

-- 3) Preço pela regra (markup) nos kits com inversor do catálogo: Matriz (também em produtos) e Goiânia
with k as (
  select p.id, f.id franquia_id, private.cc_preco_markup(private.cc_custo_kit(p.id, f.id), false) preco
    from public.produtos p cross join public.franquias f
   where p.ativo and coalesce(p.linha, 'catalogo') = 'catalogo' and p.categoria = 'kitsInversor'
     and p.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc'
     and f.id in ('af146be2-1489-4ad0-82f8-802b9dec5b6b', 'abb22e55-40d0-466f-b813-76cc5b58d9ca')
), pf as (
  insert into public.precos_franquia (produto_id, franquia_id, price, list_price)
  select id, franquia_id, preco, private.cc_preco_de(preco) from k where preco > 0
  on conflict (produto_id, franquia_id) do update set price = excluded.price, list_price = excluded.list_price
  returning produto_id
), pr as (
  update public.produtos p set price = k.preco, list_price = private.cc_preco_de(k.preco)
    from k where k.id = p.id and k.franquia_id = 'af146be2-1489-4ad0-82f8-802b9dec5b6b' and k.preco > 0
  returning p.id
)
select (select count(*) from pf) precos_unidade, (select count(*) from pr) precos_matriz;

-- 4) Promocionais de 5 a 9 placas: HYXIPOWER 3,6K no lugar do SOFAR (preço tabelado mantido)
with hyxi as (select id from public.componentes where ficha->>'helte_id' = '1647065' and tipo = 'inversor'),
up as (
  update public.produtos p
     set inversor_id = (select id from hyxi),
         name = format('KIT %s MOD. 620W + INV. HYXIPOWER 3,6KW', p.modulo_qtd),
         description = replace(replace(p.description, 'INVERSOR SOFAR 3,3KW', 'INVERSOR HYXIPOWER 3,6KW'), 'INVERSOR SOFAR 5KW', 'INVERSOR HYXIPOWER 3,6KW')
   where p.ativo and p.linha = 'promocional' and p.categoria = 'kitsInversor' and p.modulo_qtd between 5 and 9
  returning p.name
)
select string_agg(name, ' | ') promocionais_trocados from up;

-- 5) Unidades em "custos + margem": recalcula com o custo novo
select f.nome, private.cc_aplicar_precos(f.id) kits from public.franquias f order by f.nome;

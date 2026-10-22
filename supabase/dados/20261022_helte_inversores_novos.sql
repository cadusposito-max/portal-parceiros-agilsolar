-- 22/10/2026: inversores novos da Helte no catálogo (oferta da Helte com preço). Já aplicado no banco.
-- Preço = preço de lista da Helte, conferido em 10 cotações reais (orçamentos 3952653–3952663, diferença até R$ 0,67).
-- Faixa (kWp) = placas de 620 W com suggested_quantity 1 (mono: mín e máx da varredura; tri: 0,6 × kW até o máx).
-- Pares de conector = o que a Helte manda em cada cotação.
-- Solis S6 3K e S6 5K já existiam (vieram da Belenus): só ganham helte_id e a oferta da Helte.
-- Pode rodar de novo: não duplica (procura pelo helte_id) e só atualiza preço/ativo da oferta.

with h(helte_id, nome, marca, kw, rede, preco, pares, faixa_min, faixa_max, existente) as (values
  (1647065, 'HYXIPOWER HYX-S3.6KW-S2',      'HYXIPOWER', 3.6, 'mono_220',  1390.00,  1,  2.48,  6.20, null::uuid),
  (1647066, 'HYXIPOWER HYX-S5KW-S',         'HYXIPOWER', 5,   'mono_220',  1537.64,  2,  3.72,  9.92, null),
  (1647067, 'HYXIPOWER HYX-S6KW-S',         'HYXIPOWER', 6,   'mono_220',  1640.15,  2,  4.34, 11.78, null),
  (1647068, 'HYXIPOWER HYX-S7.3KW-S',       'HYXIPOWER', 7.3, 'mono_220',  1930.00,  2,  5.58, 12.40, null),
  (6159,    'SOLIS S6-GR1P3K-M',            'SOLIS',     3,   'mono_220',  1661.32,  1,  1.86,  4.96, 'a0b608da-b372-4068-bdbb-5c0ced046c4c'),
  (7197,    'SOLIS S6-GR1P5K-S',            'SOLIS',     5,   'mono_220',  2198.20,  2,  3.72,  8.06, '532c4d3f-2c7d-4e7e-8846-7e6e2818c73e'),
  (3029,    'SOLIS S5-GR1P10K',             'SOLIS',     10,  'mono_220',  4271.74,  3,  7.44, 16.74, null),
  (4699,    'SOLIS S5-GC25K-LV TRI 220V',   'SOLIS',     25,  'tri_220',   7682.26,  8, 15.00, 42.16, null),
  (5114,    'SOLIS 60K LV-5G TRI 220V',     'SOLIS',     60,  'tri_220',  16943.95, 16, 36.00, 93.00, null),
  (6165,    'SOLIS 75K-LV-5G-PRO TRI 220V', 'SOLIS',     75,  'tri_220',  24785.56, 12, 45.00, 93.00, null)
), upd as (
  update public.componentes c
     set ficha = coalesce(c.ficha, '{}'::jsonb) || jsonb_build_object('helte_id', h.helte_id, 'pares_conector', h.pares, 'faixa_kwp', jsonb_build_array(h.faixa_min, h.faixa_max)),
         ativo = true
    from h where h.existente = c.id
  returning c.id, h.helte_id
), ins as (
  insert into public.componentes (tipo, nome, marca, potencia_wp, preco_unitario, ativo, unidade, ficha, ficha_conferida)
  select 'inversor', h.nome, h.marca, h.kw * 1000, 0, true, 'un',
         jsonb_build_object('potencia', h.kw * 1000, 'rede', h.rede, 'micro', false, 'hibrido', false, 'helte_id', h.helte_id,
                            'pares_conector', h.pares, 'faixa_kwp', jsonb_build_array(h.faixa_min, h.faixa_max)),
         false
    from h
   where h.existente is null and not exists (select 1 from public.componentes c where c.ficha->>'helte_id' = h.helte_id::text)
  returning id, (ficha->>'helte_id')::int helte_id
), todos as (
  select * from upd union all select * from ins
  union all select c.id, (c.ficha->>'helte_id')::int from public.componentes c join h on c.ficha->>'helte_id' = h.helte_id::text
   where h.existente is null and c.tipo = 'inversor' and c.id not in (select id from ins)
), ofe as (
  insert into public.distribuidora_componentes (distribuidora_id, componente_id, preco_unitario, ativo)
  select '23a51365-a37f-444c-9c45-22645515f2cc', t.id, h.preco, true from todos t join h using (helte_id)
  on conflict (distribuidora_id, componente_id) do update set preco_unitario = excluded.preco_unitario, ativo = true
  returning componente_id
)
select (select count(*) from upd) completados, (select count(*) from ins) criados, (select count(*) from ofe) ofertas;

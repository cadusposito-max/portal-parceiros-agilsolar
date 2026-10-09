-- Custo Helte (kit completo com frete) dos kits do catálogo ligados à Helte — 09/10/2026.
-- Conta exata da Helte (módulo RONMA 620W R$ 548,00; perfil 44,64; fixação 4 = 135,65; fixação 2 = 72,72;
-- cabo 4 mm R$ 4,25/m por cor; par de conector 12,00; micro Hoymiles 942,49 + fixação 9,00 + 4 pares;
-- frete = maior entre R$ 400 e 3,8494% das peças abaixo de R$ 25 mil, senão 3,1394%).
-- Preço e pares de conector por inversor: cotações Helte de 06/10 e 08/10 (erro conferido até R$ 0,15).
-- Rodar de novo quando a Helte mudar preço: atualiza produtos_custo e o gatilho recalcula as unidades em custos.
-- Conferência: soma dos custos = 37566422.13 (calculada à parte em Python).
with inv(nome, preco, pares) as (values
    ('SOFAR 3300TL-G3', 1399, 1),
    ('SOFAR 5KTLM-G3', 1590, 2),
    ('SOFAR 6KTLM-G3', 1690, 2),
    ('SOFAR 7,5K', 2600, 2),
    ('SOFAR 10KTLM-G3', 3000, 3),
    ('SOLIS S5-GC15K-LV TRI 220V', 6820.36, 6),
    ('SOLIS S5-GC37.5K-LV TRI 220V', 11763.11, 8),
    ('SOLIS S6-GC-75K-LV TRI 220V', 19462.34, 16),
    ('CHINT CPS SCA5KTL-PSM1/EU', 1668.04, 2),
    ('CHINT CPS SCA6KTL-PSM3/EU', 1762.1, 4),
    ('CHINT 7,5K', 2377.69, 4),
    ('CHINT CPS SCA10KTL-PSM/EU', 3252.42, 6),
    ('CHINT SCA15K-T-SA TRI 220V', 6736.25, 6),
    ('CHINT SCA20K-T-SA TRI 220V', 6818.29, 8),
    ('CHINT SCA25K-T-SA TRI 220V', 8631.71, 4),
    ('CHINT CPS SCA30KTL-T/SA TRI 220V', 8941.46, 10),
    ('CHINT SCA75K-T-SA TRI 220V', 19000.0, 18),
    ('FRONIUS SYMO BRASIL 15.0-3 208', 4071.89, 8),
    ('GOODWE 3KB-XS (GREY)', 899.0, 1),
    ('GROWATT MIC 2500TL-X', 900.0, 1),
    ('GROWATT MIN 7000TL-X(E)', 2570.0, 3),
    ('GROWATT MIN 10000TL-X', 2612.15, 4),
    ('GROWATT MID 15KTL3-XL LV-TRI 220V', 4071.89, 8),
    ('GROWATT MID 20K TL3-XL LV-TRI 220V', 5700.64, 8),
    ('GROWATT MAC 25KTL3-XL LV-TRI 220V', 5876.23, 12),
    ('GROWATT MAC 30KTL3-XL LV-TRI 220V', 8000.0, 12),
    ('GROWATT MAC 36KTL3-XL LV-TRI 220V', 8561.79, 12),
    ('GROWATT MAX 50K TL3-XL2 LV-TRI 220V', 13980.11, 16),
    ('GROWATT MAX 60K TL3-XL2 LV-TRI 220V', 14000.0, 16),
    ('GROWATT MAX 75K TL3-XL2 LV-TRI 220V', 14364.3, 16),
    ('SOLIS S5-GR1P9K', 3513.86, 3)
), k as (
  select p.id, p.categoria = 'kitsMicro' as micro, p.modulo_qtd as n, coalesce(p.inversor_qtd, 1) as qi, c.nome
    from public.produtos p join public.componentes c on c.id = p.inversor_id
   where p.linha = 'catalogo' and p.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc' and p.modulo_qtd > 0
), q as (
  select k.*, 2 * ceil(k.n / 2.0) as perf,
         case when k.n <= 19 then 3 * k.n when k.n <= 50 then ceil(2.5 * k.n) else 2 * k.n end as cabo
    from k
), pecas as (
  select q.id, q.nome,
         q.n * 548.00 + q.perf * 44.64 + floor(q.perf / 4) * 135.65 + ((q.perf::int % 4) / 2) * 72.72 + 2 * q.cabo * 4.25
         + case when q.micro then q.qi * (942.49 + 9.00 + 4 * 12.00) else q.qi * (i.preco + i.pares * 12.00) end as pecas
    from q left join inv i on i.nome = q.nome
   where q.micro or i.nome is not null
), c as (
  select id, nome, pecas,
         case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end as frete
    from pecas
)
insert into public.produtos_custo (produto_id, custo, fonte, detalhe)
select id, round(pecas + frete, 2), 'helte',
       jsonb_build_object('pecas', round(pecas, 2), 'frete', round(frete, 2), 'inversor', nome, 'cabo', 4.25, 'data', '2026-10-09')
  from c
on conflict (produto_id) do update set custo = excluded.custo, fonte = excluded.fonte, detalhe = excluded.detalhe, atualizado_em = now();

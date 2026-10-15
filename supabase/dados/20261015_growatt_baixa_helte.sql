-- Helte baixou 8 inversores Growatt (conferido 15/10/2026, cotação nova 3947202).
-- Atualiza a oferta da Helte, o custo dos kits (peças − diferença × qtd + frete de Araçatuba)
-- e o preço da Matriz pela regra (custo × 1,7717 ÷ 1,05, final 97, × 1,05; "De" +13,375%).
with novo(id, antes, hoje) as (values
  ('d6d1b16b-60f1-4b8f-9d99-d071146cfa58'::uuid, 2570.00,  2500.00),  -- MIN 7000TL-X(E)
  ('c3cf4607-68e2-4d82-b32f-1b721ab69601'::uuid, 5700.64,  5000.00),  -- MID 20K
  ('14a05a0a-4b84-4982-a96e-c9886328330e'::uuid, 5876.23,  5300.00),  -- MAC 25K
  ('bf6601ad-c87d-44c5-a3ee-fc5c7e7e60b3'::uuid, 8000.00,  7500.00),  -- MAC 30K
  ('77eaf675-b2ac-4992-b8cf-4ef1a340f5a0'::uuid, 8561.79,  8000.00),  -- MAC 36K
  ('cb6f9424-30d9-4fb2-a598-349ff55c7b43'::uuid, 13980.11, 11900.00), -- MAX 50K
  ('e5ad699a-cd0a-40ba-99a5-a708daaa864f'::uuid, 14000.00, 12700.00), -- MAX 60K
  ('6974847a-4c05-49c8-9597-c5742ed2ad32'::uuid, 14364.30, 14000.00)  -- MAX 75K
), oferta as (
  update distribuidora_componentes dc set preco_unitario = n.hoje
    from novo n where dc.componente_id = n.id and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc'
  returning dc.componente_id
), calc as (
  select pr.id, round((c.detalhe->>'pecas')::numeric - (n.antes - n.hoje) * pr.inversor_qtd, 2) pecas
    from produtos pr join novo n on n.id = pr.inversor_id join produtos_custo c on c.produto_id = pr.id
   where pr.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc' and c.detalhe ? 'pecas'
), cst as (
  select id, pecas, round(pecas + case when pecas < 25000 then greatest(400, pecas * 0.038494) else pecas * 0.031394 end, 2) custo from calc
), prc as (
  select id, pecas, custo, round((ceil((custo * 1.7717293041376716 / 1.05 - 97) / 100) * 100 + 97) * 1.05, 2) preco from cst
), fin as (
  select id, pecas, custo, preco,
         case when preco <= 30000 then round(preco * 1.1337538962526612, 2)
              else round(preco + 0.1337538962526612 * 30000 * sqrt(preco / 30000), 2) end de
    from prc
), up_custo as (
  update produtos_custo pc set custo = f.custo, atualizado_em = now(),
         detalhe = pc.detalhe || jsonb_build_object('pecas', f.pecas, 'frete', f.custo - f.pecas, 'data', '2026-10-15', 'conferido', '2026-10-15')
    from fin f where pc.produto_id = f.id
  returning pc.produto_id
), up_pf as (
  update precos_franquia pf set price = f.preco, list_price = f.de
    from fin f where pf.produto_id = f.id and pf.franquia_id = 'af146be2-1489-4ad0-82f8-802b9dec5b6b'
  returning pf.produto_id
)
update produtos p set price = f.preco, list_price = f.de from fin f where p.id = f.id;

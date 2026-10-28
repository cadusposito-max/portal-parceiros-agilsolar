-- 28/10/2026: a pedido do chefe, HYXIPOWER nos promocionais com inversor onde ele sai mais barato que o atual
-- (preços Helte de 28/10; pares de conector iguais, então a diferença do kit é só o inversor + frete).
--   10–12 placas: SOFAR 5K 1.669,50  → HYXIPOWER 5K 1.614,52   (faixa Helte 6–16 placas)
--   13–17 placas: SOFAR 6K 1.774,50  → HYXIPOWER 6K 1.722,16   (faixa 7–19)
--   18–20 placas: SOFAR 7,5K 2.730,00 → HYXIPOWER 7,3K 2.026,50 (faixa 9–20)
-- 5–9 placas já foram para o HYXIPOWER 3,6K (20261028_helte_aumento.sql). Preço tabelado mantido.

with troca(sofar, hyxi, de_txt, para_txt) as (values
  ('1647055', '1647066', 'SOFAR 5KW',   'HYXIPOWER 5KW'),
  ('1647056', '1647067', 'SOFAR 6KW',   'HYXIPOWER 6KW'),
  ('1647057', '1647068', 'SOFAR 7,5KW', 'HYXIPOWER 7,3KW')
), t as (
  select s.id sofar_id, h.id hyxi_id, x.de_txt, x.para_txt
    from troca x join public.componentes s on s.ficha->>'helte_id' = x.sofar and s.tipo = 'inversor'
                 join public.componentes h on h.ficha->>'helte_id' = x.hyxi and h.tipo = 'inversor'
), up as (
  update public.produtos p
     set inversor_id = t.hyxi_id,
         name = replace(p.name, 'INV. ' || t.de_txt, 'INV. ' || t.para_txt),
         description = replace(p.description, 'INVERSOR ' || t.de_txt, 'INVERSOR ' || t.para_txt)
    from t
   where p.ativo and p.linha = 'promocional' and p.categoria = 'kitsInversor' and p.inversor_id = t.sofar_id
     and p.modulo_qtd between 10 and 20
  returning p.modulo_qtd, p.name, p.description, p.price
)
select jsonb_agg(jsonb_build_object('placas', modulo_qtd, 'nome', name, 'desc', description, 'preco', price) order by modulo_qtd) trocados from up;

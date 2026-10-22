-- 22/10/2026: checagem de preços da Helte. Saíram da Helte:
--   módulo RONMA 590W (helte 1647044) · inversor SOFAR 10K (1647058) · inversor Solis S6 75K-LV (1647052)
-- Desativa os kits do catálogo com esses itens e tira os itens da oferta da Helte
-- (somem do orçamento e do modo avançado). Promocionais não têm nenhum deles.
-- Para desfazer: trocar false por true nos dois updates (mesmos filtros).

update public.produtos p set ativo = false
 where p.ativo and coalesce(p.linha, 'catalogo') = 'catalogo'
   and exists (select 1 from public.componentes c
                where c.id in (p.modulo_id, p.inversor_id) and c.ficha->>'helte_id' in ('1647044', '1647058', '1647052'));

update public.distribuidora_componentes dc set ativo = false
  from public.componentes c
 where c.id = dc.componente_id and dc.ativo
   and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc'
   and c.ficha->>'helte_id' in ('1647044', '1647058', '1647052');

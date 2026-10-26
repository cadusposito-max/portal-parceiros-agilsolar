-- 26/10/2026: checagem de preços da Helte (preços iguais aos de 22/10). Saiu da Helte o inversor
-- Solis S5-GC15K-LV TRI 220V (helte 3030): desativa os 23 kits do catálogo com ele (26 a 41 placas;
-- todos têm outra opção ativa com o mesmo módulo e as mesmas placas) e tira a oferta da Helte.
-- Para desfazer: trocar false por true nos dois updates (mesmos filtros).

with k as (
  update public.produtos p set ativo = false
   where p.ativo and coalesce(p.linha, 'catalogo') = 'catalogo'
     and p.inversor_id in (select c.id from public.componentes c where c.ficha->>'helte_id' = '3030')
  returning p.id
), o as (
  update public.distribuidora_componentes dc set ativo = false
    from public.componentes c
   where c.id = dc.componente_id and dc.ativo
     and dc.distribuidora_id = '23a51365-a37f-444c-9c45-22645515f2cc'
     and c.ficha->>'helte_id' = '3030'
  returning c.nome
)
select (select count(*) from k) kits_desativados, (select string_agg(nome, ' · ') from o) ofertas_desligadas;

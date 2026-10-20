-- 20/10/2026: equipamentos da Belenus (BelEnergy) no catálogo técnico.
-- Fonte: espelho distribuidora_catalogo (provedor 'belenus'), sem login na Belenus.
-- DEYE fica de fora (regra do usuário: nunca DEYE).
-- O preço da Belenus é ao vivo (edge distribuidoras), então a oferta vai com 0;
-- kit_montado só usa oferta com preço > 0 e a Belenus não tem regras_kit.
-- Ficha: só o que a Belenus informa com segurança (potência, MPPTs, entradas, rede,
-- módulos por micro). Voc/Isc/tensões ficam para a engenharia: aparecem "Pendente".

begin;

create temp table _bel on commit drop as
with mods as (
  select 'modulo'::text tipo, m->>'item' item, upper(m->>'fabricante') marca, m->>'modelo' modelo,
         (m->>'potencia')::numeric pot_w, null::int mppts, null::text entradas, null::text grupo
    from public.distribuidora_catalogo, jsonb_array_elements(modulos) m where provedor = 'belenus'
), invs as (
  select 'inversor', i->>'item', upper(i->>'fabricante'), i->>'modelo',
         round((i->>'potenciaNominalSaida')::numeric * 1000), (i->>'numMPPTs')::int, replace(i->>'numEntradaMPPT', '/', ','), i->>'_grupo'
    from public.distribuidora_catalogo, jsonb_array_elements(inversores) i where provedor = 'belenus'
)
select * from (select * from mods union all select * from invs) x where marca not like '%DEYE%';

-- já cadastrados (vindos da Helte): só ligar à Belenus
create temp table _bel_existe (item text, nome text) on commit drop;
insert into _bel_existe values
  ('MINVHOY-220V-2.25KW', 'Microinversor HOYMILES 2,25kW'),
  ('INVSO-TR-220V-15KW', 'SOLIS S5-GC15K-LV TRI 220V'),
  ('INVSO-TR-220V-75KW', 'SOLIS S6-GC-75K-LV TRI 220V'),
  ('INVGR-TRI-220V-50KW', 'GROWATT MAX 50K TL3-XL2 LV-TRI 220V'),
  ('INVGR-TRI-220V-60KW', 'GROWATT MAX 60K TL3-XL2 LV-TRI 220V'),
  ('INVGR-TRI-220V-75KW', 'GROWATT MAX 75K TL3-XL2 LV-TRI 220V');

alter table _bel add column componente_id uuid;
update _bel b set componente_id = c.id from _bel_existe e join public.componentes c on c.nome = e.nome where e.item = b.item;

update public.componentes c set ficha = coalesce(c.ficha, '{}'::jsonb) || jsonb_build_object('belenus_item', b.item)
  from _bel b where b.componente_id = c.id;

insert into public.componentes (tipo, nome, marca, potencia_wp, preco_unitario, ativo, unidade, ficha, ficha_conferida)
select b.tipo,
       case when b.tipo = 'modulo' then 'MÓDULO ' || b.marca || ' ' || b.modelo || ' ' || b.pot_w || 'W'
            when b.grupo = 'micro' then 'Microinversor ' || b.marca || ' ' || b.modelo
            when b.grupo = 'tri' then b.marca || ' ' || b.modelo || ' TRI 220V'
            else b.marca || ' ' || b.modelo end,
       b.marca, b.pot_w, 0, true, 'un',
       case when b.tipo = 'modulo' then jsonb_build_object('potencia', b.pot_w, 'belenus_item', b.item)
            -- módulos por micro = MPPTs × entradas; acima de 800 W por placa o dado da Belenus não fecha (fica pra engenharia)
            when b.grupo = 'micro' then jsonb_strip_nulls(jsonb_build_object('potencia', b.pot_w, 'micro', true, 'rede', 'mono_220', 'hibrido', false,
                                                           'modulos_por_micro', nullif(b.mppts * split_part(b.entradas, ',', 1)::int, 0) * case when b.pot_w / nullif(b.mppts * split_part(b.entradas, ',', 1)::int, 0) <= 800 then 1 end,
                                                           'belenus_item', b.item))
            else jsonb_build_object('potencia', b.pot_w, 'rede', case when b.grupo = 'tri' then 'tri_220' else 'mono_220' end, 'hibrido', false,
                                    'mppts', b.mppts, 'entradas', b.entradas, 'belenus_item', b.item) end,
       false
  from _bel b where b.componente_id is null;

update _bel b set componente_id = c.id from public.componentes c where b.componente_id is null and c.ficha->>'belenus_item' = b.item;

insert into public.distribuidora_componentes (distribuidora_id, componente_id, preco_unitario, ativo)
select d.id, b.componente_id, 0, true
  from _bel b cross join public.distribuidoras d
 where d.nome = 'Belenus'
   and not exists (select 1 from public.distribuidora_componentes x where x.distribuidora_id = d.id and x.componente_id = b.componente_id);

commit;

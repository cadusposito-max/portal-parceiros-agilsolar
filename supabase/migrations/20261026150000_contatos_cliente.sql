-- ============================================================================
-- Contatos do cliente (faixa "Contatos" na ficha + selo "Nº contato" no funil)
-- ----------------------------------------------------------------------------
-- * Contato = atividade da timeline do tipo ligacao, whatsapp ou visita
--   (nota não conta). O resultado vai em crm_atividades.meta.resultado:
--   'falou' | 'nao_atendeu' | 'pediu_retorno' (contatos antigos ficam sem).
-- * clientes ganha um resumo (quantos, quando foi o último e como foi), mantido
--   pelo gatilho abaixo: o funil lê de state.clientes sem buscar a timeline.
-- * Aditiva: só colunas novas, função e gatilho.
-- ============================================================================

alter table public.clientes
  add column if not exists contatos_qtd integer not null default 0,
  add column if not exists contato_ultimo_em timestamptz,
  add column if not exists contato_ultimo_resultado text;

-- Recalcula o resumo de um cliente a partir da timeline
create or replace function public.clientes_recalc_contatos(p_cliente uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  with x as (
    select count(*)::int as qtd,
           max(a.created_at) as ult_em,
           (select a2.meta ->> 'resultado'
              from public.crm_atividades a2
             where a2.cliente_id = p_cliente
               and a2.tipo in ('ligacao', 'whatsapp', 'visita')
             order by a2.created_at desc
             limit 1) as ult_res
      from public.crm_atividades a
     where a.cliente_id = p_cliente
       and a.tipo in ('ligacao', 'whatsapp', 'visita')
  )
  update public.clientes c
     set contatos_qtd = x.qtd,
         contato_ultimo_em = x.ult_em,
         contato_ultimo_resultado = x.ult_res
    from x
   where c.id = p_cliente
     and (c.contatos_qtd, c.contato_ultimo_em, c.contato_ultimo_resultado)
         is distinct from (x.qtd, x.ult_em, x.ult_res);
$$;
revoke all on function public.clientes_recalc_contatos(uuid) from public, anon, authenticated;

create or replace function public.crm_atividades_contatos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo in ('ligacao', 'whatsapp', 'visita') then
      perform public.clientes_recalc_contatos(new.cliente_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.tipo in ('ligacao', 'whatsapp', 'visita') then
      perform public.clientes_recalc_contatos(old.cliente_id);
    end if;
  elsif (old.tipo in ('ligacao', 'whatsapp', 'visita') or new.tipo in ('ligacao', 'whatsapp', 'visita'))
        and (new.cliente_id is distinct from old.cliente_id or new.tipo is distinct from old.tipo or new.meta is distinct from old.meta) then
    -- mesclagem troca o cliente: os dois lados recalculam
    perform public.clientes_recalc_contatos(old.cliente_id);
    if new.cliente_id is distinct from old.cliente_id then
      perform public.clientes_recalc_contatos(new.cliente_id);
    end if;
  end if;
  return null;
exception when others then
  -- o resumo nunca impede de salvar a atividade
  raise warning '[crm_atividades_contatos] %', sqlerrm;
  return null;
end $$;

drop trigger if exists trg_crm_atividades_contatos on public.crm_atividades;
create trigger trg_crm_atividades_contatos
  after insert or update or delete on public.crm_atividades
  for each row
  execute function public.crm_atividades_contatos();

-- Preenche quem já tem contato registrado
select public.clientes_recalc_contatos(t.cliente_id)
  from (select distinct cliente_id from public.crm_atividades
         where tipo in ('ligacao', 'whatsapp', 'visita') and cliente_id is not null) t;

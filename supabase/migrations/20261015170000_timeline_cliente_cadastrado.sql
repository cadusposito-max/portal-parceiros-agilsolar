-- Timeline: registra o nascimento do cliente ("Cliente cadastrado").
--
-- Antes a timeline só começava na primeira ação (nota, proposta, status...);
-- a data em que o card foi criado não aparecia. Agora todo INSERT em clientes
-- grava uma atividade 'cadastro' com meta.evento = 'criado' — vale para
-- qualquer porta de entrada (cadastro manual, ficha, importação, O&M).
-- Leads do Meta ficam de fora: meta_leads_criar_cliente já grava o próprio
-- "Lead recebido do Meta..." com o vendedor do rodízio.
--
-- Clientes que já existiam ganham o registro retroativo com a data de
-- clientes.created_at (autor 'sistema': não dá pra saber quem cadastrou).

create or replace function public.tg_log_cliente_criado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.origem = 'meta' then
    return new;
  end if;
  insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta, created_at)
  values (new.id, new.franquia_id,
          coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), lower(new.vendedor_email), 'sistema'),
          'cadastro', 'Cliente cadastrado',
          jsonb_build_object('evento', 'criado', 'origem', new.origem),
          coalesce(new.created_at, now()));
  return new;
end $$;

drop trigger if exists trg_clientes_log_criado on public.clientes;
create trigger trg_clientes_log_criado
  after insert on public.clientes
  for each row execute function public.tg_log_cliente_criado();

-- Retroativo: quem ainda não tem o registro de criação (nem o do lead Meta).
insert into public.crm_atividades (cliente_id, franquia_id, autor_email, tipo, descricao, meta, created_at)
select c.id, c.franquia_id, 'sistema', 'cadastro', 'Cliente cadastrado',
       jsonb_build_object('evento', 'criado', 'origem', c.origem, 'retroativo', true),
       c.created_at
  from public.clientes c
 where c.created_at is not null
   and not exists (
     select 1 from public.crm_atividades a
      where a.cliente_id = c.id
        and a.tipo = 'cadastro'
        and (a.meta ->> 'evento' = 'criado'
             or (c.origem = 'meta' and a.meta ->> 'origem' = 'meta_leads')));

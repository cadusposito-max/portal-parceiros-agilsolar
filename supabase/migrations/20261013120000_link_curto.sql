-- ============================================================================
-- Link curto das propostas: plataforma.agilsolar.com.br/p/<codigo>
--
-- Código aleatório de 10 caracteres (letras e números, sem os que confundem:
-- 0/O, 1/l/I). ~58 bits: não dá pra chutar nem tem sequência. Os links antigos
-- (?id=<uuid> e ?t=<token>) continuam valendo.
--
-- Orçamento: coluna propostas.codigo + RPC proposta_por_codigo (código → id).
-- O&M: o próprio public_token passa a nascer curto (os tokens antigos ficam).
-- ============================================================================

create or replace function public.gerar_codigo_curto(p_len int default 10)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  n        constant int  := length(alfabeto);
  limite   constant int  := 256 - (256 % n);  -- descarta o resto: sem viés
  bytes    bytea;
  v        int;
  saida    text := '';
begin
  while length(saida) < p_len loop
    bytes := extensions.gen_random_bytes(32);
    for i in 0..31 loop
      v := get_byte(bytes, i);
      if v < limite then
        saida := saida || substr(alfabeto, (v % n) + 1, 1);
        exit when length(saida) = p_len;
      end if;
    end loop;
  end loop;
  return saida;
end;
$$;

revoke all on function public.gerar_codigo_curto(int) from public, anon;
grant execute on function public.gerar_codigo_curto(int) to authenticated, service_role;

-- Default volátil: o ADD COLUMN preenche cada proposta existente com um código
-- próprio, sem disparar os triggers de UPDATE da tabela.
alter table public.propostas
  add column if not exists codigo text default public.gerar_codigo_curto();

update public.propostas set codigo = public.gerar_codigo_curto() where codigo is null;

alter table public.propostas alter column codigo set not null;
create unique index if not exists propostas_codigo_key on public.propostas (codigo);

-- Página pública: código → id (as RPCs get_public_proposta e
-- registrar_proposta_view seguem iguais, recebendo o id).
create or replace function public.proposta_por_codigo(p_codigo text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.propostas where codigo = p_codigo;
$$;

revoke all on function public.proposta_por_codigo(text) from public;
grant execute on function public.proposta_por_codigo(text) to anon, authenticated, service_role;

-- O&M: token novo nasce curto. Os 32 caracteres antigos continuam funcionando.
alter table public.om_propostas
  alter column public_token set default public.gerar_codigo_curto();

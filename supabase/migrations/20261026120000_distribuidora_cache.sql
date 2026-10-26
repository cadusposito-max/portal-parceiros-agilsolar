-- Respostas da Belenus guardadas por pouco tempo (edge function distribuidoras).
-- Em 23/10 o firewall dela barrou a plataforma (403) depois de ~12 consultas em 35 s: a mesma
-- cotação repetida, com o catálogo sendo renovado junto. Com o cache, repetir a cotação (ou
-- trocar de opção e voltar) não consulta a Belenus de novo, nem durante uma pausa por 403.
-- chave = sha-256 de (provedor, conta, etapa, corpo do pedido). Só a service role acessa.
-- Prazos (na função): recomendação de inversor, estrutura e acessórios 6 h; preço (Confirmar)
-- e frete 30 min; recusa da Belenus (ex.: 400 no Confirmar) 15 min.

create table if not exists public.distribuidora_cache (
  chave      text primary key,
  provedor   text not null,
  etapa      text not null,
  resposta   jsonb,
  erro       text,          -- preenchido quando a Belenus recusou (a função repete a mesma recusa)
  expira_em  timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists distribuidora_cache_expira_idx on public.distribuidora_cache (expira_em);

alter table public.distribuidora_cache enable row level security;
revoke all on public.distribuidora_cache from public, anon, authenticated;
grant select, insert, update, delete on public.distribuidora_cache to service_role;

-- Preço de tabela de cada peça da Belenus (edge function distribuidoras).
-- O firewall da Belenus barra (403) justamente o Confirmar, a única etapa que devolve preço, e
-- às vezes já na primeira consulta do dia (21/10, 23/10, 26/10). O Confirmar devolve o precoBruto
-- de cada peça, e o kit sai por Σ precoBruto × qtd × 0,88. Guardando o preço por peça, um kit
-- cujas peças já foram vistas nas últimas 24 h é calculado sem chamar o Confirmar
-- (trocar placas, telhado, marca, voltar pro on-grid...). Peça nova continua indo ao Confirmar.

create table if not exists public.distribuidora_precos (
  provedor      text not null,
  sku           text not null,
  preco_bruto   numeric not null,
  descricao     text,
  tipo          text,           -- tipoKitMontado (modulo, inversor, estrutura, outro)
  atualizado_em timestamptz not null default now(),
  primary key (provedor, sku)
);

alter table public.distribuidora_precos enable row level security;
revoke all on public.distribuidora_precos from public, anon, authenticated;
grant select, insert, update, delete on public.distribuidora_precos to service_role;

-- Dados da conta que o Confirmar devolve e o frete usa (CNPJ, cidade/UF), o fator do kit (0,88)
-- e o peso por real (o frete pede o peso, mas o valor dele não depende do peso).
alter table public.distribuidora_sessoes add column if not exists conta jsonb;

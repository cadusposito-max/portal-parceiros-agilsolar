# Ativar o preço por custos (no lugar do markup)

O que muda: cada unidade escolhe, em Financeiro → Configurações → Centro de custo, como calcula o preço dos kits.
- **Markup atual** (padrão): nada muda.
- **Custos + margem alvo**: kits do catálogo e cotações das distribuidoras saem de
  `kit (custo Helte com frete) + instalação + ART + elétrica fixa + elétrica por kWp + placas + projeto da Rede`
  mais imposto, comissão, royalties/fundo e a margem alvo da unidade. O "De" segue a regra das planilhas (+13,38%).
  Kits promocionais **não mudam** (preço próprio).

Vale para **qualquer kit do catálogo** (qualquer distribuidora ou cadastrado à mão) que tenha custo
cadastrado: campo "Custo do kit c/ frete" no cadastro do kit (só admin), coluna `custo` na planilha de
importação, ou o script da Helte. Kit sem custo segue no markup (a lista de produtos mostra "Sem custo").

Formas de cálculo de cada linha do centro de custo: R$ fixo, por módulo, por kWp, por inversor/micro,
tabela por faixa de kWp; % da venda, da venda − kit ou do custo do kit. Botão "Adicionar custo" cria
linhas com nome livre (até 15).

Estimativa da Matriz (botão "Usar estimativa da Matriz" no centro de custo): instalação R$ 70/módulo, elétrica R$ 345 fixa + R$ 118,50/kWp.
Com ela, os 33 promocionais empatam ou ficam mais baratos que o preço por custos (margem alvo 22%).

## Passos (nesta ordem)

1. **Banco — SQL Editor:** `migrations/20261009122917_centro_custo_dimensionado.sql` (já aplicada em 09/10) e
   `migrations/20261009180000_preco_por_custos.sql`.
2. **Custos dos kits — SQL Editor:** `dados/20261009_produtos_custo_helte.sql` (587 kits do catálogo ligados à Helte).
   Rodar de novo quando a Helte mudar preço.
3. **Edge function `distribuidoras`:** publicar a versão do repositório (lê o modo da unidade; sem a migration, cai no markup).
4. **Front:** push (funciona com ou sem a migration; sem ela, tudo segue no markup).
5. **Matriz:** Financeiro → Config → "Usar estimativa da Matriz" (instalação R$ 70/módulo, elétrica R$ 345 + R$ 118,50/kWp),
   escolher "Custos + margem alvo" e salvar. O banco recalcula na hora os preços dos kits da unidade.
   Para voltar: escolher "Markup atual" e salvar.

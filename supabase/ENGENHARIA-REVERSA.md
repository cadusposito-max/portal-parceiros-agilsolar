# Calibração reversa dos promocionais — 09/10/2026

> **Revisão de 09/10 (tarde) — vale esta.** A primeira calibração comparou com o preço *base* dos kits (`produtos.price`), mas o vendedor vê o preço da unidade (`precos_franquia`), que na Matriz fica de 0% a 9,4% acima. O cabo de 4 mm também caiu de R$ 5,87 para R$ 4,25/m na Helte (08/10). Refeita com o preço da Matriz e o cabo atual (`referencias/helte-20261009.json`), a reserva passa a **R$ 139,83/kWp**: margem média de 19,5% (ponderada 19,28%), nenhum promocional abaixo de 18% e, com alvo de 22%, só o inversor de 17 e o micro de 4 módulos ficam acima do preço por custos. Sem os micros de 4 a 7, a tarifa seria 133,55/kWp. Os números abaixo são da primeira versão e ficam como histórico.
>
> Decisões do usuário na revisão: ART é à parte do projeto da Rede (soma sempre); o piso promocional compara com o kit promocional do **mesmo tipo e mesmo número de placas**, pelo preço da unidade, e está implementado na cotação (modo custos) com o ajuste comercial separado no snapshot (`venda_custos`, `ajuste_comercial`, `piso`).

Estimativa inicial disponível no centro de custo: **instalação de R$ 70 por módulo e reserva de R$ 48,24 por kWp na linha Elétrica**. O valor da elétrica é uma hipótese comercial derivada da margem média de 19,5% indicada pelo usuário. Inclui todo custo residual não discriminado, não apenas material elétrico comprovado. Não representa uma medição de despesa nem deve ser somado novamente a outra reserva para os mesmos itens.

O valor é oferecido como opção de teste, sem salvar automaticamente ou mudar o modo padrão de markup. Ao salvar o centro de custo, a reserva passa a participar normalmente de Custos + margem alvo e da DRE. A função e a migração da implementação principal precisam estar publicadas para ativar o fluxo completo.

## Dados e composição

Os custos foram reconstruídos a partir da planilha Helte fornecida pelo usuário e comparados com os 33 promocionais da Matriz consultados em 09/10/2026. Para os inversores de 8, 13 e 17 módulos, foi usada a referência de preço do inversor de potência correspondente ao cadastro, em vez da faixa automática por quantidade de módulos da planilha. Também foi ajustada a quantidade de conectores e recalculado o frete:

| Módulos | Potência do inversor | Custo reconstruído com frete |
| --- | --- | ---: |
| 8 | 3,3 kW | R$ 7.105,18 |
| 13 | 6 kW | R$ 10.800,85 |
| 17 | 6 kW | R$ 13.549,83 |

Isso permite incluir os três casos na estimativa, mas não comprova que revisões de modelo, estrutura e frete sejam idênticas aos de uma compra atual. A referência continua histórica, para telha cerâmica e Araçatuba-SP. A correspondência de modelos e a conferência inicial das fórmulas estão em [CALIBRACAO-HELTE.md](CALIBRACAO-HELTE.md).

## Conta inversa

Para cada kit, lucro antes da reserva = venda − custo do kit com frete − imposto − comissão − instalação − ART − placas. Premissas: imposto de 13,8% sobre venda menos kit; comissão de 8% sobre venda; instalação de 70/módulo; ART de 110 e placas de 30 por venda; demais despesas e contrato zerados; projeto da Rede sem cobrança.

Escolher tarifa `e` de modo que:

```text
média((lucro_antes_da_reserva_i − e × kWp_i) / venda_i) = 0,195

e = soma(lucro_antes_da_reserva_i / venda_i − 0,195)
    / soma(kWp_i / venda_i)
  ≈ R$ 48,24/kWp
```

Cada SKU tem peso igual, pois não há volume de vendas. Depois da aplicação e dos arredondamentos de cada linha, a média simples é 19,50%; a média ponderada pelo preço, assumindo uma venda de cada kit, é 19,02%. A calibração é condicional à hipótese de 19,5%, não uma descoberta independente da margem real.

Todos os módulos da amostra têm 620 W: por módulo e por kWp são estatisticamente equivalentes nesse conjunto. Foi adotado kWp para dimensionar a reserva quando variar a potência do módulo. Essa extrapolação é uma escolha de modelagem, não evidência de custos reais de outros equipamentos.

## Alternativas e sensibilidade

Também foram calculadas tarifas que fecham a mesma média: R$ 313,57 fixos por venda ou R$ 29,91 por módulo. O valor fixo produz menor dispersão dentro dessa amostra, mas não cresce com o sistema; a opção por kWp atende ao dimensionamento solicitado. Não existe informação suficiente para identificar uma função física de custo só a partir de preços e uma margem média assumida.

Separando por tamanho, as tarifas implícitas seriam R$ 102,69/kWp até 5 kWp, R$ 36,38/kWp de 5 a 10 kWp e R$ 19,52/kWp de 10 a 12,40 kWp. Não foram transformadas em tabela de cobrança: há poucos dados, preços comerciais irregulares e quedas artificiais de despesa ao mudar de faixa.

Retirar os micros de 4 a 7 módulos reduz a tarifa ajustada de 48,24 para 33,80/kWp. Essa sensibilidade impede tratar os centavos da estimativa como precisão de um orçamento real. A opção de tela mantém os 33 kits, sem excluir silenciosamente os preços mais altos.

| Reserva por kWp | Margem média simples | Média ponderada pelo preço | Promocionais menores ou iguais ao preço calculado com alvo 22% | Abaixo da mínima de 18% no promocional |
| --- | ---: | ---: | ---: | ---: |
| R$ 0,00 | 21,43% | 20,99% | 22/33 | 0 |
| **R$ 48,24** | **19,50%** | **19,02%** | **29/33** | **9** |
| R$ 50,00 | 19,43% | 18,95% | 29/33 | 10 |
| R$ 150,00 | 15,43% | 14,87% | 32/33 | 29 |

## Exceções comerciais

Os micros de 4, 5, 6 e 7 módulos permanecem com preço promocional maior que o preço calculado com alvo de 22%. No micro de 4 módulos, por exemplo, o promocional é R$ 8.029,29 e o preço calculado R$ 7.166,89. Esse registro requer revisão comercial; não foi criado um piso artificial ou uma despesa fictícia específica para igualá-lo.

Com a reserva de 48,24/kWp, ficam abaixo de 18% no preço promocional: inversor de 19 módulos e micros de 13 a 20 módulos. O simulador sinaliza quando a margem fica abaixo da mínima. A calibração não reajusta esses preços automaticamente nem garante 19,5% em cada kit. Novos preços gerados em Custos + margem alvo usam a margem configurada, por exemplo 22%.

## Uso e reprodução

Em Financeiro → Configurações → Comparar com kit promocional → Estimativa inicial pela referência Helte, o botão preenche instalação e elétrica. A opção só fica habilitada com as mesmas bases, taxas, ART, placas e ausência de outros custos/contrato da referência. Mantém margem mínima, alvo e demais configurações. Salvar segue o fluxo normal da unidade.

Base calibrada: 2,48 a 12,40 kWp. Usar a mesma tarifa acima desse intervalo é extrapolação. Após obter custos efetivos de obras, substituir a reserva pela despesa observada e recalibrar; registrar despesas adicionais sem descontá-las da reserva pode duplicar custos.

Reprodução offline, sem acessar ou escrever no banco:

```sh
node scripts/calibrar-centro-custo.cjs
node --test tests/centro-custo/*.test.cjs
```

O snapshot numérico em `supabase/referencias/helte-20261009.json` contém preços de entrada da planilha e composição/preço dos 33 promocionais. O script não modifica o arquivo original nem a configuração de produção. Testes conferem custo/composição dos três inversores ajustados, média, limites do catálogo e condições para aplicar a referência na tela.

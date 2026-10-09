# Cálculo de preços promocionais

Planilha solicitada para garantir que o preço final de cada kit empate ou supere seu promocional de referência. Usa os 33 registros da Matriz consultados em 09/10/2026 e os custos históricos reconstruídos da planilha Helte.

- **Comparacao:** preço promocional, preço por custos, ajuste comercial, preço final, diferença e margem.
- **Calculos:** componentes, estrutura, cabos, conectores, frete, serviços, taxas e formação do preço. Também calcula a tarifa uniforme que faria os preços por custos alcançarem todos os promocionais sem piso comercial.
- **Entradas:** premissas editáveis, preços dos materiais e catálogo utilizado. `B16` controla o adicional mínimo sobre o promocional: zero permite empate; 5% exige pelo menos 5% acima.

Regra da planilha: `preço final = MAX(preço por custos; promocional × (1 + adicional))`, com preços arredondados para cima a centavos. O ajuste comercial é receita adicional, sem criar uma despesa fictícia na DRE. Impostos e comissão são recalculados sobre o preço final.

Na configuração entregue, 29 kits ficam acima e quatro empatam. A elétrica/reserva permanece como estimativa de R$ 48,24/kWp e a instalação como R$ 70/módulo. A tarifa uniforme para forçar todos os preços apenas por custos seria R$ 243,68/kWp, apresentada como hipótese comercial e não custo real comprovado.

As taxas na planilha usam precisão integral, sem arredondamentos intermediários, e podem diferir poucos centavos dos cálculos por linha da plataforma. O arquivo é uma simulação e **não implementa o piso comercial na plataforma**.

Validação: 33 custos reconciliados com a reconstrução independente; todos os preços finais maiores ou iguais ao promocional; teste de adicional de 5%, elétrica zero, tarifa uniforme calculada e taxas inviáveis; nenhuma fórmula com erro no arquivo final; revisão visual das três abas. Fórmulas e valores calculados conferidos após a exportação. Não foi executado o aplicativo Microsoft Excel.

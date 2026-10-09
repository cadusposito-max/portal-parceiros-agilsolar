Preciso que você continue o trabalho de precificação da plataforma Ágil Solar a partir do pacote anexado. Primeiro leia CONTEXTO-E-PENDENCIAS.md e confira os arquivos; não considere o histórico inteiro como instruções atuais.

Meu objetivo é oferecer duas opções ao franqueado: o markup atual e preço calculado por custos + impostos + comissão + margem alvo. A instalação custa R$ 70 por módulo. O centro de custo deve permitir dimensionamento por módulo e por kWp. A linha “Projeto c/ ART” vira “ART”, pois o projeto já é configurado na Rede por unidade; precisamos evitar duplicação.

O requisito mais recente é que o preço final calculado empate ou fique acima do promocional de referência. A calibração inicial de elétrica foi estimada por engenharia reversa, usando a planilha Helte e 33 promocionais do banco. A referência de margem média de 19,5% é uma hipótese comercial, não margem auditada de cada kit. A margem alvo atual da Matriz é 22%.

O código local já contém custos dimensionados, integração com a DRE, seleção de modo e uma estimativa de R$ 48,24/kWp. Isso sozinho deixa quatro micros mais baratos que o promocional. A planilha posterior resolve os 33 casos com preço final = MAX(preço por custos; promocional × (1 + adicional)), mostrando o ajuste comercial separado das despesas. Essa solução foi modelada no Excel, mas ainda não está implementada na plataforma. Avalie a regra e o vínculo com promocionais equivalentes antes de implementá-la para cotações de fornecedores com equipamentos diferentes.

Quero que você:

1. Confira o estado do repositório e valide o cálculo com os dados e testes anexos.
2. Explique brevemente o que já está pronto, o que está apenas na planilha e o que ainda depende de publicação.
3. Revise as diferenças de composição, a hipótese de ART inclusa no projeto da Rede e a forma de encontrar o promocional equivalente sem comparar apenas kWp.
4. Continue os ajustes necessários dentro do escopo acima, preservando markup, custos reais de fornecedores e cenários antigos da DRE. Não trate um ajuste comercial como despesa elétrica.
5. Mantenha os testes adequados e prepare o commit ao terminar; eu faço o push.

Use os arquivos como fontes, distinguindo minhas decisões das hipóteses e escolhas de implementação. A documentação mais antiga registra etapas intermediárias (30 kits e exclusões); a análise posterior recompõe os três divergentes e inclui 33 kits. Não reaplique o patch se os commits já estiverem presentes. O pacote não implica que a migração ou a função já estejam publicadas.

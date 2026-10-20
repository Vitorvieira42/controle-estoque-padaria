# Controle de Estoque de Padaria

Aplicação de estoque com analytics de perdas, cobertura e reposição — construída como site estático puro, sem build, sem backend e sem dependência de CDN. Toda a lógica roda no navegador e persiste em `localStorage`.

- Demo: https://vitorvieira42.github.io/controle-estoque-padaria/

Abra o `index.html` no navegador e a aplicação já vem populada com 90 dias de histórico gerado por uma seed fixa: o mesmo saldo, as mesmas séries e os mesmos KPIs em qualquer máquina.

```bash
# abrir direto
start index.html

# ou servir localmente
python -m http.server 8080
```

## As quatro telas

| Tela | O que entrega |
| --- | --- |
| Dashboard | 6 KPIs, faixa de alertas clicável e 5 gráficos encadeados |
| Produtos | Cadastro com busca, filtro por categoria e situação, 9 ordenações, ajuste rápido de saldo e export CSV |
| Movimentações | Histórico de entradas, saídas e perdas com filtro por tipo, produto e período |
| Alertas | Reposição sugerida com lista de compra exportável e vencimentos por janela configurável |

Os gráficos conversam entre si: clicar numa fatia de *Imobilizado por categoria* filtra a lista de produtos, e os chips de *Fluxo do estoque em valor* ligam e desligam séries sem recarregar nada.

## O que é calculado

| Métrica | Conta |
| --- | --- |
| Valor imobilizado | `Σ qtd × precoCusto` dos ativos |
| Abaixo do mínimo | `qtd <= qtdMin`, com contagem separada de ruptura (`qtd <= 0`) |
| Vencendo em N dias | `diffDays(hoje, validade) <= N` |
| Perdas no período | saídas com motivo Vencimento, Quebra ou Avaria × custo, e % sobre o valor imobilizado |
| Cobertura média | `qtd / (saídas de consumo dos últimos 30 dias / 30)` |
| Receita no período | `Σ quantidade × precoVenda` |

## Regras de negócio

- Saldo nunca fica negativo: a saída é recusada com *Saldo insuficiente* antes de gravar.
- Cobertura com faixas — crítico até 2 dias, atenção até 5.
- Sugestão de compra: `max(qtdMin × 2 − qtd, qtdMin)`, exportável como lista de compra.
- Janela de validade em 3, 7, 15 ou 30 dias (padrão 7).
- SKU é único; ajuste manual de saldo gera um movimento do tipo *Correção de inventário*, então nada muda sem rastro.
- KPI de perdas fica vermelho acima de 3% do valor imobilizado.

## Dados de demonstração

Seed determinística `20261017` com PRNG mulberry32 — o gerador é reproduzível linha por linha.

| | |
| --- | --- |
| Produtos | 42 em 7 categorias (Ingredientes 14, Pães 7, Embalagens 5, Bolos & Tortas 4, Doces 4, Salgados 4, Bebidas 4) |
| Fornecedores | 15, sendo 18 produtos controlados por validade |
| Movimentações | 4.809 em 90 dias: Venda 1.918 · Consumo interno 1.584 · Produção 822 · Compra 395 · Quebra 36 · Avaria 29 · Vencimento 25 |
| Sazonalidade | fator por dia da semana `[0.72, 0.86, 0.94, 1.00, 1.12, 1.38, 0.95]`, com sábado no pico |
| Casos forçados | três produtos abaixo do mínimo e dois com validade deslocada, para os alertas terem o que mostrar |

## Como é feito

- **Sem framework e sem tooling.** Sete tags `<script>` sequenciais no fim do `<body>` carregam IIFEs que expõem `U`, `Seed`, `Store`, `Charts`, `UI` e `App`. O resultado funciona aberto por `file://`, o que elimina a fricção de "clona e roda `npm install`" numa conversa sobre o projeto.
- **Estado central com funções puras.** `Store` guarda o documento (`version`, `products`, `movements`, `meta`) e toda tela deriva do mesmo objeto; nenhuma view mantém cópia paralela.
- **Persistência versionada.** A chave `padaria.estoque.v1` permite migrar o formato sem herdar dados de uma versão anterior; o tema fica em `padaria.estoque.tema`.
- **Gráficos vendorizados.** Chart.js 4.4.4 está em `vendor/`, então a demo não depende de rede nem de CDN.
- **Leitura de negócio antes de leitura de código.** KPIs e alertas usam as fórmulas que quem trabalha em estoque reconhece (`qtdMin × 2` como alvo de recompra, cobertura em dias, perda sobre imobilizado), não métricas genéricas de dashboard.

## Estrutura

```
index.html      shell e as quatro views
styles.css      paleta, tema claro/escuro, responsivo e prefers-reduced-motion
src/utils.js    formatação, datas, CSV e helpers
src/seed.js     gerador determinístico de produtos e movimentações
src/store.js    estado, cálculos, regras de saldo e persistência
src/charts.js   os cinco gráficos e as interações entre eles
src/ui.js       render das telas, filtros e modais
src/app.js      bootstrap, navegação e atalhos de teclado
vendor/         Chart.js 4.4.4
```

São 3.180 linhas próprias (`src/` 2.464, `index.html` 333, `styles.css` 363).

## Limitações conhecidas

- Não há curva ABC nem ponto de pedido estatístico: a reposição usa `qtdMin` como âncora, que é decisão humana, não previsão.
- Sem multiusuário nem sincronização — o `localStorage` é por navegador.
- O histórico é gerado, não importado; o caminho natural seguinte é ler um CSV real de PDV e validar contra o mesmo motor de cálculo.

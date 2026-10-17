/* Catálogo base da padaria + gerador determinístico de histórico de movimentações. */
(function (global) {
  'use strict';

  var CATEGORIAS = ['Pães', 'Bolos & Tortas', 'Doces', 'Salgados', 'Bebidas', 'Ingredientes', 'Embalagens'];

  var MOTIVOS = {
    entrada: ['Compra', 'Produção', 'Devolução de venda', 'Correção de inventário', 'Inventário'],
    saida: ['Venda', 'Consumo interno', 'Vencimento', 'Quebra', 'Avaria', 'Doação', 'Correção de inventário']
  };

  var MOTIVOS_PERDA = ['Vencimento', 'Quebra', 'Avaria'];

  // [nome, categoria, unidade, custo, venda, estoqueInicial, minimo, fornecedor, validadeDias, padrão, ritmoDiário]
  var CATALOGO = [
    ['Pão Francês', 'Pães', 'kg', 6.00, 18.90, 30, 12, 'Produção Interna', 2, 'producao', 22],
    ['Pão de Forma Integral', 'Pães', 'un', 4.50, 12.90, 20, 8, 'Produção Interna', 6, 'producao', 7],
    ['Pão Italiano', 'Pães', 'un', 5.20, 16.90, 14, 6, 'Produção Interna', 4, 'producao', 5],
    ['Baguete', 'Pães', 'un', 3.10, 9.90, 16, 8, 'Produção Interna', 2, 'producao', 11],
    ['Pão de Queijo', 'Pães', 'un', 1.40, 4.50, 60, 25, 'Produção Interna', 3, 'producao', 30],
    ['Croissant Folhado', 'Pães', 'un', 2.80, 8.90, 24, 10, 'Produção Interna', 3, 'producao', 12],
    ['Pão Doce de Chocolate', 'Pães', 'un', 1.90, 6.50, 34, 15, 'Produção Interna', 3, 'producao', 18],
    ['Bolo de Cenoura com Chocolate', 'Bolos & Tortas', 'un', 14.20, 39.90, 6, 3, 'Produção Interna', 4, 'producao', 3],
    ['Bolo Formigueiro', 'Bolos & Tortas', 'un', 13.10, 36.90, 5, 3, 'Produção Interna', 4, 'producao', 3],
    ['Torta de Limão', 'Bolos & Tortas', 'un', 16.80, 49.90, 4, 2, 'Produção Interna', 3, 'producao', 2],
    ['Bolo de Festa 2kg (encomenda)', 'Bolos & Tortas', 'un', 34.00, 95.00, 2, 1, 'Produção Interna', 5, 'producao', 1],
    ['Sonho de Creme', 'Doces', 'un', 1.60, 6.90, 30, 15, 'Produção Interna', 2, 'producao', 16],
    ['Brigadeiro Gourmet', 'Doces', 'un', 0.95, 3.50, 70, 30, 'Produção Interna', 5, 'producao', 34],
    ['Pudim de Leite', 'Doces', 'un', 9.80, 28.00, 5, 3, 'Produção Interna', 3, 'producao', 3],
    ['Sonho de Doce de Leite', 'Doces', 'un', 1.70, 7.20, 22, 12, 'Produção Interna', 2, 'producao', 11],
    ['Pastel de Queijo', 'Salgados', 'un', 1.55, 6.50, 40, 18, 'Produção Interna', 2, 'producao', 24],
    ['Esfiha de Carne', 'Salgados', 'un', 1.70, 7.00, 32, 15, 'Produção Interna', 2, 'producao', 20],
    ['Empada de Frango', 'Salgados', 'un', 2.20, 8.50, 20, 10, 'Produção Interna', 3, 'producao', 10],
    ['Focaccia Presunto e Queijo', 'Salgados', 'un', 8.40, 24.90, 6, 3, 'Produção Interna', 2, 'producao', 3],
    ['Café Torrado e Moído 500g', 'Bebidas', 'un', 12.90, 0, 18, 8, 'Café Serrano', 180, 'revenda', 2],
    ['Suco de Uva Integral 1L', 'Bebidas', 'un', 14.20, 26.90, 12, 6, 'Vinha Alta', 240, 'revenda', 2],
    ['Refrigerante 2L', 'Bebidas', 'un', 7.30, 13.90, 24, 10, 'Distribuidora Sul', 150, 'revenda', 5],
    ['Água Mineral 500ml', 'Bebidas', 'un', 1.60, 4.00, 48, 20, 'Distribuidora Sul', 365, 'revenda', 10],
    ['Leite Integral UHT 1L', 'Ingredientes', 'un', 5.10, 0, 36, 15, 'Distribuidora Sul', 180, 'insumo', 8],
    ['Farinha de Trigo Tipo 1', 'Ingredientes', 'kg', 4.20, 0, 180, 50, 'Moinho Aurora', 120, 'insumo', 28],
    ['Fermento Biológico Seco 500g', 'Ingredientes', 'un', 18.50, 0, 14, 5, 'Mundial Panis', 90, 'insumo', 1],
    ['Açúcar Refinado', 'Ingredientes', 'kg', 3.60, 0, 70, 25, 'Distribuidora Sul', 540, 'insumo', 9],
    ['Ovo Extra Branco (dúzia)', 'Ingredientes', 'un', 7.90, 0, 44, 16, 'Granja Bom Ovo', 18, 'insumo', 5],
    ['Margarina Cremosa 1kg', 'Ingredientes', 'kg', 11.40, 0, 24, 10, 'Líder Alimentos', 90, 'insumo', 4],
    ['Chocolate em Pó 50%', 'Ingredientes', 'kg', 24.90, 0, 11, 4, 'Cacau & Cia', 240, 'insumo', 1],
    ['Sal Refinado', 'Ingredientes', 'kg', 2.40, 0, 16, 6, 'Distribuidora Sul', 730, 'insumo', 1],
    ['Essência de Baunilha 500ml', 'Ingredientes', 'un', 22.00, 0, 6, 2, 'Aroma Doce', 300, 'insumo', 0.2],
    ['Requeijão Cremoso 400g', 'Ingredientes', 'un', 15.60, 0, 9, 4, 'Laticínios Vale Verde', 30, 'insumo', 2],
    ['Presunto Cozido', 'Ingredientes', 'kg', 18.90, 0, 7, 3, 'Boa Gente', 25, 'insumo', 2],
    ['Queijo Mussarela', 'Ingredientes', 'kg', 32.50, 0, 10, 4, 'Laticínios Vale Verde', 35, 'insumo', 3],
    ['Banana Prata', 'Ingredientes', 'kg', 5.20, 0, 11, 5, 'CEASA Central', 6, 'insumo', 4],
    ['Goiabada Cremosa', 'Ingredientes', 'kg', 16.80, 0, 5, 2, 'Doce Vida', 180, 'insumo', 1],
    ['Saco Kraft 500g', 'Embalagens', 'un', 0.42, 0, 340, 120, 'Embalagens Prisma', 0, 'embalagem', 40],
    ['Caixa para Bolo 25x25', 'Embalagens', 'un', 1.95, 0, 46, 18, 'Embalagens Prisma', 0, 'embalagem', 3],
    ['Fita de Acetato para Bolo', 'Embalagens', 'un', 0.75, 0, 60, 25, 'Embalagens Prisma', 0, 'embalagem', 4],
    ['Forminha de Brigadeiro', 'Embalagens', 'un', 0.28, 0, 280, 100, 'Embalagens Prisma', 0, 'embalagem', 22],
    ['Copo de Café 50ml', 'Embalagens', 'un', 0.19, 0, 420, 150, 'Embalagens Prisma', 0, 'embalagem', 30]
  ];

  var FATOR_DIA = [0.72, 0.86, 0.94, 1.0, 1.12, 1.38, 0.95]; // dom..sáb, sábado é o pico da padaria

  // dois casos propositalmente sensíveis para demonstrar o painel de validade
  var VALIDADE_OVERRIDE = { p33: -2, p37: 4 };

  function pick(rand, list) {
    return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  }

  function buildProducts(seedDate) {
    return CATALOGO.map(function (row, index) {
      // itens de produção própria giram em 1-2 dias e são controlados por data de fabricação
      var fabricaPropria = row[9] === 'producao';
      var id = 'p' + (index + 1);
      var validade = !fabricaPropria && row[8] > 0 ? U.addDays(seedDate, row[8]) : '';
      if (VALIDADE_OVERRIDE[id] != null) validade = U.addDays(seedDate, VALIDADE_OVERRIDE[id]);
      return {
        id: id,
        nome: row[0],
        sku: 'PD-' + (100 + index),
        categoria: row[1],
        unidade: row[2],
        precoCusto: row[3],
        precoVenda: row[4],
        qtdInicial: row[5],
        qtd: row[5],
        qtdMin: row[6],
        fornecedor: row[7],
        validade: validade,
        ativo: true,
        ordem: index
      };
    });
  }

  /**
   * Simula `days` dias de operação a partir do estoque inicial do catálogo.
   * O saldo final de cada produto é devolvido em p.qtd, mantendo histórico e saldo coerentes.
   */
  function buildDemoData(days) {
    days = days || 90;
    var today = U.todayISO();
    var products = buildProducts(today);
    var movements = [];
    var rand = U.rng(20261017);
    var saldo = Object.create(null);
    var config = Object.create(null);

    products.forEach(function (p) {
      saldo[p.id] = p.qtd;
      var row = CATALOGO[p.ordem] || CATALOGO[0];
      config[p.id] = { padrao: row[9], ritmo: row[10] };
    });

    function push(produtoId, tipo, quantidade, motivo, data, nota) {
      var q = U.round(quantidade, 2);
      if (q <= 0) return;
      movements.push({
        id: U.uid('m'), produtoId: produtoId, tipo: tipo, quantidade: q,
        motivo: motivo, data: data, nota: nota || ''
      });
      saldo[produtoId] = U.round(saldo[produtoId] + (tipo === 'entrada' ? q : -q), 2);
    }

    var start = U.addDays(today, -(days - 1));
    for (var d = 0; d < days; d++) {
      var date = U.addDays(start, d);
      var fator = FATOR_DIA[U.fromISODate(date).getDay()];

      products.forEach(function (p) {
        var cfg = config[p.id];
        var casas = p.unidade === 'kg' ? 1 : 0;
        var base = Math.max(0.2, cfg.ritmo * fator);
        var isInsumo = cfg.padrao === 'insumo' || cfg.padrao === 'embalagem';
        var ciclo = cfg.padrao === 'producao' ? 2 : cfg.padrao === 'revenda' ? 4 : cfg.padrao === 'insumo' ? 6 : 12;
        var estoqueAlvo = p.qtdMin * 2 + cfg.ritmo * (ciclo + 1);
        var programada = d % ciclo === p.ordem % ciclo;

        if (rand() < 0.07) return; // dia sem movimentação relevante

        if (isInsumo) {
          var uso = Math.max(p.unidade === 'kg' ? 0.5 : 1, U.round(base * (0.75 + rand() * 0.5), casas));
          if (saldo[p.id] >= uso) push(p.id, 'saida', uso, 'Consumo interno', date, '');
          if (programada || saldo[p.id] < estoqueAlvo * 0.5) {
            var faltaInsumo = U.round(Math.max(estoqueAlvo - saldo[p.id], uso), casas);
            if (faltaInsumo > 0) push(p.id, 'entrada', faltaInsumo, 'Compra', date, p.fornecedor);
          }
          return;
        }

        var venda = Math.max(1, U.round(base * (0.6 + rand() * 0.9), 0));
        if (saldo[p.id] >= venda) {
          push(p.id, 'saida', venda, 'Venda', date, rand() < 0.15 ? 'Encomenda da confeitaria' : '');
        }

        if (programada || saldo[p.id] < estoqueAlvo * 0.5) {
          var falta = U.round(Math.max(estoqueAlvo - saldo[p.id], base), casas);
          if (falta > 0) {
            push(p.id, 'entrada', falta, cfg.padrao === 'producao' ? 'Produção' : 'Compra', date,
              cfg.padrao === 'producao' ? 'Cozinha' : p.fornecedor);
          }
        }

        if (rand() < 0.05) {
          var perda = Math.round(saldo[p.id] * (0.03 + rand() * 0.08));
          if (perda > 0 && perda <= saldo[p.id]) {
            push(p.id, 'saida', perda, pick(rand, MOTIVOS_PERDA), date, 'Perda registrada no fechamento');
          }
        }
      });
    }

    // três itens abaixo do mínimo para demonstrar o alerta de reposição
    var porId = Object.create(null);
    products.forEach(function (p) { porId[p.id] = p; });
    ['p5', 'p13', 'p25'].forEach(function (id) {
      var p = porId[id];
      var alvoBaixo = U.round(p.qtdMin * 0.5, p.unidade === 'kg' ? 1 : 0);
      var excesso = U.round(saldo[id] - alvoBaixo, 2);
      if (excesso > 0) push(id, 'saida', excesso, 'Venda', today, 'Venda acima do previsto');
    });

    products.forEach(function (p) { p.qtd = Math.max(0, saldo[p.id]); });

    return {
      version: 1,
      products: products,
      movements: movements,
      meta: { criadoEm: today, atualizadoEm: today, janelaDias: days }
    };
  }

  global.Seed = {
    CATEGORIAS: CATEGORIAS,
    MOTIVOS: MOTIVOS,
    MOTIVOS_PERDA: MOTIVOS_PERDA,
    CATALOGO: CATALOGO,
    buildProducts: buildProducts,
    buildDemoData: buildDemoData
  };
})(window);

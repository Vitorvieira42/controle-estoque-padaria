/* Estado persistido em localStorage + regras de domínio e análises do estoque. */
(function (global) {
  'use strict';

  var KEY = 'padaria.estoque.v1';
  var listeners = [];
  var state = null;
  var idxCache = null;
  var pesoSalvo = 0;

  function empty() {
    return { version: 1, products: [], movements: [], meta: { criadoEm: U.todayISO(), atualizadoEm: '' } };
  }

  function normalize(raw) {
    var data = raw && typeof raw === 'object' ? raw : empty();
    data.products = Array.isArray(data.products) ? data.products : [];
    data.movements = Array.isArray(data.movements) ? data.movements : [];
    data.meta = data.meta || {};
    data.products.forEach(function (p) {
      p.qtdInicial = U.round(p.qtdInicial != null ? p.qtdInicial : p.qtd, 2);
      p.qtd = U.round(p.qtd, 2);
      p.qtdMin = U.round(p.qtdMin || 0, 2);
      p.precoCusto = U.round(p.precoCusto || 0, 2);
      p.precoVenda = U.round(p.precoVenda || 0, 2);
      if (p.ativo === undefined) p.ativo = true;
    });
    data.movements.forEach(function (m) {
      m.quantidade = U.round(m.quantidade, 2);
      if (m.tipo !== 'saida') m.tipo = 'entrada';
    });
    return data;
  }

  function load() {
    var stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      console.warn('Dados corrompidos em localStorage, recriando base demo.', e);
    }
    state = stored && stored.products && stored.products.length ? normalize(stored) : Seed.buildDemoData(90);
    idxCache = null;
    recomputeBalances();
    pesoSalvo = (localStorage.getItem(KEY) || '').length;
    persist();
    return state;
  }

  var flush = U.debounce(function () {
    try {
      var json = JSON.stringify(state);
      localStorage.setItem(KEY, json);
      pesoSalvo = json.length;
    } catch (e) {
      console.error('Não foi possível salvar o estoque.', e);
      if (global.UI && global.UI.toast) global.UI.toast('Falha ao salvar: armazenamento cheio.', 'erro');
    }
  }, 250);

  function persist() {
    state.meta.atualizadoEm = U.todayISO();
    flush();
  }

  function emit(reason) {
    idxCache = null;
    persist();
    listeners.forEach(function (fn) { fn(reason); });
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  // ---------- consultas básicas ----------

  function products() {
    return state.products;
  }

  function movements() {
    return state.movements;
  }

  function productIndex() {
    if (!idxCache) {
      idxCache = Object.create(null);
      state.products.forEach(function (p) { idxCache[p.id] = p; });
    }
    return idxCache;
  }

  function getProduct(id) {
    return productIndex()[id] || null;
  }

  /** delta de saldo de uma movimentação: entrada soma, saída subtrai. */
  function delta(m) {
    return m.tipo === 'entrada' ? m.quantidade : -m.quantidade;
  }

  function isPerda(m) {
    return m.tipo === 'saida' && Seed.MOTIVOS_PERDA.indexOf(m.motivo) >= 0;
  }

  function custoUnitario(m) {
    var p = getProduct(m.produtoId);
    return p ? (p.precoCusto || 0) : 0;
  }

  /** Saldo do produto considerando apenas movimentos até `date` (exclui `excludeId`). */
  function balanceAt(produtoId, date, excludeId) {
    var p = getProduct(produtoId);
    if (!p) return 0;
    var acc = U.round(p.qtdInicial, 2);
    for (var i = 0; i < state.movements.length; i++) {
      var m = state.movements[i];
      if (m.produtoId !== produtoId) continue;
      if (excludeId && m.id === excludeId) continue;
      if (m.data <= date) acc = U.round(acc + delta(m), 2);
    }
    return acc;
  }

  function recomputeBalances() {
    var acc = Object.create(null);
    state.products.forEach(function (p) { acc[p.id] = U.round(p.qtdInicial, 2); });
    state.movements.forEach(function (m) {
      if (acc[m.produtoId] === undefined) return;
      acc[m.produtoId] = U.round(acc[m.produtoId] + delta(m), 2);
    });
    state.products.forEach(function (p) { p.qtd = Math.round(acc[p.id] * 100) / 100; });
  }

  // ---------- mutações ----------

  function validateProduto(p, id) {
    if (!p.nome || !String(p.nome).trim()) return 'Informe o nome do produto.';
    if (!p.categoria) return 'Selecione uma categoria.';
    if (!p.unidade) return 'Selecione uma unidade de medida.';
    if (Number(p.precoCusto) < 0) return 'O custo não pode ser negativo.';
    if (Number(p.precoVenda) < 0) return 'O preço de venda não pode ser negativo.';
    if (Number(p.qtdMin) < 0) return 'O estoque mínimo não pode ser negativo.';
    if (String(p.sku || '').trim()) {
      var dup = state.products.some(function (x) { return x.id !== id && x.sku === p.sku; });
      if (dup) return 'Já existe outro produto com esse SKU.';
    }
    return null;
  }

  function createProduto(data) {
    var inicial = data.qtdInicial != null ? data.qtdInicial : data.qtd;
    var p = {
      id: U.uid('p'),
      nome: String(data.nome).trim(),
      sku: String(data.sku || 'PD-' + Math.floor(100 + Math.random() * 899)).trim(),
      categoria: data.categoria,
      unidade: data.unidade,
      precoCusto: U.round(data.precoCusto, 2),
      precoVenda: U.round(data.precoVenda, 2),
      qtdInicial: U.round(inicial, 2),
      qtdMin: U.round(data.qtdMin, 2),
      fornecedor: String(data.fornecedor || '').trim(),
      validade: data.validade || '',
      ativo: data.ativo !== false,
      ordem: state.products.length
    };
    var erro = validateProduto(p);
    if (erro) return { ok: false, erro: erro };
    p.qtd = p.qtdInicial;
    state.products.push(p);
    emit('produto:novo');
    return { ok: true, produto: p };
  }

  function updateProduto(id, data) {
    var p = getProduct(id);
    if (!p) return { ok: false, erro: 'Produto não encontrado.' };
    var teste = {
      nome: data.nome, categoria: data.categoria, unidade: data.unidade, sku: data.sku,
      precoCusto: data.precoCusto, precoVenda: data.precoVenda, qtdMin: data.qtdMin,
      fornecedor: data.fornecedor, validade: data.validade, ativo: data.ativo
    };
    var erro = validateProduto(teste, id);
    if (erro) return { ok: false, erro: erro };

    Object.keys(teste).forEach(function (k) {
      p[k] = typeof data[k] === 'string' ? data[k].trim() : data[k];
    });
    p.precoCusto = U.round(data.precoCusto, 2);
    p.precoVenda = U.round(data.precoVenda, 2);
    p.qtdMin = U.round(data.qtdMin, 2);
    p.ativo = data.ativo !== false;

    var diff = U.round(Number(data.qtd) - p.qtd, 2);
    if (Math.abs(diff) > 0.001) {
      state.movements.push({
        id: U.uid('m'), produtoId: id, tipo: diff > 0 ? 'entrada' : 'saida',
        quantidade: Math.abs(diff), motivo: 'Correção de inventário',
        data: U.todayISO(), nota: 'Ajuste manual pelo cadastro'
      });
    }
    recomputeBalances();
    emit('produto:editar');
    return { ok: true, produto: p };
  }

  function removeProduto(id) {
    var usados = state.movements.filter(function (m) { return m.produtoId === id; }).length;
    state.movements = state.movements.filter(function (m) { return m.produtoId !== id; });
    state.products = state.products.filter(function (p) { return p.id !== id; });
    recomputeBalances();
    emit('produto:remover');
    return { ok: true, movimentosRemovidos: usados };
  }

  function validateMovimento(m, id) {
    if (!m.produtoId) return 'Selecione o produto.';
    if (!(Number(m.quantidade) > 0)) return 'A quantidade precisa ser maior que zero.';
    if (!m.data) return 'Informe a data.';
    if (!m.motivo) return 'Selecione o motivo.';
    var p = getProduct(m.produtoId);
    if (!p) return 'Produto não encontrado.';
    if (m.tipo === 'saida') {
      var disponivel = balanceAt(m.produtoId, m.data, id);
      if (disponivel < Number(m.quantidade)) {
        return 'Saldo insuficiente: ' + U.num(disponivel) + ' ' + p.unidade +
          ' disponível em ' + U.dateFull(m.data) + '.';
      }
    }
    return null;
  }

  function saveMovimento(data, id) {
    var m = {
      id: id || U.uid('m'),
      produtoId: data.produtoId,
      tipo: data.tipo === 'saida' ? 'saida' : 'entrada',
      quantidade: U.round(data.quantidade, 2),
      motivo: data.motivo,
      data: data.data,
      nota: String(data.nota || '').trim()
    };
    var erro = validateMovimento(m, id);
    if (erro) return { ok: false, erro: erro };

    if (id) {
      var pos = state.movements.findIndex(function (x) { return x.id === id; });
      if (pos < 0) return { ok: false, erro: 'Movimentação não encontrada.' };
      state.movements[pos] = m;
    } else {
      state.movements.push(m);
    }
    recomputeBalances();
    emit('movimento:salvar');
    return { ok: true, movimento: m };
  }

  function removeMovimento(id) {
    var antes = state.movements.length;
    state.movements = state.movements.filter(function (m) { return m.id !== id; });
    var removido = antes !== state.movements.length;
    if (removido) {
      recomputeBalances();
      emit('movimento:remover');
    }
    return { ok: removido };
  }

  /** Ajuste rápido de saldo a partir da tabela de produtos (gera movimento de inventário). */
  function ajustarSaldo(produtoId, novaQtd) {
    var p = getProduct(produtoId);
    if (!p) return { ok: false, erro: 'Produto não encontrado.' };
    var diff = U.round(Number(novaQtd) - p.qtd, 2);
    if (Math.abs(diff) < 0.001) return { ok: true, movimento: null };
    return saveMovimento({
      produtoId: produtoId,
      tipo: diff > 0 ? 'entrada' : 'saida',
      quantidade: Math.abs(diff),
      motivo: 'Correção de inventário',
      data: U.todayISO(),
      nota: 'Contagem rápida'
    });
  }

  // ---------- análises ----------

  function seriesDiarias(dias) {
    var hoje = U.todayISO();
    var inicio = U.addDays(hoje, -(dias - 1));
    var buckets = [];
    var map = Object.create(null);
    for (var i = 0; i < dias; i++) {
      var date = U.addDays(inicio, i);
      var b = {
        data: date, valorEntrada: 0, valorSaida: 0, valorPerda: 0,
        valorEstoque: 0, qtdSaida: 0, movimentos: 0
      };
      buckets.push(b);
      map[date] = b;
    }

    state.movements.forEach(function (m) {
      var b = map[m.data];
      if (!b) return;
      var valor = U.round(m.quantidade * custoUnitario(m), 2);
      b.movimentos++;
      if (m.tipo === 'entrada') {
        b.valorEntrada = U.round(b.valorEntrada + valor, 2);
      } else {
        b.valorSaida = U.round(b.valorSaida + valor, 2);
        b.qtdSaida = U.round(b.qtdSaida + m.quantidade, 2);
        if (isPerda(m)) b.valorPerda = U.round(b.valorPerda + valor, 2);
      }
    });

    // reconstrói o valor imobilizado dia a dia, caminhando do saldo atual para trás
    var running = valorEstoqueAtual();
    for (var j = buckets.length - 1; j >= 0; j--) {
      buckets[j].valorEstoque = U.round(running, 2);
      running = running - buckets[j].valorEntrada + buckets[j].valorSaida;
    }
    return buckets;
  }

  function valorEstoqueAtual() {
    return U.sum(state.products, function (p) { return p.ativo ? p.qtd * p.precoCusto : 0; });
  }

  function breakdownCategoria() {
    var groups = U.groupBy(state.products.filter(function (p) { return p.ativo; }), function (p) { return p.categoria; });
    return Object.keys(groups).map(function (cat) {
      var itens = groups[cat];
      return {
        categoria: cat,
        valor: U.round(U.sum(itens, function (p) { return p.qtd * p.precoCusto; }), 2),
        itens: itens.length,
        abaixoMinimo: itens.filter(function (p) { return p.qtd <= p.qtdMin; }).length
      };
    }).sort(function (a, b) { return b.valor - a.valor; });
  }

  function topReceita(limite, dias) {
    var desde = U.addDays(U.todayISO(), -(dias - 1));
    var acc = Object.create(null);
    state.movements.forEach(function (m) {
      if (m.tipo !== 'saida' || isPerda(m) || m.data < desde) return;
      var p = getProduct(m.produtoId);
      if (!p || !p.precoVenda) return;
      var a = acc[m.produtoId] || (acc[m.produtoId] = { produto: p, qtd: 0, receita: 0, unidades: 0 });
      a.qtd = U.round(a.qtd + m.quantidade, 2);
      a.receita = U.round(a.receita + m.quantidade * p.precoVenda, 2);
    });
    return Object.keys(acc).map(function (k) { return acc[k]; })
      .sort(function (a, b) { return b.receita - a.receita; })
      .slice(0, limite || 10);
  }

  /** Dias de cobertura por produto, usando a saída média diária (sem perdas) da janela. */
  function cobertura(dias) {
    dias = dias || 30;
    var desde = U.addDays(U.todayISO(), -(dias - 1));
    var saidas = Object.create(null);
    state.movements.forEach(function (m) {
      if (m.tipo !== 'saida' || isPerda(m) || m.data < desde) return;
      saidas[m.produtoId] = U.round((saidas[m.produtoId] || 0) + m.quantidade, 2);
    });
    return state.products.filter(function (p) { return p.ativo; }).map(function (p) {
      var media = U.round((saidas[p.id] || 0) / dias, 3);
      var diasCobertura = media > 0 ? U.round(p.qtd / media, 1) : null;
      return {
        produto: p,
        mediaDiaria: media,
        qtd: p.qtd,
        dias: diasCobertura,
        situacao: diasCobertura === null ? 'sem-historico'
          : diasCobertura <= 2 ? 'critico' : diasCobertura <= 5 ? 'atencao' : 'ok'
      };
    });
  }

  function perdasPorMes(months) {
    months = months || 6;
    var hoje = new Date();
    var keys = [];
    for (var k = months - 1; k >= 0; k--) {
      var date = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
      keys.push(date.getFullYear() + '-' + U.pad2(date.getMonth() + 1));
    }
    var byMonth = Object.create(null);
    var byMotivo = Object.create(null);
    keys.forEach(function (key) { byMonth[key] = { mes: key, motivos: Object.create(null), total: 0 }; });

    var desde = keys[0] + '-01';
    state.movements.forEach(function (m) {
      if (!isPerda(m) || m.data < desde) return;
      var key = U.monthKey(m.data);
      var bucket = byMonth[key];
      if (!bucket) return;
      var valor = U.round(m.quantidade * custoUnitario(m), 2);
      bucket.total = U.round(bucket.total + valor, 2);
      bucket.motivos[m.motivo] = U.round((bucket.motivos[m.motivo] || 0) + valor, 2);
      byMotivo[m.motivo] = U.round((byMotivo[m.motivo] || 0) + valor, 2);
    });

    return {
      meses: keys.map(function (key) {
        var b = byMonth[key];
        return { mes: key, label: U.monthLabel(key), total: b.total, motivos: b.motivos };
      }),
      motivos: Object.keys(byMotivo).map(function (motivo) {
        return { motivo: motivo, valor: byMotivo[motivo] };
      }).sort(function (a, b) { return b.valor - a.valor; })
    };
  }

  function alertas(janelaValidade) {
    janelaValidade = janelaValidade || 7;
    var hoje = U.todayISO();
    var reposicao = state.products.filter(function (p) {
      return p.ativo && p.qtd <= p.qtdMin;
    }).map(function (p) {
      return {
        produto: p,
        faltando: U.round(p.qtdMin - p.qtd, 2),
        ruptura: p.qtd <= 0,
        sugestao: U.round(Math.max(p.qtdMin * 2 - p.qtd, p.qtdMin), 2)
      };
    }).sort(function (a, b) { return (b.produto.qtdMin - b.produto.qtd) - (a.produto.qtdMin - a.produto.qtd); });

    var validade = state.products.filter(function (p) {
      if (!p.ativo || !p.validade) return false;
      return U.diffDays(hoje, p.validade) <= janelaValidade;
    }).map(function (p) {
      return { produto: p, emDias: U.diffDays(hoje, p.validade), valor: U.round(p.qtd * p.precoCusto, 2) };
    }).sort(function (a, b) { return a.emDias - b.emDias; });

    return { reposicao: reposicao, validade: validade };
  }

  function kpis(dias) {
    dias = dias || 30;
    var serie = seriesDiarias(dias);
    var hoje = U.todayISO();
    var movHoje = state.movements.filter(function (m) { return m.data === hoje; });
    var perdasMes = U.sum(serie.filter(function (s) { return s.data >= U.addDays(hoje, -29); }), function (s) { return s.valorPerda; });
    var valorEstoque = valorEstoqueAtual();
    var inicio = serie[0];
    var fim = serie[serie.length - 1];
    var alerta = alertas(7);
    var coberturas = cobertura(30).filter(function (c) { return c.dias != null; });
    var coberturaMedia = coberturas.length ? U.round(U.sum(coberturas, function (c) { return c.dias; }) / coberturas.length, 1) : null;
    var receitaJanela = U.sum(topReceita(200, dias), function (t) { return t.receita; });

    return {
      dias: dias,
      valorEstoque: valorEstoque,
      variacaoEstoque: fim && inicio ? U.round(fim.valorEstoque - inicio.valorEstoque, 2) : 0,
      itens: state.products.filter(function (p) { return p.ativo; }).length,
      abaixoMinimo: alerta.reposicao.length,
      rupturas: state.products.filter(function (p) { return p.ativo && p.qtd <= 0; }).length,
      vencendo: alerta.validade.length,
      valorVencendo: U.round(U.sum(alerta.validade, function (a) { return a.valor; }), 2),
      perdasMes: U.round(perdasMes, 2),
      perdasPercentual: valorEstoque > 0 ? U.round((perdasMes / valorEstoque) * 100, 1) : 0,
      movimentosHoje: movHoje.length,
      saidasHoje: U.round(U.sum(movHoje.filter(function (m) { return m.tipo === 'saida'; }), function (m) { return m.quantidade * custoUnitario(m); }), 2),
      receitaJanela: U.round(receitaJanela, 2),
      coberturaMedia: coberturaMedia,
      serie: serie
    };
  }

  function listarProdutos(filtro) {
    filtro = filtro || {};
    var busca = String(filtro.busca || '').trim().toLowerCase();
    var out = state.products.filter(function (p) {
      if (filtro.categoria && p.categoria !== filtro.categoria) return false;
      if (filtro.status === 'ativo' && !p.ativo) return false;
      if (filtro.status === 'inativo' && p.ativo) return false;
      if (filtro.status === 'minimo' && p.qtd > p.qtdMin) return false;
      if (filtro.status === 'ruptura' && p.qtd > 0) return false;
      if (!busca) return true;
      return [p.nome, p.sku, p.fornecedor, p.categoria].join(' ').toLowerCase().indexOf(busca) >= 0;
    });
    var key = filtro.sort || 'nome';
    var dir = filtro.dir === 'desc' ? -1 : 1;
    var valor = {
      nome: function (p) { return String(p.nome).toLowerCase(); },
      categoria: function (p) { return String(p.categoria).toLowerCase(); },
      qtd: function (p) { return p.qtd; },
      cobertura: function (p) { return p.qtd - p.qtdMin; },
      custo: function (p) { return p.precoCusto; },
      venda: function (p) { return p.precoVenda; },
      total: function (p) { return p.qtd * p.precoCusto; },
      validade: function (p) { return p.validade || 'zzzz'; }
    }[key] || function (p) { return p.nome; };
    out.sort(function (a, b) {
      var va = valor(a), vb = valor(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return out;
  }

  function listarMovimentos(filtro) {
    filtro = filtro || {};
    var desde = filtro.desde || '';
    var ate = filtro.ate || '';
    return state.movements.filter(function (m) {
      if (filtro.tipo && m.tipo !== filtro.tipo) return false;
      if (filtro.produtoId && m.produtoId !== filtro.produtoId) return false;
      if (filtro.motivo && m.motivo !== filtro.motivo) return false;
      if (desde && m.data < desde) return false;
      if (ate && m.data > ate) return false;
      if (filtro.busca) {
        var p = getProduct(m.produtoId);
        var alvo = (m.motivo + ' ' + m.nota + ' ' + (p ? p.nome + ' ' + p.sku : '')).toLowerCase();
        if (alvo.indexOf(String(filtro.busca).toLowerCase()) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return a.data === b.data ? (a.id < b.id ? 1 : -1) : (a.data < b.data ? 1 : -1); });
  }

  function resetDemo(dias) {
    state = Seed.buildDemoData(dias || 90);
    recomputeBalances();
    emit('reset');
  }

  function limpar() {
    state = empty();
    emit('reset');
  }

  function importar(data) {
    var candidato = normalize(data);
    if (!candidato.products.length) return { ok: false, erro: 'Arquivo sem produtos.' };
    state = candidato;
    recomputeBalances();
    emit('importar');
    return { ok: true };
  }

  global.Store = {
    load: load,
    state: function () { return state; },
    tamanhoSalvo: function () { return pesoSalvo; },
    subscribe: subscribe,
    products: products,
    movements: movements,
    getProduct: getProduct,
    balanceAt: balanceAt,
    isPerda: isPerda,
    createProduto: createProduto,
    updateProduto: updateProduto,
    removeProduto: removeProduto,
    saveMovimento: saveMovimento,
    removeMovimento: removeMovimento,
    ajustarSaldo: ajustarSaldo,
    seriesDiarias: seriesDiarias,
    valorEstoqueAtual: valorEstoqueAtual,
    breakdownCategoria: breakdownCategoria,
    topReceita: topReceita,
    cobertura: cobertura,
    perdasPorMes: perdasPorMes,
    alertas: alertas,
    kpis: kpis,
    listarProdutos: listarProdutos,
    listarMovimentos: listarMovimentos,
    resetDemo: resetDemo,
    limpar: limpar,
    importar: importar,
    KEY: KEY
  };
})(window);

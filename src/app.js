/* Bootstrap: carrega dados, aplica tema e liga os controles fixos da página. */
(function (global) {
  'use strict';

  var TEMA_KEY = 'padaria.estoque.tema';
  var el = function (id) { return document.getElementById(id); };
  var on = function (node, ev, fn) { if (node) node.addEventListener(ev, fn); };

  function temaInicial() {
    var salvo = null;
    try { salvo = localStorage.getItem(TEMA_KEY); } catch (e) { /* storage indisponível */ }
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }

  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    try { localStorage.setItem(TEMA_KEY, tema); } catch (e) { /* ignore */ }
    Charts.retheme();
    UI.refresh();
  }

  function opcoesCategorias() {
    var extras = Seed.CATEGORIAS.slice();
    Store.products().forEach(function (p) { if (extras.indexOf(p.categoria) < 0) extras.push(p.categoria); });
    return extras;
  }

  function syncSelects() {
    var selCat = el('filtroCategoria');
    var atualCat = selCat.value;
    selCat.innerHTML = '<option value="">Todas as categorias</option>' +
      opcoesCategorias().map(function (c) {
        return '<option value="' + U.escapeHtml(c) + '">' + U.escapeHtml(c) + '</option>';
      }).join('');
    selCat.value = UI.state.produto.categoria;

    var selProd = el('filtroProduto');
    var produtos = Store.products().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    var grupos = {};
    produtos.forEach(function (p) { (grupos[p.categoria] || (grupos[p.categoria] = [])).push(p); });
    selProd.innerHTML = '<option value="">Todos os produtos</option>' +
      Object.keys(grupos).map(function (cat) {
        return '<optgroup label="' + U.escapeHtml(cat) + '">' + grupos[cat].map(function (p) {
          return '<option value="' + p.id + '">' + U.escapeHtml(p.nome) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');
    selProd.value = UI.state.mov.produtoId;
  }

  function bindNav() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (btn) {
      on(btn, 'click', function () { UI.setView(btn.getAttribute('data-view')); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('#periodPicker button'), function (btn) {
      on(btn, 'click', function () { UI.setPeriodo(Number(btn.getAttribute('data-days'))); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-series]'), function (chip) {
      on(chip, 'click', function () {
        Charts.toggleSeries(chip.getAttribute('data-toggle-series'));
        UI.state.view === 'dashboard' && UI.renderDashboard();
      });
    });
  }

  function bindFiltros() {
    var s = UI.state;

    on(el('buscaProduto'), 'input', U.debounce(function () {
      s.produto.busca = el('buscaProduto').value;
      UI.renderProdutos();
    }, 180));

    ['filtroCategoria', 'filtroStatus', 'ordenarProduto'].forEach(function (id) {
      on(el(id), 'change', function () {
        s.produto.categoria = el('filtroCategoria').value;
        s.produto.status = el('filtroStatus').value;
        s.produto.sort = el('ordenarProduto').value;
        el('btnLimparCategoria').hidden = !s.produto.categoria;
        UI.renderProdutos();
      });
    });

    on(el('inverterOrdem'), 'change', function () {
      s.produto.dir = el('inverterOrdem').checked ? 'desc' : 'asc';
      UI.renderProdutos();
    });

    on(el('buscaMov'), 'input', U.debounce(function () {
      s.mov.busca = el('buscaMov').value;
      UI.renderMovimentos();
    }, 180));

    ['filtroTipo', 'filtroProduto', 'filtroDesde', 'filtroAte'].forEach(function (id) {
      on(el(id), 'change', function () {
        s.mov.tipo = el('filtroTipo').value;
        s.mov.produtoId = el('filtroProduto').value;
        s.mov.desde = el('filtroDesde').value;
        s.mov.ate = el('filtroAte').value;
        s.mov.somentePerdas = false;
        s.mov.motivo = '';
        UI.renderMovimentos();
      });
    });

    on(el('btnLimparFiltrosMov'), 'click', function () {
      s.mov = { busca: '', tipo: '', produtoId: '', desde: '', ate: '', somentePerdas: false };
      UI.syncFilters();
      UI.renderMovimentos();
      toast('Filtros limpos.');
    });

    on(el('janelaValidade'), 'change', function () {
      s.janelaValidade = Number(el('janelaValidade').value);
      UI.refresh();
    });

    on(el('btnLimparCategoria'), 'click', function () {
      s.produto.categoria = '';
      UI.syncFilters();
      UI.setView('dashboard');
    });
  }

  function toast(msg, kind) { UI.toast(msg, kind); }

  function bindAcoes() {
    [el('btnNovoProduto'), el('btnNovoProduto2'), el('btnTopProduto')].forEach(function (b) {
      on(b, 'click', function () { UI.formProduto(null); });
    });
    [el('btnNovaMovimentacao'), el('btnNovaMov'), el('btnTopMov')].forEach(function (b) {
      on(b, 'click', function () { UI.formMovimento(null, null); });
    });
    on(el('btnExportProdutos'), 'click', UI.exportarProdutos);
    on(el('btnExportMov'), 'click', UI.exportarMovimentos);
    on(el('btnGerarPedido'), 'click', UI.gerarListaCompra);

    on(el('btnExportar'), 'click', function () {
      if (UI.state.view === 'movimentacoes') UI.exportarMovimentos();
      else UI.exportarProdutos();
    });

    on(el('btnTema'), 'click', function () {
      aplicarTema(document.documentElement.getAttribute('data-theme') === 'escuro' ? 'claro' : 'escuro');
    });

    on(el('btnDemo'), 'click', function () {
      UI.confirmDialog('Recarregar dados demo',
        'Substituir o estoque atual por uma base de demonstração com 90 dias de histórico?',
        'Recarregar', function () {
          Store.resetDemo(90);
          syncSelects();
          UI.refresh();
          toast('Base demo regenerada (90 dias de histórico).', 'aviso');
        });
    });

    on(el('btnLimpar'), 'click', function () {
      UI.confirmDialog('Zerar estoque',
        'Apagar <b>todos</b> os produtos e movimentações salva neste navegador?',
        'Zerar tudo', function () {
          Store.limpar();
          syncSelects();
          UI.refresh();
          toast('Estoque zerado. Cadastre um produto para começar.', 'aviso');
        });
    });
  }

  function bindTeclado() {
    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (!el('modalRoot').hidden) return;
      var mapa = { '1': 'dashboard', '2': 'produtos', '3': 'movimentacoes', '4': 'alertas' };
      if (mapa[e.key]) UI.setView(mapa[e.key]);
    });
  }

  function init() {
    Store.load();
    Charts.applyDefaults();
    Charts.setHandlers({
      onCategory: function (categoria) {
        UI.goProdutos({ categoria: categoria });
        toast('Produtos filtrados por “' + categoria + '”.', 'ok');
      },
      onProduct: function (id) { UI.detalheProduto(id); }
    });

    UI.initDelegation();
    document.documentElement.setAttribute('data-theme', temaInicial());
    syncSelects();
    bindNav();
    bindFiltros();
    bindAcoes();
    bindTeclado();

    Store.subscribe(function () {
      syncSelects();
      UI.refresh();
    });

    UI.setPeriodo(30);
    UI.setView('dashboard');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.App = { init: init, syncSelects: syncSelects, aplicarTema: aplicarTema };
})(window);

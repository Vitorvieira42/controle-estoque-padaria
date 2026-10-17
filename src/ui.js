/* Camada de UI: KPIs, tabelas, alertas, modais e exportações. */
(function (global) {
  'use strict';

  var UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'pacote', 'caixa', 'dúzia', 'fardo', 'rolo'];

  var state = {
    view: 'dashboard',
    days: 30,
    janelaValidade: 7,
    produto: { busca: '', categoria: '', status: '', sort: 'nome', dir: 'asc' },
    mov: { busca: '', tipo: '', produtoId: '', desde: '', ate: '', somentePerdas: false }
  };

  var ultimaFoco = null;

  function el(id) { return document.getElementById(id); }
  function on(node, event, handler) { node && node.addEventListener(event, handler); }
  function escape(str) { return U.escapeHtml(str); }

  function saldoTexto(p) {
    return U.num(p.qtd) + ' ' + p.unidade;
  }

  function statusDe(p) {
    if (!p.ativo) return { label: 'inativo', cls: 'tag' };
    if (p.qtd <= 0) return { label: 'ruptura', cls: 'tag tag-danger' };
    if (p.qtd <= p.qtdMin) return { label: 'abaixo do mínimo', cls: 'tag tag-warn' };
    return { label: 'saudável', cls: 'tag tag-ok' };
  }

  function barraSaldo(p) {
    var meta = Math.max(p.qtdMin * 2, 1);
    var pct = U.clamp((p.qtd / meta) * 100, 0, 100);
    var cls = p.qtd <= 0 ? 'bar bar-danger' : p.qtd <= p.qtdMin ? 'bar bar-warn' : 'bar bar-ok';
    return '<div class="' + cls + '"><i style="width:' + pct.toFixed(0) + '%"></i></div>';
  }

  function validadeCelula(p) {
    if (!p.validade) return '<span class="cell-sub">—</span>';
    var dias = U.diffDays(U.todayISO(), p.validade);
    var cls = dias < 0 ? 'tag tag-danger' : dias <= 7 ? 'tag tag-warn' : 'tag';
    var sufixo = dias < 0 ? 'venceu há ' + Math.abs(dias) + 'd' : dias === 0 ? 'vence hoje' : 'em ' + dias + 'd';
    return '<span class="' + cls + '">' + U.dateFull(p.validade) + '</span> <span class="cell-sub">' + sufixo + '</span>';
  }

  // ------------------------------ toast ------------------------------
  function toast(msg, kind) {
    var stack = el('toastStack');
    if (!stack) return;
    var node = document.createElement('div');
    node.className = 'toast ' + (kind || 'ok');
    node.textContent = msg;
    stack.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity .25s';
      setTimeout(function () { node.remove(); }, 260);
    }, kind === 'erro' ? 5200 : 3200);
  }

  // ------------------------------ modal ------------------------------
  function openModal(config) {
    var root = el('modalRoot');
    el('modalTitle').textContent = config.title;
    el('modalBody').innerHTML = config.body || '';
    el('modalFoot').innerHTML = config.foot || '<button class="btn" data-close type="button">Fechar</button>';
    root.hidden = false;
    ultimaFoco = document.activeElement;
    if (config.onMount) config.onMount(el('modalBody'), el('modalFoot'));
    var first = root.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }

  function closeModal() {
    el('modalRoot').hidden = true;
    el('modalBody').innerHTML = '';
    if (ultimaFoco && ultimaFoco.focus) ultimaFoco.focus();
  }

  function confirmDialog(title, message, label, onConfirm) {
    openModal({
      title: title,
      body: '<p style="font-size:14px">' + message + '</p>',
      foot: '<button class="btn btn-danger" data-confirm type="button">' + escape(label) + '</button>' +
            '<button class="btn" data-close type="button">Cancelar</button>',
      onMount: function (body, foot) {
        on(foot.querySelector('[data-confirm]'), 'click', function () {
          closeModal();
          onConfirm();
        });
      }
    });
  }

  // ------------------------------ dashboard ------------------------------
  function renderDashboard() {
    var dias = state.days;
    var k = Store.kpis(dias);
    var alertas = Store.alertas(state.janelaValidade);
    var serie = k.serie;

    var cards = [
      {
        label: 'Valor imobilizado', value: U.brl(k.valorEstoque),
        foot: (k.variacaoEstoque >= 0 ? '<span class="trend up">▲ ' : '<span class="trend down">▼ ') +
          U.brl(Math.abs(k.variacaoEstoque)) + '</span> no período',
        cls: 'is-info', go: function () { UI.goProdutos({ sort: 'total', dir: 'desc' }); }
      },
      {
        label: 'Abaixo do mínimo', value: U.num(k.abaixoMinimo),
        foot: k.rupturas ? '<strong>' + k.rupturas + '</strong> em ruptura total' : 'nenhuma ruptura',
        cls: k.abaixoMinimo ? 'is-warn' : 'is-ok',
        go: function () { UI.setView('alertas'); }
      },
      {
        label: 'Vencendo em ' + state.janelaValidade + ' dias', value: U.num(k.vencendo),
        foot: '<strong>' + U.brl(k.valorVencendo) + '</strong> em risco',
        cls: k.vencendo ? 'is-danger' : 'is-ok',
        go: function () { UI.setView('alertas'); }
      },
      {
        label: 'Perdas no período', value: U.brl(k.perdasMes),
        foot: U.num(k.perdasPercentual, 1) + '% do imobilizado',
        cls: k.perdasPercentual > 3 ? 'is-danger' : 'is-warn',
        go: function () { UI.goMovimentacoes({ tipo: 'saida', somentePerdas: true, dias: dias }); }
      },
      {
        label: 'Cobertura média', value: k.coberturaMedia == null ? '—' : U.num(k.coberturaMedia, 1) + ' dias',
        foot: U.plural(k.movimentosHoje, 'movimentação hoje', 'movimentações hoje'),
        cls: 'is-ok',
        go: function () { UI.goProdutos({ sort: 'cobertura', dir: 'asc', status: 'minimo' }); }
      },
      {
        label: 'Receita no período', value: U.brl(k.receitaJanela),
        foot: 'base de ' + U.plural(k.itens, 'item ativo', 'itens ativos'),
        cls: 'is-info',
        go: function () { UI.goMovimentacoes({ tipo: 'saida', dias: dias }); }
      }
    ];

    el('kpiGrid').innerHTML = cards.map(function (c, i) {
      return '<button class="kpi ' + c.cls + '" type="button" data-kpi="' + i + '">' +
        '<span class="kpi-label">' + escape(c.label) + '</span>' +
        '<span class="kpi-value">' + c.value + '</span>' +
        '<span class="kpi-foot">' + c.foot + '</span></button>';
    }).join('');

    Array.prototype.forEach.call(el('kpiGrid').querySelectorAll('[data-kpi]'), function (node, i) {
      on(node, 'click', cards[i].go);
    });

    var topCat = Store.breakdownCategoria()[0];
    var perdas = Store.perdasPorMes(6);
    var piorMotivo = perdas.motivos[0];
    var picos = serie.slice().sort(function (a, b) { return b.valorSaida - a.valorSaida; })[0];

    var strip = [];
    var vencendoLogo = alertas.validade.filter(function (a) { return a.emDias <= 2; }).length;
    if (k.rupturas) strip.push({ cls: 'danger', txt: U.plural(k.rupturas, 'produto sem saldo', 'produtos sem saldo'), go: function () { UI.goProdutos({ status: 'ruptura' }); } });
    if (alertas.reposicao.length) strip.push({ cls: 'warn', txt: U.plural(alertas.reposicao.length, 'item para repor', 'itens para repor'), go: function () { UI.setView('alertas'); } });
    if (vencendoLogo) {
      strip.push({ cls: 'danger', txt: U.plural(vencendoLogo, 'item vence em até 2 dias', 'itens vencem em até 2 dias'), go: function () { UI.setView('alertas'); } });
    }
    if (topCat) strip.push({ cls: 'ok', txt: topCat.categoria + ' concentra ' + U.compact(topCat.valor), go: function () { UI.goProdutos({ categoria: topCat.categoria }); } });
    if (piorMotivo) strip.push({ cls: 'warn', txt: 'Principal perda: ' + piorMotivo.motivo + ' (' + U.compact(piorMotivo.valor) + ')', go: function () { UI.goMovimentacoes({ tipo: 'saida', somentePerdas: true, motivo: piorMotivo.motivo }); } });
    if (picos && picos.valorSaida > 0) strip.push({ cls: 'ok', txt: 'Pico de consumo: ' + U.dateFull(picos.data) + ' (' + U.compact(picos.valorSaida) + ')', go: null });

    el('alertStrip').innerHTML = strip.map(function (s, i) {
      return '<button class="strip-item ' + s.cls + '" type="button" data-strip="' + i + '">' + escape(s.txt) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el('alertStrip').querySelectorAll('[data-strip]'), function (node, i) {
      on(node, 'click', function () { if (strip[i].go) strip[i].go(); });
    });

    Charts.renderFluxo(serie);
    Charts.renderCategoria(Store.breakdownCategoria());
    var cob = Charts.renderCobertura(Store.cobertura(30), 12) || [];
    Charts.renderTop(Store.topReceita(10, dias));
    var totalPerdas = Charts.renderPerdas(perdas) || 0;

    var somaE = U.sum(serie, function (s) { return s.valorEntrada; });
    var somaS = U.sum(serie, function (s) { return s.valorSaida; });
    var somaP = U.sum(serie, function (s) { return s.valorPerda; });
    el('fluxoSub').textContent = 'Últimos ' + dias + ' dias · ' +
      U.plural(U.sum(serie, function (s) { return s.movimentos; }), 'movimentação.', 'movimentações.');
    el('fluxoFoot').innerHTML =
      '<span>Entradas <strong>' + U.brl(somaE) + '</strong></span>' +
      '<span>Saídas (CMV) <strong>' + U.brl(somaS) + '</strong></span>' +
      '<span>Perdas <strong>' + U.brl(somaP) + '</strong></span>' +
      '<span>Imobilizado hoje <strong>' + U.brl(k.valorEstoque) + '</strong></span>';
    el('coberturaFoot').innerHTML = '<span>' + U.plural(cob.filter(function (c) { return c.situacao === 'critico'; }).length,
      'crítico', 'críticos') + ' ≤ 2 dias · ' + cob.filter(function (c) { return c.situacao === 'atencao'; }).length + ' em atenção</span>' +
      '<span>clique em uma barra para abrir o produto</span>';
    el('perdasFoot').innerHTML = '<span>Total em 6 meses <strong>' + U.brl(totalPerdas) + '</strong></span>' +
      '<span>média mensal <strong>' + U.brl(totalPerdas / 6) + '</strong></span>';

    syncChips();
  }

  function syncChips() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-series]'), function (chip) {
      var key = chip.getAttribute('data-toggle-series');
      chip.classList.toggle('is-on', Charts.isSeriesOn(key));
    });
  }

  // ------------------------------ produtos ------------------------------
  function renderProdutos() {
    var f = state.produto;
    var lista = Store.listarProdutos(f);
    var corpo = el('corpoProdutos');

    corpo.innerHTML = lista.map(function (p) {
      var st = statusDe(p);
      var step = p.unidade === 'kg' || p.unidade === 'g' || p.unidade === 'L' || p.unidade === 'ml' ? 0.5 : 1;
      return '<tr data-id="' + p.id + '"' + (p.ativo ? '' : ' class="is-off"') + '>' +
        '<td><div class="cell-strong">' + escape(p.nome) + '</div>' +
          '<div class="cell-sub">' + escape(p.sku) + ' · ' + escape(p.fornecedor || 'sem fornecedor') + '</div></td>' +
        '<td><span class="tag">' + escape(p.categoria) + '</span><div class="cell-sub">' + st.label + '</div></td>' +
        '<td class="ta-right num"><strong>' + U.num(p.qtd) + '</strong> <span class="cell-sub">' + escape(p.unidade) + '</span>' +
          barraSaldo(p) + '</td>' +
        '<td class="ta-center"><span class="stepper">' +
          '<button class="btn btn-icon" type="button" data-act="menos" data-step="' + step + '" aria-label="Diminuir">−</button>' +
          '<input class="qtd-input" type="number" min="0" step="' + step + '" value="' + p.qtd + '" data-act="definir" aria-label="Novo saldo para ' + escape(p.nome) + '">' +
          '<button class="btn btn-icon" type="button" data-act="mais" data-step="' + step + '" aria-label="Aumentar">＋</button>' +
        '</span></td>' +
        '<td class="ta-right num">' + U.num(p.qtdMin) + '</td>' +
        '<td class="ta-right num">' + U.brl(p.precoCusto) + '</td>' +
        '<td class="ta-right num">' + (p.precoVenda ? U.brl(p.precoVenda) : '—') + '</td>' +
        '<td class="ta-right num">' + U.brl(p.qtd * p.precoCusto) + '</td>' +
        '<td>' + validadeCelula(p) + '</td>' +
        '<td class="ta-right"><div class="row-actions">' +
          '<button class="btn btn-icon" type="button" data-act="detalhe" title="Detalhes">👁</button>' +
          '<button class="btn btn-icon" type="button" data-act="mov" title="Movimentar">🔁</button>' +
          '<button class="btn btn-icon" type="button" data-act="editar" title="Editar">✎</button>' +
          '<button class="btn btn-icon" type="button" data-act="excluir" title="Excluir">🗑</button>' +
        '</div></td></tr>';
    }).join('');

    el('produtosVazio').hidden = lista.length > 0;
    el('tabelaProdutos').style.display = lista.length ? '' : 'none';

    var total = U.sum(lista, function (p) { return p.qtd * p.precoCusto; });
    var abaixo = lista.filter(function (p) { return p.qtd <= p.qtdMin; }).length;
    var filtroAtivo = f.busca || f.categoria || f.status;
    el('produtosSummary').innerHTML =
      '<span>' + (filtroAtivo ? 'filtrado: <b>' + U.num(lista.length) + '</b> de <b>' + U.num(Store.products().length) + '</b> itens' : '<b>' + U.num(lista.length) + '</b> ' + (lista.length === 1 ? 'item cadastrado' : 'itens cadastrados')) + '</span>' +
      '<span>imobilizado do filtro: <b>' + U.brl(total) + '</b></span>' +
      '<span>abaixo do mínimo: <b>' + abaixo + '</b></span>' +
      (f.categoria ? '<span>categoria: <b>' + escape(f.categoria) + '</b></span>' : '');

    el('badgeProdutos').textContent = Store.products().length;
  }

  // ------------------------------ movimentações ------------------------------
  function renderMovimentos() {
    var f = state.mov;
    var filtro = {
      busca: f.busca, tipo: f.tipo, produtoId: f.produtoId,
      desde: f.desde || (f.somentePerdas || f.dias ? U.addDays(U.todayISO(), -(state.days - 1)) : ''),
      ate: f.ate
    };
    var lista = Store.listarMovimentos(filtro).filter(function (m) {
      if (f.somentePerdas && !Store.isPerda(m)) return false;
      if (f.motivo && m.motivo !== f.motivo) return false;
      return true;
    });

    var visiveis = lista.slice(0, 400);
    el('corpoMov').innerHTML = visiveis.map(function (m) {
      var p = Store.getProduct(m.produtoId);
      var valor = m.quantidade * (p ? p.precoCusto : 0);
      var perda = Store.isPerda(m);
      return '<tr data-id="' + m.id + '">' +
        '<td class="num">' + U.dateFull(m.data) + '</td>' +
        '<td><span class="tag ' + (m.tipo === 'entrada' ? 'tag-ok' : perda ? 'tag-danger' : 'tag-info') + '">' +
          (m.tipo === 'entrada' ? '↑ entrada' : '↓ saída') + '</span></td>' +
        '<td><span class="cell-strong">' + escape(p ? p.nome : '(produto removido)') + '</span>' +
          '<div class="cell-sub">' + escape(p ? p.sku : '') + '</div></td>' +
        '<td class="ta-right num">' + U.num(m.quantidade) + ' <span class="cell-sub">' + escape(p ? p.unidade : '') + '</span></td>' +
        '<td class="ta-right num">' + U.brl(valor) + '</td>' +
        '<td>' + escape(m.motivo) + (perda ? ' <span class="tag tag-danger">perda</span>' : '') + '</td>' +
        '<td class="cell-sub">' + escape(m.nota || '—') + '</td>' +
        '<td class="ta-right"><div class="row-actions">' +
          '<button class="btn btn-icon" type="button" data-act="editarMov" title="Editar">✎</button>' +
          '<button class="btn btn-icon" type="button" data-act="excluirMov" title="Excluir">🗑</button>' +
        '</div></td></tr>';
    }).join('');

    el('movVazio').hidden = lista.length > 0;
    el('tabelaMov').style.display = lista.length ? '' : 'none';

    var somaEntrada = U.sum(lista.filter(function (m) { return m.tipo === 'entrada'; }), function (m) {
      var p = Store.getProduct(m.produtoId); return m.quantidade * (p ? p.precoCusto : 0);
    });
    var somaSaida = U.sum(lista.filter(function (m) { return m.tipo === 'saida'; }), function (m) {
      var p = Store.getProduct(m.produtoId); return m.quantidade * (p ? p.precoCusto : 0);
    });
    el('movSummary').innerHTML =
      '<span><b>' + U.num(lista.length) + '</b> ' + (lista.length === 1 ? 'lançamento' : 'lançamentos') + (lista.length > 400 ? ' (mostrando 400)' : '') + '</span>' +
      '<span>entradas: <b>' + U.brl(somaEntrada) + '</b></span>' +
      '<span>saídas: <b>' + U.brl(somaSaida) + '</b></span>' +
      (f.somentePerdas ? '<span>filtro: <b>apenas perdas</b></span>' : '');
  }

  // ------------------------------ alertas ------------------------------
  function renderAlertas() {
    var a = Store.alertas(state.janelaValidade);

    el('listaReposicao').innerHTML = a.reposicao.length ? a.reposicao.map(function (r) {
      var p = r.produto;
      return '<div class="list-item" data-id="' + p.id + '">' +
        '<div class="list-item-main">' +
          '<div class="list-item-title">' + escape(p.nome) + '</div>' +
          '<div class="list-item-meta">' + escape(p.categoria) + ' · ' + escape(p.fornecedor || 'sem fornecedor') +
            ' · saldo ' + saldoTexto(p) + ' / mínimo ' + U.num(p.qtdMin) + '</div>' +
          barraSaldo(p) +
        '</div>' +
        '<div class="list-item-side">falta <strong>' + U.num(r.faltando) + '</strong> ' + escape(p.unidade) +
          '<br>sugestão <strong>' + U.num(r.sugestao) + '</strong></div>' +
        '<div class="list-actions">' +
          '<button class="btn btn-sm btn-primary" type="button" data-act="repor" data-qtd="' + r.sugestao + '">Registrar entrada</button>' +
          '<button class="btn btn-sm" type="button" data-act="detalhe">Detalhes</button>' +
        '</div></div>';
    }).join('') : emptyList('Nenhum item abaixo do mínimo. Estoque saudável.');

    el('listaValidade').innerHTML = a.validade.length ? a.validade.map(function (r) {
      var p = r.produto;
      var cls = r.emDias < 0 ? 'venceu' : r.emDias <= 2 ? 'vencecendo' : '';
      return '<div class="list-item ' + cls + '" data-id="' + p.id + '">' +
        '<div class="list-item-main">' +
          '<div class="list-item-title">' + escape(p.nome) + '</div>' +
          '<div class="list-item-meta">' + escape(p.categoria) + ' · ' + saldoTexto(p) + ' · custo total ' + U.brl(r.valor) + '</div>' +
        '</div>' +
        '<div class="list-item-side">' + U.dateFull(p.validade) +
          '<br><strong>' + (r.emDias < 0 ? 'vencido há ' + Math.abs(r.emDias) + 'd' : r.emDias === 0 ? 'vence hoje' : 'em ' + r.emDias + 'd') + '</strong></div>' +
        '<div class="list-actions">' +
          '<button class="btn btn-sm btn-danger" type="button" data-act="vencer">Baixa por vencimento</button>' +
          '<button class="btn btn-sm" type="button" data-act="novaValidade">Nova data</button>' +
        '</div></div>';
    }).join('') : emptyList('Nada vencendo na janela de ' + state.janelaValidade + ' dias.');

    el('badgeAlertas').textContent = a.reposicao.length + a.validade.length || '';
    el('badgeAlertas').className = 'nav-badge' + (a.reposicao.length + a.validade.length ? ' is-warn' : '');
  }

  function emptyList(msg) {
    return '<div class="empty">' + escape(msg) + '</div>';
  }

  // ------------------------------ formulários ------------------------------
  function optionsUnidade(atual) {
    var lista = UNIDADES.slice();
    if (atual && lista.indexOf(atual) < 0) lista.push(atual);
    return lista.map(function (u) {
      return '<option value="' + escape(u) + '"' + (u === atual ? ' selected' : '') + '>' + escape(u) + '</option>';
    }).join('');
  }

  function optionsCategorias(atual) {
    var extras = [];
    Seed.CATEGORIAS.forEach(function (c) { extras.push(c); });
    Store.products().forEach(function (p) { if (extras.indexOf(p.categoria) < 0) extras.push(p.categoria); });
    return extras.map(function (c) {
      return '<option value="' + escape(c) + '"' + (c === atual ? ' selected' : '') + '>' + escape(c) + '</option>';
    }).join('');
  }

  function formProduto(p) {
    var editando = !!p;
    var body =
      '<form id="formProduto" novalidate><div class="form-grid">' +
      '<div class="form-error" id="errProduto" hidden></div>' +
      '<div class="field span-2"><label for="fNome">Nome do produto *</label>' +
        '<input id="fNome" name="nome" value="' + escape(p ? p.nome : '') + '" placeholder="Ex.: Pão Francês" required></div>' +
      '<div class="field"><label for="fSku">SKU</label>' +
        '<input id="fSku" name="sku" value="' + escape(p ? p.sku : 'PD-' + Math.floor(100 + Math.random() * 899)) + '"></div>' +
      '<div class="field"><label for="fCategoria">Categoria *</label>' +
        '<select id="fCategoria" name="categoria">' + optionsCategorias(p ? p.categoria : 'Pães') + '</select></div>' +
      '<div class="field"><label for="fUnidade">Unidade *</label>' +
        '<select id="fUnidade" name="unidade">' + optionsUnidade(p ? p.unidade : 'un') + '</select></div>' +
      '<div class="field"><label for="fFornecedor">Fornecedor</label>' +
        '<input id="fFornecedor" name="fornecedor" list="listaFornecedores" value="' + escape(p ? p.fornecedor : '') + '">' +
        '<datalist id="listaFornecedores">' +
          Store.products().map(function (x) { return x.fornecedor; }).filter(Boolean)
            .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
            .map(function (v) { return '<option value="' + escape(v) + '">'; }).join('') +
        '</datalist></div>' +
      '<div class="field"><label for="fCusto">Custo unitário (R$) *</label>' +
        '<input id="fCusto" name="precoCusto" type="number" min="0" step="0.01" value="' + (p ? p.precoCusto : '') + '"></div>' +
      '<div class="field"><label for="fVenda">Preço de venda (R$)</label>' +
        '<input id="fVenda" name="precoVenda" type="number" min="0" step="0.01" value="' + (p ? p.precoVenda : '') + '">' +
        '<span class="hint">0 para insumos e embalagens</span></div>' +
      '<div class="field"><label for="fQtd">' + (editando ? 'Saldo atual' : 'Estoque inicial') + '</label>' +
        '<input id="fQtd" name="qtd" type="number" min="0" step="0.01" value="' + (p ? p.qtd : 0) + '">' +
        (editando ? '<span class="hint">alterar aqui gera uma correção de inventário</span>' : '') + '</div>' +
      '<div class="field"><label for="fMinimo">Estoque mínimo *</label>' +
        '<input id="fMinimo" name="qtdMin" type="number" min="0" step="0.01" value="' + (p ? p.qtdMin : 0) + '"></div>' +
      '<div class="field"><label for="fValidade">Validade</label>' +
        '<input id="fValidade" name="validade" type="date" value="' + escape(p ? p.validade : '') + '">' +
        '<span class="hint">vazio = sem controle</span></div>' +
      '<div class="field"><label class="check"><input type="checkbox" id="fAtivo" name="ativo"' + (p && p.ativo === false ? '' : ' checked') + '>' +
        '<span>Produto ativo</span></label></div>' +
      '</div></form>';

    openModal({
      title: editando ? 'Editar produto' : 'Novo produto',
      body: body,
      foot: '<button class="btn btn-primary" id="salvarProduto" type="button">Salvar</button>' +
            '<button class="btn" data-close type="button">Cancelar</button>',
      onMount: function (body, foot) {
        var form = body.querySelector('#formProduto');
        var errBox = body.querySelector('#errProduto');

        function showErr(msg) {
          errBox.textContent = msg;
          errBox.hidden = false;
        }
        errBox.hidden = true;

        function submit() {
          var data = {
            nome: form.nome.value,
            sku: form.sku.value,
            categoria: form.categoria.value,
            unidade: form.unidade.value,
            fornecedor: form.fornecedor.value,
            precoCusto: Number(form.precoCusto.value),
            precoVenda: Number(form.precoVenda.value || 0),
            qtd: Number(form.qtd.value || 0),
            qtdMin: Number(form.qtdMin.value || 0),
            validade: form.validade.value,
            ativo: form.ativo.checked
          };
          if (!form.nome.value.trim() || !form.precoCusto.value) {
            showErr('Preencha ao menos nome e custo unitário.');
            return;
          }
          var res = editando ? Store.updateProduto(p.id, data) : Store.createProduto(data);
          if (!res.ok) { showErr(res.erro); return; }
          closeModal();
          UI.refresh('produto salvo');
          toast((editando ? 'Produto atualizado: ' : 'Produto criado: ') + res.produto.nome, 'ok');
        }

        on(foot.querySelector('#salvarProduto'), 'click', submit);
        on(form, 'submit', function (e) { e.preventDefault(); submit(); });
        on(form.nome, 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      }
    });
  }

  function formMovimento(mov, preset) {
    var produtos = Store.products().slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    if (!produtos.length) {
      openModal({ title: 'Sem produtos', body: '<p>Cadastre um produto antes de registrar movimentações.</p>' });
      return;
    }
    var editando = !!mov;
    var inicial = mov ? mov : Object.assign({ produtoId: preset && preset.produtoId || produtos[0].id, tipo: (preset && preset.tipo) || 'entrada', quantidade: (preset && preset.quantidade) || '', data: U.todayISO(), motivo: (preset && preset.motivo) || 'Compra', nota: (preset && preset.nota) || '' });

    var grupos = {};
    produtos.forEach(function (p) { (grupos[p.categoria] || (grupos[p.categoria] = [])).push(p); });

    var body =
      '<form id="formMov"><div class="form-grid">' +
      '<div class="form-error" id="errMov" hidden></div>' +
      '<div class="field"><label for="mTipo">Tipo de movimento *</label>' +
        '<select id="mTipo" name="tipo">' +
          '<option value="entrada"' + (inicial.tipo === 'entrada' ? ' selected' : '') + '>Entrada (compra / produção)</option>' +
          '<option value="saida"' + (inicial.tipo === 'saida' ? ' selected' : '') + '>Saída (venda / consumo / perda)</option>' +
        '</select></div>' +
      '<div class="field span-2"><label for="mProduto">Produto *</label>' +
        '<select id="mProduto" name="produtoId">' +
          Object.keys(grupos).map(function (cat) {
            return '<optgroup label="' + escape(cat) + '">' + grupos[cat].map(function (p) {
              return '<option value="' + p.id + '"' + (p.id === inicial.produtoId ? ' selected' : '') + '>' +
                escape(p.nome) + ' — saldo ' + U.num(p.qtd) + ' ' + escape(p.unidade) + '</option>';
            }).join('') + '</optgroup>';
          }).join('') + '</select></div>' +
      '<div class="field"><label for="mQtd">Quantidade *</label>' +
        '<input id="mQtd" name="quantidade" type="number" min="0" step="0.01" value="' + escape(inicial.quantidade) + '"></div>' +
      '<div class="field"><label for="mData">Data *</label>' +
        '<input id="mData" name="data" type="date" value="' + escape(inicial.data) + '"></div>' +
      '<div class="field"><label for="mMotivo">Motivo *</label>' +
        '<select id="mMotivo" name="motivo"></select></div>' +
      '<div class="field"><label for="mNota">Observação</label>' +
        '<input id="mNota" name="nota" value="' + escape(inicial.nota) + '" placeholder="nota fiscal, fornecedor, destino…"></div>' +
      '<div class="detail-grid span-2" id="mPrevia"></div>' +
      '</div></form>';

    openModal({
      title: editando ? 'Editar movimentação' : 'Registrar movimentação',
      body: body,
      foot: '<button class="btn btn-primary" id="salvarMov" type="button">Salvar</button>' +
            '<button class="btn" data-close type="button">Cancelar</button>',
      onMount: function (body, foot) {
        var form = body.querySelector('#formMov');
        var errBox = body.querySelector('#errMov');
        var selMotivo = body.querySelector('#mMotivo');

        function preencherMotivos() {
          var tipo = form.tipo.value;
          var lista = Seed.MOTIVOS[tipo];
          var atual = inicial.motivo;
          selMotivo.innerHTML = lista.map(function (m) {
            return '<option value="' + escape(m) + '"' + (m === atual ? ' selected' : '') + '>' + escape(m) + '</option>';
          }).join('');
        }

        function previa() {
          var p = Store.getProduct(form.produtoId.value);
          if (!p) return;
          var qtd = Number(form.quantidade.value || 0);
          var novo = form.tipo.value === 'entrada' ? p.qtd + qtd : p.qtd - qtd;
          var disponivel = Store.balanceAt(p.id, form.data.value || U.todayISO(), editando ? mov.id : null);
          body.querySelector('#mPrevia').innerHTML =
            '<div class="detail"><span>produto</span><strong>' + escape(p.nome) + '</strong></div>' +
            '<div class="detail"><span>saldo hoje</span><strong>' + U.num(p.qtd) + ' ' + escape(p.unidade) + '</strong></div>' +
            '<div class="detail"><span>disponível na data</span><strong>' + U.num(disponivel) + ' ' + escape(p.unidade) + '</strong></div>' +
            '<div class="detail"><span>novo saldo</span><strong style="color:' + (novo < 0 ? 'var(--danger)' : 'inherit') + '">' +
              U.num(novo) + ' ' + escape(p.unidade) + '</strong></div>' +
            '<div class="detail"><span>valor a custo</span><strong>' + U.brl(qtd * p.precoCusto) + '</strong></div>' +
            (p.precoVenda ? '<div class="detail"><span>valor de venda</span><strong>' + U.brl(qtd * p.precoVenda) + '</strong></div>' : '');
        }

        function submit() {
          var data = {
            produtoId: form.produtoId.value,
            tipo: form.tipo.value,
            quantidade: Number(form.quantidade.value || 0),
            data: form.data.value,
            motivo: selMotivo.value,
            nota: form.nota.value
          };
          var res = Store.saveMovimento(data, editando ? mov.id : null);
          if (!res.ok) {
            errBox.textContent = res.erro;
            errBox.hidden = false;
            return;
          }
          closeModal();
          UI.refresh();
          toast('Movimentação salva: ' + (data.tipo === 'entrada' ? '+' : '−') + U.num(data.quantidade) + ' ' + Store.getProduct(data.produtoId).unidade, 'ok');
        }

        errBox.hidden = true;
        preencherMotivos();
        previa();
        on(form.tipo, 'change', function () { preencherMotivos(); previa(); });
        on(form.produtoId, 'change', previa);
        on(form.quantidade, 'input', previa);
        on(form.data, 'change', previa);
        on(foot.querySelector('#salvarMov'), 'click', submit);
        on(form, 'submit', function (e) { e.preventDefault(); submit(); });
      }
    });
  }

  function detalheProduto(id) {
    var p = Store.getProduct(id);
    if (!p) { toast('Produto não encontrado.', 'erro'); return; }
    var cob = Store.cobertura(30).filter(function (c) { return c.produto.id === id; })[0] || {};
    var movs = Store.listarMovimentos({ produtoId: id }).slice(0, 10);
    var top = Store.topReceita(200, state.days).filter(function (t) { return t.produto.id === id; })[0];
    var margem = p.precoVenda && p.precoCusto ? ((p.precoVenda - p.precoCusto) / p.precoVenda * 100) : null;

    openModal({
      title: p.nome,
      body:
        '<div class="detail-grid">' +
          '<div class="detail"><span>saldo atual</span><strong>' + U.num(p.qtd) + ' ' + escape(p.unidade) + '</strong></div>' +
          '<div class="detail"><span>imobilizado</span><strong>' + U.brl(p.qtd * p.precoCusto) + '</strong></div>' +
          '<div class="detail"><span>custo unit.</span><strong>' + U.brl(p.precoCusto) + '</strong></div>' +
          '<div class="detail"><span>preço venda</span><strong>' + (p.precoVenda ? U.brl(p.precoVenda) : '—') + '</strong></div>' +
          '<div class="detail"><span>margem</span><strong>' + (margem == null ? '—' : U.num(margem, 1) + '%') + '</strong></div>' +
          '<div class="detail"><span>cobertura</span><strong>' + (cob.dias == null ? 'sem histórico' : U.num(cob.dias, 1) + ' dias') + '</strong></div>' +
          '<div class="detail"><span>consumo médio/dia</span><strong>' + U.num(cob.mediaDiaria || 0, 2) + '</strong></div>' +
          '<div class="detail"><span>mínimo</span><strong>' + U.num(p.qtdMin) + ' ' + escape(p.unidade) + '</strong></div>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--muted);margin-bottom:10px">' +
          escape(p.categoria) + ' · SKU ' + escape(p.sku) + ' · ' + escape(p.fornecedor || 'sem fornecedor') +
          (p.validade ? ' · validade ' + U.dateFull(p.validade) : '') +
          (p.ativo ? '' : ' · inativo') + (top ? ' · receita ' + U.brl(top.receita) + ' no período' : '') +
        '</p>' +
        '<h3 style="font-size:13px;margin-bottom:8px">Últimos lançamentos</h3>' +
        (movs.length ? '<div class="list">' + movs.map(function (m) {
          return '<div class="list-item"><div class="list-item-main">' +
            '<div class="list-item-title">' + (m.tipo === 'entrada' ? '↑' : '↓') + ' ' + U.num(m.quantidade) + ' ' + escape(p.unidade) + ' · ' + escape(m.motivo) + '</div>' +
            '<div class="list-item-meta">' + U.dateFull(m.data) + (m.nota ? ' · ' + escape(m.nota) : '') + '</div>' +
          '</div><div class="list-item-side">' + U.brl(m.quantidade * p.precoCusto) + '</div></div>';
        }).join('') + '</div>' : emptyList('Sem lançamentos registrados.')),
      foot:
        '<button class="btn btn-sm" id="dMovEntrada" type="button">＋ Entrada</button>' +
        '<button class="btn btn-sm" id="dMovSaida" type="button">－ Saída</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-sm" id="dEditar" type="button">Editar cadastro</button>' +
        '<button class="btn" data-close type="button">Fechar</button>',
      onMount: function (body, foot) {
        on(foot.querySelector('#dMovEntrada'), 'click', function () { formMovimento(null, { produtoId: id, tipo: 'entrada', motivo: 'Compra' }); });
        on(foot.querySelector('#dMovSaida'), 'click', function () { formMovimento(null, { produtoId: id, tipo: 'saida', motivo: 'Venda' }); });
        on(foot.querySelector('#dEditar'), 'click', function () { formProduto(p); });
      }
    });
  }

  // ------------------------------ exportações ------------------------------
  function exportarProdutos() {
    var lista = Store.listarProdutos(state.produto);
    var csv = U.toCSV(lista, [
      { key: 'sku', label: 'SKU' },
      { key: 'nome', label: 'Produto' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'fornecedor', label: 'Fornecedor' },
      { key: 'qtd', label: 'Saldo' },
      { key: 'qtdMin', label: 'Minimo' },
      { key: 'precoCusto', label: 'Custo unitario' },
      { key: 'precoVenda', label: 'Preco venda' },
      { label: 'Imobilizado', value: function (r) { return U.round(r.qtd * r.precoCusto, 2); } },
      { key: 'validade', label: 'Validade' },
      { label: 'Ativo', value: function (r) { return r.ativo ? 'sim' : 'nao'; } }
    ]);
    U.downloadText('estoque-produtos-' + U.todayISO() + '.csv', csv);
    toast(U.plural(lista.length, 'produto exportado em CSV.', 'produtos exportados em CSV.'), 'ok');
  }

  function exportarMovimentos() {
    var lista = Store.listarMovimentos({
      busca: state.mov.busca, tipo: state.mov.tipo, produtoId: state.mov.produtoId,
      desde: state.mov.desde, ate: state.mov.ate
    });
    var csv = U.toCSV(lista, [
      { key: 'data', label: 'Data' },
      { key: 'tipo', label: 'Tipo' },
      { label: 'SKU', value: function (r) { var p = Store.getProduct(r.produtoId); return p ? p.sku : ''; } },
      { label: 'Produto', value: function (r) { var p = Store.getProduct(r.produtoId); return p ? p.nome : ''; } },
      { label: 'Unidade', value: function (r) { var p = Store.getProduct(r.produtoId); return p ? p.unidade : ''; } },
      { key: 'quantidade', label: 'Quantidade' },
      { label: 'Valor custo', value: function (r) { var p = Store.getProduct(r.produtoId); return U.round(r.quantidade * (p ? p.precoCusto : 0), 2); } },
      { key: 'motivo', label: 'Motivo' },
      { key: 'nota', label: 'Observacao' }
    ]);
    U.downloadText('estoque-movimentacoes-' + U.todayISO() + '.csv', csv);
    toast(U.plural(lista.length, 'movimentação exportada.', 'movimentações exportadas.'), 'ok');
  }

  function gerarListaCompra() {
    var a = Store.alertas(state.janelaValidade);
    if (!a.reposicao.length) { toast('Nada para repor no momento.', 'aviso'); return; }
    var csv = U.toCSV(a.reposicao, [
      { label: 'Fornecedor', value: function (r) { return r.produto.fornecedor || ''; } },
      { label: 'SKU', value: function (r) { return r.produto.sku; } },
      { label: 'Produto', value: function (r) { return r.produto.nome; } },
      { label: 'Unidade', value: function (r) { return r.produto.unidade; } },
      { label: 'Saldo', value: function (r) { return r.produto.qtd; } },
      { label: 'Minimo', value: function (r) { return r.produto.qtdMin; } },
      { label: 'Sugestao', value: function (r) { return r.sugestao; } },
      { label: 'Custo unitario', value: function (r) { return r.produto.precoCusto; } },
      { label: 'Investimento', value: function (r) { return U.round(r.sugestao * r.produto.precoCusto, 2); } }
    ]);
    U.downloadText('lista-compra-' + U.todayISO() + '.csv', csv);
    var total = U.sum(a.reposicao, function (r) { return r.sugestao * r.produto.precoCusto; });
    toast(U.plural(a.reposicao.length, 'item na lista de compra', 'itens na lista de compra') + ' (' + U.brl(total) + ').', 'ok');
  }

  // ------------------------------ navegação ------------------------------
  var VIEW_META = {
    dashboard: ['Dashboard', 'Visão geral do estoque, perdas e coberturas da padaria.'],
    produtos: ['Produtos', 'Cadastro, saldos e ajustes rápidos do inventário.'],
    movimentacoes: ['Movimentações', 'Entradas, saídas e perdas com histórico auditável.'],
    alertas: ['Alertas', 'Reposição sugerida e controles de validade.']
  };

  function setView(name) {
    state.view = name;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-view') === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    var meta = VIEW_META[name] || VIEW_META.dashboard;
    el('viewTitle').textContent = meta[0];
    el('viewHint').textContent = meta[1];
    refresh();
  }

  function goProdutos(patch) {
    Object.keys(patch || {}).forEach(function (k) { state.produto[k] = patch[k]; });
    UI.syncFilters();
    setView('produtos');
  }

  function goMovimentacoes(patch) {
    Object.keys(patch || {}).forEach(function (k) { state.mov[k] = patch[k]; });
    UI.syncFilters();
    setView('movimentacoes');
  }

  function syncFilters() {
    if (el('buscaProduto')) el('buscaProduto').value = state.produto.busca;
    if (el('filtroCategoria')) el('filtroCategoria').value = state.produto.categoria;
    if (el('filtroStatus')) el('filtroStatus').value = state.produto.status;
    if (el('ordenarProduto')) el('ordenarProduto').value = state.produto.sort;
    if (el('inverterOrdem')) el('inverterOrdem').checked = state.produto.dir === 'desc';
    if (el('buscaMov')) el('buscaMov').value = state.mov.busca;
    if (el('filtroTipo')) el('filtroTipo').value = state.mov.tipo;
    if (el('filtroProduto')) el('filtroProduto').value = state.mov.produtoId;
    if (el('filtroDesde')) el('filtroDesde').value = state.mov.desde;
    if (el('filtroAte')) el('filtroAte').value = state.mov.ate;
    var limpar = el('btnLimparCategoria');
    if (limpar) limpar.hidden = !state.produto.categoria;
  }

  function refresh() {
    if (state.view === 'dashboard') renderDashboard();
    if (state.view === 'produtos') renderProdutos();
    if (state.view === 'movimentacoes') renderMovimentos();
    if (state.view === 'alertas') renderAlertas();
    // badges sempre atualizados
    el('badgeProdutos').textContent = Store.products().length;
    var a = Store.alertas(state.janelaValidade);
    var badge = el('badgeAlertas');
    badge.textContent = a.reposicao.length + a.validade.length || '';
    badge.className = 'nav-badge' + (a.reposicao.length + a.validade.length ? ' is-warn' : '');
    var note = el('storageNote');
    if (note) {
      note.textContent = U.num(Store.tamanhoSalvo() / 1024, 1) + ' KB salvos localmente · ' +
        U.plural(Store.movements().length, 'lançamento', 'lançamentos');
    }
  }

  function setPeriodo(days) {
    state.days = days;
    Array.prototype.forEach.call(document.querySelectorAll('#periodPicker button'), function (b) {
      b.classList.toggle('is-active', Number(b.getAttribute('data-days')) === days);
    });
    if (state.view === 'dashboard') renderDashboard();
  }

  // ------------------------------ delegação de eventos ------------------------------
  function stepSaldo(input, delta) {
    var tr = input.closest('tr');
    var p = Store.getProduct(tr.getAttribute('data-id'));
    if (!p) return;
    var antes = p.qtd;
    var novo = U.round(Math.max(0, Number(input.value || 0) + delta), 2);
    input.value = novo;
    if (novo === antes) return;
    var res = Store.ajustarSaldo(p.id, novo);
    if (!res.ok) {
      toast(res.erro, 'erro');
      input.value = antes;
      return;
    }
    UI.refresh();
    toast(p.nome + ': saldo ' + U.num(antes) + ' → ' + U.num(novo) + ' ' + p.unidade, 'ok');
  }

  function initDelegation() {
    on(el('corpoProdutos'), 'click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var tr = btn.closest('tr');
      var id = tr.getAttribute('data-id');
      var act = btn.getAttribute('data-act');
      if (act === 'mais' || act === 'menos') {
        stepSaldo(tr.querySelector('.qtd-input'), Number(btn.getAttribute('data-step')) * (act === 'mais' ? 1 : -1));
      } else if (act === 'editar') {
        formProduto(Store.getProduct(id));
      } else if (act === 'detalhe') {
        detalheProduto(id);
      } else if (act === 'mov') {
        formMovimento(null, { produtoId: id, tipo: 'entrada', motivo: 'Compra' });
      } else if (act === 'excluir') {
        var p = Store.getProduct(id);
        var n = Store.movements().filter(function (m) { return m.produtoId === id; }).length;
        confirmDialog('Excluir produto',
          'Remover <strong>' + escape(p.nome) + '</strong> e ' + U.plural(n, 'lançamento', 'lançamentos') + ' vinculado' + (n === 1 ? '' : 's') + '? A ação não pode ser desfeita.',
          'Excluir', function () {
            Store.removeProduto(id);
            UI.refresh();
            toast('Produto removido.', 'aviso');
          });
      }
    });

    on(el('corpoProdutos'), 'change', function (e) {
      if (!e.target.classList.contains('qtd-input')) return;
      var tr = e.target.closest('tr');
      var p = Store.getProduct(tr.getAttribute('data-id'));
      var novo = U.round(Math.max(0, Number(e.target.value || 0)), 2);
      if (!p || novo === p.qtd) { e.target.value = p ? p.qtd : 0; return; }
      var res = Store.ajustarSaldo(p.id, novo);
      if (!res.ok) { toast(res.erro, 'erro'); e.target.value = p.qtd; return; }
      UI.refresh();
      toast(p.nome + ': saldo ajustado para ' + U.num(novo) + ' ' + p.unidade + '.', 'ok');
    });

    var head = el('tabelaProdutos').querySelector('thead');
    on(head, 'click', function (e) {
      var th = e.target.closest('th[data-sort]');
      if (!th) return;
      var key = th.getAttribute('data-sort');
      if (state.produto.sort === key) state.produto.dir = state.produto.dir === 'asc' ? 'desc' : 'asc';
      else { state.produto.sort = key; state.produto.dir = key === 'nome' || key === 'categoria' ? 'asc' : 'desc'; }
      UI.syncFilters();
      renderProdutos();
    });

    on(el('corpoMov'), 'click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = btn.closest('tr').getAttribute('data-id');
      if (btn.getAttribute('data-act') === 'editarMov') {
        var m = Store.movements().filter(function (x) { return x.id === id; })[0];
        formMovimento(m);
      } else {
        var mov = Store.movements().filter(function (x) { return x.id === id; })[0];
        var p = mov && Store.getProduct(mov.produtoId);
        confirmDialog('Excluir movimentação',
          'Remover o lançamento de <strong>' + U.num(mov.quantidade) + ' ' + escape(p ? p.unidade : '') +
          '</strong> de ' + escape(p ? p.nome : '') + ' em ' + U.dateFull(mov.data) + '? O saldo será recalculado.',
          'Excluir', function () {
            Store.removeMovimento(id);
            UI.refresh();
            toast('Lançamento removido e saldo recalculado.', 'aviso');
          });
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll('#listaReposicao, #listaValidade'), function (list) {
      on(list, 'click', function (e) {
        var btn = e.target.closest('[data-act]');
        if (!btn) return;
        var id = btn.closest('[data-id]').getAttribute('data-id');
        var p = Store.getProduct(id);
        var act = btn.getAttribute('data-act');
        if (act === 'repor') {
          formMovimento(null, {
            produtoId: id, tipo: 'entrada', quantidade: btn.getAttribute('data-qtd'),
            motivo: 'Compra', nota: p.fornecedor
          });
        } else if (act === 'detalhe') {
          detalheProduto(id);
        } else if (act === 'vencer') {
          formMovimento(null, {
            produtoId: id, tipo: 'saida', quantidade: p.qtd,
            motivo: 'Vencimento', nota: 'Baixa de validade'
          });
        } else if (act === 'novaValidade') {
          var nova = U.addDays(U.todayISO(), 30);
          Store.updateProduto(id, Object.assign({}, p, { qtd: p.qtd, validade: nova }));
          UI.refresh();
          toast('Validade de ' + p.nome + ' atualizada para ' + U.dateFull(nova) + '.', 'ok');
        }
      });
    });

    on(el('modalBackdrop'), 'click', closeModal);
    on(el('modalClose'), 'click', closeModal);
    on(el('modalFoot'), 'click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el('modalRoot').hidden) closeModal();
    });
  }

  global.UI = {
    state: state,
    UNIDADES: UNIDADES,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    renderDashboard: renderDashboard,
    renderProdutos: renderProdutos,
    renderMovimentos: renderMovimentos,
    renderAlertas: renderAlertas,
    formProduto: formProduto,
    formMovimento: formMovimento,
    detalheProduto: detalheProduto,
    exportarProdutos: exportarProdutos,
    exportarMovimentos: exportarMovimentos,
    gerarListaCompra: gerarListaCompra,
    setView: setView,
    goProdutos: goProdutos,
    goMovimentacoes: goMovimentacoes,
    syncFilters: syncFilters,
    refresh: refresh,
    setPeriodo: setPeriodo,
    initDelegation: initDelegation
  };
})(window);

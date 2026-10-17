/* Dashboard de gráficos Chart.js: renderização, tema e interações (filtro e drill-down). */
(function (global) {
  'use strict';

  var registry = Object.create(null);
  var handlers = { onCategory: function () {}, onProduct: function () {} };
  var visibilities = Object.create(null);

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      text: cssVar('--text'),
      muted: cssVar('--muted'),
      grid: cssVar('--chart-grid'),
      surface: cssVar('--surface'),
      primary: cssVar('--primary'),
      ok: cssVar('--ok'),
      warn: cssVar('--warn'),
      danger: cssVar('--danger'),
      info: cssVar('--info')
    };
  }

  var CAT_COLORS = ['#b3641f', '#2f7d52', '#c98a04', '#2c6b8f', '#8a4f7d', '#7a6a58', '#a8452f'];

  function alpha(hex, a) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',') + ',' + a + ')';
  }

  function applyDefaults() {
    var c = palette();
    Chart.defaults.font.family = 'Inter, "Segoe UI", system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = c.muted;
    Chart.defaults.borderColor = c.grid;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = c.text;
    Chart.defaults.plugins.tooltip.titleColor = c.surface;
    Chart.defaults.plugins.tooltip.bodyColor = c.surface;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 420;
  }

  function setEmpty(canvasId, isEmpty, message) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var box = canvas.parentElement;
    var node = box.querySelector('.chart-empty');
    if (isEmpty) {
      if (!node) {
        node = document.createElement('div');
        node.className = 'chart-empty';
        box.appendChild(node);
      }
      node.textContent = message || 'Sem dados no período selecionado.';
    } else if (node) {
      node.remove();
    }
    return canvas;
  }

  function mount(canvasId, type, data, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var chart = registry[canvasId];
    if (chart && chart.config.type === type) {
      chart.data = data;
      Object.keys(options || {}).forEach(function (key) { chart.options[key] = options[key]; });
      chart.update();
      return chart;
    }
    if (chart) chart.destroy();
    registry[canvasId] = new Chart(canvas, { type: type, data: data, options: options || {} });
    return registry[canvasId];
  }

  /* ------------------------- 1. fluxo de valor ------------------------- */
  function renderFluxo(serie) {
    var c = palette();
    var hasData = serie.some(function (s) { return s.movimentos > 0; });
    setEmpty('chartFluxo', !hasData, 'Nenhuma movimentação registrada no período.');

    var labels = serie.map(function (s) { return U.dateLabel(s.data); });
    var defs = [
      { key: 'valorEstoque', label: 'Imobilizado (R$)', color: c.info, dashed: true, order: 1 },
      { key: 'valorEntrada', label: 'Entradas (custo)', color: c.ok, area: true, order: 2 },
      { key: 'valorSaida', label: 'Saídas (CMV)', color: c.primary, area: true, order: 3 },
      { key: 'valorPerda', label: 'Perdas (custo)', color: c.danger, area: true, order: 4 }
    ];

    var datasets = defs.map(function (d) {
      var visible = visibilities[d.key] !== false;
      return {
        label: d.label,
        data: serie.map(function (s) { return s[d.key]; }),
        borderColor: d.color,
        backgroundColor: d.area ? alpha(d.color, .18) : 'transparent',
        borderWidth: d.key === 'valorEstoque' ? 2 : 1.8,
        borderDash: d.dashed ? [5, 4] : [],
        fill: d.area ? 'origin' : false,
        tension: .32,
        cubicInterpolationMode: 'monotone',
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: d.color,
        yAxisID: d.key === 'valorEstoque' ? 'y1' : 'y',
        hidden: !visible,
        _key: d.key
      };
    });

    var money = function (value) { return U.brl(value); };

    mount('chartFluxo', 'line', { labels: labels, datasets: datasets }, {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + ': ' + money(ctx.parsed.y); }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 18 } },
        y: {
          title: { display: true, text: 'Fluxo do dia (R$)' },
          ticks: { callback: function (v) { return U.compact(v); } },
          grid: { color: c.grid }
        },
        y1: {
          position: 'right',
          title: { display: true, text: 'Imobilizado (R$)' },
          ticks: { callback: function (v) { return U.compact(v); } },
          grid: { drawOnChartArea: false }
        }
      }
    });

    return serie;
  }

  function toggleSeries(key) {
    visibilities[key] = visibilities[key] === false;
    var chart = registry.chartFluxo;
    if (!chart) return visibilities[key];
    chart.data.datasets.forEach(function (ds, i) {
      if (ds._key === key) chart.setDatasetVisibility(i, visibilities[key]);
    });
    chart.update();
    return visibilities[key];
  }

  /* ------------------------- 2. rosca por categoria ------------------------- */
  function renderCategoria(rows) {
    var total = U.sum(rows, function (r) { return r.valor; });
    setEmpty('chartCategoria', total <= 0, 'Nenhum produto com saldo cadastrado.');
    var c = palette();

    var chart = mount('chartCategoria', 'doughnut', {
      labels: rows.map(function (r) { return r.categoria; }),
      datasets: [{
        data: rows.map(function (r) { return r.valor; }),
        backgroundColor: rows.map(function (r, i) { return CAT_COLORS[i % CAT_COLORS.length]; }),
        borderColor: c.surface,
        borderWidth: 2,
        hoverOffset: 10
      }]
    }, {
      cutout: '64%',
      plugins: {
        legend: { position: 'right', labels: { maxBoxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              var r = rows[ctx.dataIndex];
              var pct = total > 0 ? U.num(r.valor / total * 100, 1) : '0';
              return r.categoria + ': ' + U.brl(r.valor) + ' (' + pct + '% · ' + U.plural(r.itens, 'item', 'itens') + ')';
            }
          }
        }
      },
      onClick: function (evt, els) {
        if (!els.length) return;
        var r = rows[els[0].index];
        handlers.onCategory(r.categoria);
      },
      onHover: function (evt, els) {
        evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
        updateCenter(els.length ? rows[els[0].index] : null, total);
      }
    });

    updateCenter(null, total);
    return chart;
  }

  function updateCenter(row, total) {
    var node = document.getElementById('doughnutCenter');
    if (!node) return;
    node.innerHTML = row
      ? '<strong>' + U.compact(row.valor) + '</strong><span>' + U.escapeHtml(row.categoria) + '</span>'
      : '<strong>' + U.compact(total) + '</strong><span>estoque total</span>';
  }

  /* ------------------------- 3. cobertura em dias ------------------------- */
  function renderCobertura(rows, diasMin) {
    var list = rows.filter(function (r) { return r.dias != null; })
      .sort(function (a, b) { return a.dias - b.dias; })
      .slice(0, diasMin || 12);

    setEmpty('chartCobertura', !list.length, 'Sem histórico de saída suficiente para calcular cobertura.');
    var c = palette();
    var cor = function (s) { return s === 'critico' ? c.danger : s === 'atencao' ? c.warn : c.ok; };

    mount('chartCobertura', 'bar', {
      labels: list.map(function (r) { return r.produto.nome; }),
      datasets: [{
        label: 'Dias de cobertura',
        data: list.map(function (r) { return r.dias; }),
        backgroundColor: list.map(function (r) { return alpha(cor(r.situacao), .85); }),
        borderColor: list.map(function (r) { return cor(r.situacao); }),
        borderWidth: 1,
        borderRadius: 5,
        barThickness: 14
      }]
    }, {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) { return list[items[0].dataIndex].produto.nome; },
            label: function (ctx) {
              var r = list[ctx.dataIndex];
              return [
                U.num(r.dias, 1) + ' dias de saldo',
                'Saldo: ' + U.num(r.qtd) + ' ' + r.produto.unidade,
                'Consumo médio: ' + U.num(r.mediaDiaria, 2) + ' ' + r.produto.unidade + '/dia',
                'Mínimo: ' + U.num(r.produto.qtdMin) + ' ' + r.produto.unidade
              ];
            }
          }
        }
      },
      onClick: function (evt, els) {
        if (els.length) handlers.onProduct(list[els[0].index].produto.id);
      },
      onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: {
        x: { title: { display: true, text: 'dias de autonomia' }, grid: { color: c.grid }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } }
      }
    });

    return list;
  }

  /* ------------------------- 4. top receita ------------------------- */
  function renderTop(rows) {
    setEmpty('chartTop', !rows.length, 'Nenhuma venda registrada no período.');
    var c = palette();

    mount('chartTop', 'bar', {
      labels: rows.map(function (r) { return r.produto.nome; }),
      datasets: [{
        label: 'Receita (R$)',
        data: rows.map(function (r) { return r.receita; }),
        backgroundColor: alpha(c.primary, .78),
        hoverBackgroundColor: c.primary,
        borderRadius: 5,
        barThickness: 14
      }]
    }, {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function (items) { return rows[items[0].dataIndex].produto.nome; },
            label: function (ctx) {
              var r = rows[ctx.dataIndex];
              return [
                'Receita: ' + U.brl(r.receita),
                'Volume: ' + U.num(r.qtd) + ' ' + r.produto.unidade,
                'Preço venda: ' + U.brl(r.produto.precoVenda),
                'Saldo atual: ' + U.num(r.produto.qtd) + ' ' + r.produto.unidade
              ];
            }
          }
        }
      },
      onClick: function (evt, els) {
        if (els.length) handlers.onProduct(rows[els[0].index].produto.id);
      },
      onHover: function (evt, els) { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      scales: {
        x: { grid: { color: c.grid }, ticks: { callback: function (v) { return U.compact(v); } }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } }
      }
    });
  }

  /* ------------------------- 5. perdas por mês ------------------------- */
  function renderPerdas(perdas) {
    var motivos = perdas.motivos.map(function (m) { return m.motivo; });
    var total = U.sum(perdas.meses, function (m) { return m.total; });
    setEmpty('chartPerdas', total <= 0, 'Nenhuma perda registrada no período.');
    var c = palette();
    var cores = { Vencimento: c.danger, Quebra: c.warn, Avaria: c.info };

    mount('chartPerdas', 'bar', {
      labels: perdas.meses.map(function (m) { return m.label; }),
      datasets: motivos.map(function (motivo, i) {
        return {
          label: motivo,
          data: perdas.meses.map(function (m) { return m.motivos[motivo] || 0; }),
          backgroundColor: alpha(cores[motivo] || CAT_COLORS[i % CAT_COLORS.length], .82),
          borderRadius: 4,
          stack: 'perdas'
        };
      })
    }, {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + ': ' + U.brl(ctx.parsed.y); },
            footer: function (items) {
              var idx = items[0].dataIndex;
              return 'Total do mês: ' + U.brl(perdas.meses[idx].total);
            }
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          grid: { color: c.grid },
          ticks: { callback: function (v) { return U.compact(v); } },
          title: { display: true, text: 'custo perdido (R$)' }
        }
      }
    });

    return total;
  }

  global.Charts = {
    setHandlers: function (next) {
      Object.keys(next || {}).forEach(function (k) { handlers[k] = next[k]; });
    },
    applyDefaults: applyDefaults,
    renderFluxo: renderFluxo,
    renderCategoria: renderCategoria,
    renderCobertura: renderCobertura,
    renderTop: renderTop,
    renderPerdas: renderPerdas,
    toggleSeries: toggleSeries,
    isSeriesOn: function (key) { return visibilities[key] !== false; },
    retheme: function () {
      Object.keys(registry).forEach(function (id) {
        registry[id].destroy();
        delete registry[id];
      });
      applyDefaults();
    }
  };
})(window);

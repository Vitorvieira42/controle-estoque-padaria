/* Utilidades puras: datas, formatacao, ids, DOM, CSV. */
(function (global) {
  'use strict';

  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** Data local no formato canônico ISO curto (YYYY-MM-DD), estável para ordenação. */
  function toISODate(date) {
    var d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** Converte 'YYYY-MM-DD' para Date local sem deslocamento de fuso. */
  function fromISODate(iso) {
    var p = String(iso || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2] || 1));
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function addDays(iso, days) {
    var d = fromISODate(iso);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  function diffDays(fromISO, toISO) {
    var a = fromISODate(fromISO).getTime();
    var b = fromISODate(toISO).getTime();
    return Math.round((b - a) / 86400000);
  }

  function monthKey(iso) {
    return String(iso).slice(0, 7);
  }

  function monthLabel(key) {
    var p = String(key).split('-');
    return MESES[Number(p[1]) - 1] + '/' + p[0].slice(2);
  }

  function dateLabel(iso) {
    var d = fromISODate(iso);
    return pad2(d.getDate()) + ' ' + MESES[d.getMonth()];
  }

  function dateFull(iso) {
    return String(iso).split('-').reverse().join('/');
  }

  function brl(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  }

  function num(value, digits) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits == null ? 2 : digits
    }).format(Number(value) || 0);
  }

  function compact(value) {
    var n = Number(value) || 0;
    if (Math.abs(n) >= 1000) return 'R$ ' + num(n / 1000, 1) + ' mil';
    return brl(n);
  }

  /** "1 item" / "3 itens" — evita plural no meio da contagem. */
  function plural(qtd, singular, pluralFormo) {
    var n = Number(qtd) || 0;
    return num(n) + ' ' + (n === 1 ? singular : pluralFormo);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function round(n, digits) {
    var f = Math.pow(10, digits == null ? 2 : digits);
    return Math.round((Number(n) || 0) * f) / f;
  }

  function sum(list, pick) {
    var acc = 0;
    for (var i = 0; i < list.length; i++) acc += Number(pick ? pick(list[i]) : list[i]) || 0;
    return acc;
  }

  function groupBy(list, pick) {
    var out = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var k = pick(list[i]);
      (out[k] || (out[k] = [])).push(list[i]);
    }
    return out;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toCSV(rows, columns) {
    var head = columns.map(function (c) { return c.label; });
    var lines = [head];
    rows.forEach(function (row) {
      lines.push(columns.map(function (c) {
        var v = c.value ? c.value(row) : row[c.key];
        return v == null ? '' : v;
      }));
    });
    return lines.map(function (l) {
      return l.map(function (cell) {
        var s = String(cell);
        return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob(['\ufeff' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  /** PRNG determinístico (mulberry32) para gerar dados demo reproduzíveis. */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  global.U = {
    MESES: MESES,
    pad2: pad2,
    toISODate: toISODate,
    fromISODate: fromISODate,
    todayISO: todayISO,
    addDays: addDays,
    diffDays: diffDays,
    monthKey: monthKey,
    monthLabel: monthLabel,
    dateLabel: dateLabel,
    dateFull: dateFull,
    brl: brl,
    num: num,
    compact: compact,
    plural: plural,
    uid: uid,
    clamp: clamp,
    round: round,
    sum: sum,
    groupBy: groupBy,
    escapeHtml: escapeHtml,
    toCSV: toCSV,
    downloadText: downloadText,
    debounce: debounce,
    rng: rng
  };
})(window);

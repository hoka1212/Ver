/* Карта России: субъекты федерации, их столицы и крупные реки на плоской карте мира.
   Геометрия — Natural Earth 1:10m, проекция — цилиндрическая Миллера. */
(function () {
'use strict';

// ---------------------------------------------------------------- проекция
// Плоская карта мира: меридианы — вертикальные прямые, параллели — горизонтальные.
// Проекция Миллера растягивает высокие широты заметно меньше, чем Меркатор, и
// не уходит в бесконечность у полюсов. Центральный меридиан 11,5° в. д.: тогда
// разрез карты (168,5° з. д.) проходит по Беринговому проливу — между островом
// Ратманова (168,99° з. д., Россия) и Аляской (168,08° з. д.), — и ни Россия,
// ни Америка не разрезаются.
var RAD = Math.PI / 180;
var LON0 = 11.5;

// lon, lat в градусах -> x, y в радианах; y растёт вниз, как на экране
function project(lon, lat) {
  var lam = lon - LON0;
  while (lam > 180) lam -= 360;
  while (lam <= -180) lam += 360;
  var phi = Math.max(-89.9, Math.min(89.9, lat)) * RAD;
  return [lam * RAD, -1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi))];
}
// широта по экранной координате y (обратное к project)
function unprojectLat(y) {
  return (2.5 * Math.atan(Math.exp(-0.8 * y)) - 0.625 * Math.PI) / RAD;
}
// контур или линия целиком: если кусок пересекает линию разреза, его точки
// остаются по одну сторону, а не перепрыгивают через всю карту
function projRing(ring) {
  var out = [], sum = 0, i, p;
  for (i = 0; i < ring.length; i++) {
    p = project(ring[i][0], ring[i][1]);
    if (i) {
      var prev = out[i - 1][0];
      while (p[0] - prev > Math.PI) p[0] -= 2 * Math.PI;
      while (p[0] - prev < -Math.PI) p[0] += 2 * Math.PI;
    }
    sum += p[0];
    out.push(p);
  }
  var shift = sum / out.length > Math.PI ? -2 * Math.PI : sum / out.length < -Math.PI ? 2 * Math.PI : 0;
  if (shift) out.forEach(function (q) { q[0] += shift; });
  return out;
}

// --------------------------------------------------------------- состояние
var VW = 2000, VH = 1160;           // внутренняя система координат карты
var fit = { k: 1, dx: 0, dy: 0 };   // проекция -> внутренние координаты
var extent = [0, 0, VW, VH];        // докуда можно сдвинуть карту: Россия + страны Европы и Азии
var view = { k: 1, x: 0, y: 0, r: 0 };  // зум, панорама и поворот (r, градусы)
var MIN_K = 0.85, MAX_K = 90;       // MIN_K уменьшается, чтобы влез весь мир
var geo = window.RU_GEO, meta = window.RU_REGIONS, rivers = window.RU_RIVERS;
var countryMeta = window.RU_COUNTRIES || [];

var regions = [];                   // субъекты России
var countries = [];                 // страны Европы и Азии
var areas = [];                     // и то и другое: всё, что можно навести и выбрать
var markers = [];                   // звёзды столиц и точки центров регионов
var byCode = {};
var riverData = [];
var selected = null, hovered = null;
var opts = { rivers: true, labels: true, capitals: true, lakes: true,
             allLabels: false, colorBy: 'district' };

var DISTRICTS = [
  ['ЦФО', 'Центральный',       '#7aa8d6'],
  ['СЗФО', 'Северо-Западный',  '#79c0c6'],
  ['ЮФО', 'Южный',             '#e2a87c'],
  ['СКФО', 'Северо-Кавказский','#d99694'],
  ['ПФО', 'Приволжский',       '#9fc487'],
  ['УФО', 'Уральский',         '#c3a5cf'],
  ['СФО', 'Сибирский',         '#e8cd83'],
  ['ДФО', 'Дальневосточный',   '#8fb3a0']
];
var DCOLOR = {}, DNAME = {};
DISTRICTS.forEach(function (d) { DCOLOR[d[0]] = d[2]; DNAME[d[0]] = d[1]; });

var TYPES = [
  ['Республика', '#8fbf9f'], ['Край', '#e3b880'], ['Область', '#8fb0d8'],
  ['Город федерального значения', '#d98f8f'], ['Автономная область', '#c6a9d6'],
  ['Автономный округ', '#a8cfd6']
];
var TCOLOR = {};
TYPES.forEach(function (t) { TCOLOR[t[0]] = t[1]; });

// страны Европы и Азии раскрашены приглушённо и не зависят от выбранной
// заливки; номер цвета — раскраска Natural Earth, у соседей он всегда разный
var COUNTRY_PALETTE = ['#d9cfa0', '#bcd0a6', '#d6b4c0', '#b9b6d9', '#a9cbbf', '#e2bea0', '#b8c9da'];

// --------------------------------------------------------------- геометрия
function prepare() {
  // все точки субъектов -> общий охват -> подгонка под VW x VH
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  var projected = {};
  Object.keys(geo.regions).forEach(function (code) {
    projected[code] = geo.regions[code].map(function (poly) {
      return poly.map(function (ring) {
        return projRing(ring).map(function (p) {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
          return p;
        });
      });
    });
  });
  var pad = 28;
  fit.k = Math.min((VW - 2 * pad) / (maxX - minX), (VH - 2 * pad) / (maxY - minY));
  fit.dx = pad - minX * fit.k + ((VW - 2 * pad) - (maxX - minX) * fit.k) / 2;
  fit.dy = pad - minY * fit.k + ((VH - 2 * pad) - (maxY - minY) * fit.k) / 2;

  meta.forEach(function (m, i) {
    var polys = (projected[m.code] || []).map(function (poly) {
      return poly.map(function (ring) { return ring.map(toView); });
    });
    var r = {
      code: m.code, name: m.name, short: m.short, type: m.type,
      capital: m.capital, capitalLL: m.capitalLL, district: m.district,
      area: m.area, pop: m.pop, idx: i, polys: polys,
      d: polys.map(ringPath).join(''),
      bbox: polyBBox(polys)
    };
    r.mainArea = mainRingArea(polys);
    r.anchor = poleOfInaccessibility(largestRing(polys));
    regions.push(r);
    byCode[r.code] = r;
  });

  // страны Европы и Азии. Охват карты и стартовый вид по-прежнему считаются
  // только по субъектам России, а вот отдалить карту можно до всего мира
  countryMeta.forEach(function (m, i) {
    var polys = projPolys(geo.countries[m.code]);
    if (!polys.length) return;
    var c = {
      code: m.code, name: m.name, short: m.short, type: m.type, part: m.part,
      capital: m.capital, capitalLL: m.capitalLL, area: m.area, pop: m.pop,
      popNote: m.popNote, note: m.note, color: m.color, isCountry: true, idx: i,
      polys: polys, d: polys.map(ringPath).join(''), bbox: polyBBox(polys)
    };
    c.mainArea = mainRingArea(polys);
    c.anchor = poleOfInaccessibility(largestRing(polys));
    countries.push(c);
    byCode[c.code] = c;
    extent = [Math.min(extent[0], c.bbox[0]), Math.min(extent[1], c.bbox[1]),
              Math.max(extent[2], c.bbox[2]), Math.max(extent[3], c.bbox[3])];
  });
  areas = regions.concat(countries);

  // остальной мир — серой подложкой; он тоже входит в охват, чтобы карту можно
  // было отдалить до всей Земли
  geo.land.forEach(function (l) {
    var polys = projPolys(l.polys);
    l.d = polys.map(ringPath).join('');
    var b = polyBBox(polys);
    extent = [Math.min(extent[0], b[0]), Math.min(extent[1], b[1]),
              Math.max(extent[2], b[2]), Math.max(extent[3], b[3])];
  });
  MIN_K = Math.min(0.85, 0.95 * Math.min(VW / (extent[2] - extent[0]),
                                         VH / (extent[3] - extent[1])));
  buildMarkers();

  geo.lakes.forEach(function (l) {
    var polys = projPolys(l.polys);
    l.d = polys.map(ringPath).join('');
    l.anchor = poleOfInaccessibility(largestRing(polys));
    l.bbox = polyBBox(polys);
  });

  rivers.forEach(function (r) {
    var lines = r.lines.map(projViewRing);
    var best = 0, bi = 0, lens = [];
    lines.forEach(function (line, i) {
      var len = lineLength(line);
      lens.push(len);
      if (len > best) { best = len; bi = i; }
    });
    riverData.push({ name: r.name, order: r.order, length: r.length,
                     lines: lines, lens: lens, main: bi, mainLen: best,
                     d: lines.map(linePath).join('') });
  });
  riverData.sort(function (a, b) { return a.order - b.order; });
}

function projView(c) { return toView(project(c[0], c[1])); }
function projViewRing(ring) { return projRing(ring).map(toView); }
function projPolys(polys) {
  return (polys || []).map(function (poly) { return poly.map(projViewRing); });
}

// Звёзды — столицы государств (Москва и столицы стран Европы и Азии), точки —
// центры субъектов России. Где центр субъекта — тот же город, что столица или
// центр соседнего субъекта (Ленинградская область и Петербург), значок один.
// Сверяем и название, и место: разные города бывают совсем рядом
function buildMarkers() {
  var seen = [];
  function add(ll, star, owner) {
    for (var i = 0; i < seen.length; i++) {
      if (seen[i].name === owner.capital &&
          Math.abs(seen[i].ll[0] - ll[0]) < 0.1 && Math.abs(seen[i].ll[1] - ll[1]) < 0.1) {
        seen[i].owners.push(owner);
        return;
      }
    }
    var p = projView(ll);
    var m = { ll: ll, x: p[0], y: p[1], star: star, owners: [owner], name: owner.capital,
              minK: star ? 0 : Infinity,
              // у столиц стран рядом со звездой подписано название города
              capOf: star && owner.isCountry ? owner : null };
    seen.push(m);
    markers.push(m);
  }
  meta.forEach(function (m) {
    if (m.capital === 'Москва') add(m.capitalLL, true, byCode[m.code]);
  });
  countries.forEach(function (c) { if (c.capitalLL) add(c.capitalLL, true, c); });
  regions.forEach(function (r) { if (r.capitalLL) add(r.capitalLL, false, r); });
}
function toView(p) { return [p[0] * fit.k + fit.dx, p[1] * fit.k + fit.dy]; }

function ringPath(poly) {
  var s = '';
  for (var i = 0; i < poly.length; i++) {
    var ring = poly[i];
    if (ring.length < 3) continue;
    s += 'M' + ring[0][0].toFixed(1) + ' ' + ring[0][1].toFixed(1);
    for (var j = 1; j < ring.length; j++) {
      s += 'L' + ring[j][0].toFixed(1) + ' ' + ring[j][1].toFixed(1);
    }
    s += 'Z';
  }
  return s;
}
function linePath(line) {
  var s = 'M' + line[0][0].toFixed(1) + ' ' + line[0][1].toFixed(1);
  for (var i = 1; i < line.length; i++) {
    s += 'L' + line[i][0].toFixed(1) + ' ' + line[i][1].toFixed(1);
  }
  return s;
}
function lineLength(line) {
  var s = 0;
  for (var i = 1; i < line.length; i++) {
    s += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return s;
}
// точка на ломаной по доле длины + направление хода в этой точке
function pointAt(line, f) {
  var target = lineLength(line) * f, run = 0;
  for (var i = 1; i < line.length; i++) {
    var dx = line[i][0] - line[i - 1][0], dy = line[i][1] - line[i - 1][1];
    var d = Math.hypot(dx, dy);
    if (run + d >= target) {
      var t = d ? (target - run) / d : 0;
      return [line[i - 1][0] + dx * t, line[i - 1][1] + dy * t, dx, dy];
    }
    run += d;
  }
  var n = line.length - 1;
  return [line[n][0], line[n][1], line[n][0] - line[n - 1][0], line[n][1] - line[n - 1][1]];
}
function ringArea(ring) {
  var a = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}
function largestRing(polys) {
  var best = null, ba = -1;
  polys.forEach(function (poly) {
    var a = ringArea(poly[0]);
    if (a > ba) { ba = a; best = poly; }
  });
  return best || [[[0, 0], [0, 0], [0, 0]]];
}
function mainRingArea(polys) { return ringArea(largestRing(polys)[0]); }
function polyBBox(polys) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  polys.forEach(function (poly) {
    poly[0].forEach(function (c) {
      if (c[0] < b[0]) b[0] = c[0];
      if (c[1] < b[1]) b[1] = c[1];
      if (c[0] > b[2]) b[2] = c[0];
      if (c[1] > b[3]) b[3] = c[1];
    });
  });
  return b;
}

// «полюс недоступности» — точка внутри полигона, максимально удалённая от границ
// (алгоритм polylabel: очередь ячеек, деление на четыре, отсечение по верхней оценке)
function poleOfInaccessibility(poly) {
  var b = polyBBox([poly]);
  var w = b[2] - b[0], h = b[3] - b[1];
  var cell = Math.min(w, h) / 2;
  if (cell <= 0) return [b[0], b[1], 0];
  var SQ2 = Math.SQRT2;
  var queue = [];
  function push(x, y, half) {
    var d = distToPoly(x, y, poly);
    queue.push({ x: x, y: y, h: half, d: d, max: d + half * SQ2 });
  }
  for (var x = b[0]; x < b[2]; x += cell) {
    for (var y = b[1]; y < b[3]; y += cell) push(x + cell / 2, y + cell / 2, cell / 2);
  }
  var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  var best = { x: cx, y: cy, d: distToPoly(cx, cy, poly) };
  var guard = 0;
  while (queue.length && guard++ < 8000) {
    var bi = 0;
    for (var i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    var c = queue.splice(bi, 1)[0];
    if (c.d > best.d) best = c;
    if (c.max - best.d <= Math.max(0.35, best.d * 0.01)) continue;
    var q = c.h / 2;
    push(c.x - q, c.y - q, q); push(c.x + q, c.y - q, q);
    push(c.x - q, c.y + q, q); push(c.x + q, c.y + q, q);
  }
  return [best.x, best.y, best.d];
}
function distToPoly(x, y, poly) {
  var inside = false, min = Infinity;
  for (var r = 0; r < poly.length; r++) {
    var ring = poly[r];
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[j], c = ring[i];
      if ((c[1] > y) !== (a[1] > y) &&
          x < (a[0] - c[0]) * (y - c[1]) / (a[1] - c[1]) + c[0]) inside = !inside;
      min = Math.min(min, segDist(x, y, c, a));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}
function segDist(px, py, a, b) {
  var x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx || dy) {
    var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (px - x) * (px - x) + (py - y) * (py - y);
}
function pointInRegion(x, y, r) {
  if (x < r.bbox[0] || x > r.bbox[2] || y < r.bbox[1] || y > r.bbox[3]) return false;
  for (var p = 0; p < r.polys.length; p++) {
    var poly = r.polys[p];
    if (!inRing(x, y, poly[0])) continue;
    var hole = false;
    for (var h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) hole = true;
    if (!hole) return true;
  }
  return false;
}
function inRing(x, y, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var a = ring[j], c = ring[i];
    if ((c[1] > y) !== (a[1] > y) &&
        x < (a[0] - c[0]) * (y - c[1]) / (a[1] - c[1]) + c[0]) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------- цвета
function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function fillOf(r) {
  if (r.isCountry) return COUNTRY_PALETTE[((r.color || 1) - 1) % COUNTRY_PALETTE.length];
  var base = opts.colorBy === 'type' ? (TCOLOR[r.type] || '#ccc')
                                     : (DCOLOR[r.district] || '#ccc');
  var amt = [0, 0.16, 0.32, 0.08, 0.24][r.idx % 5];
  return shade(base.charAt(0) === '#' ? base : '#cccccc', amt);
}

// ------------------------------------------------------------------ отрисовка
var svg, gRoot, gLand, gRegions, gLakes, gRivers, gBorders, gMarkers, gLabels, gRiverLabels;
var tooltip, stage;

function el(tag, attrs) {
  var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}

// пятиконечная звезда с центром в нуле, размеры — в пикселях экрана
var STAR_D = (function () {
  var s = '', R = 6.4, r = 2.7;
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
    s += (i ? 'L' : 'M') + (rr * Math.cos(a)).toFixed(2) + ' ' + (rr * Math.sin(a)).toFixed(2);
  }
  return s + 'Z';
})();

function build() {
  svg = document.getElementById('map');
  svg.setAttribute('viewBox', '0 0 ' + VW + ' ' + VH);
  gRoot = el('g', { id: 'root' });
  svg.appendChild(gRoot);

  // фон с запасом: при повороте углы экрана заходят далеко за пределы карты
  gRoot.appendChild(el('rect', { x: -VW * 6, y: -VH * 6, width: VW * 13,
                                 height: VH * 13, fill: 'var(--sea)' }));

  gLand = el('g', { class: 'land' });
  gRegions = el('g', { class: 'regions' });
  gLakes = el('g', { class: 'lakes' });
  gRivers = el('g', { class: 'rivers' });
  gBorders = el('g', { class: 'borders' });
  gMarkers = el('g', { class: 'markers' });
  gRiverLabels = el('g', { class: 'river-labels' });
  gLabels = el('g', { class: 'labels' });
  [gLand, gRegions, gLakes, gRivers, gBorders, gMarkers, gRiverLabels, gLabels]
    .forEach(function (g) { gRoot.appendChild(g); });

  geo.land.forEach(function (l) {
    gLand.appendChild(el('path', { d: l.d, class: 'foreign' }));
  });

  areas.forEach(function (r) {
    var p = el('path', { d: r.d, class: r.isCountry ? 'region country' : 'region', fill: fillOf(r),
                         'data-code': r.code, 'shape-rendering': 'geometricPrecision' });
    r.el = p;
    gRegions.appendChild(p);
  });

  geo.lakes.forEach(function (l) {
    gLakes.appendChild(el('path', { d: l.d, class: 'lake' }));
  });

  riverData.forEach(function (r) {
    gRivers.appendChild(el('path', { d: r.d, class: 'river river-o' + r.order }));
    r.labels = [];
    r.lines.forEach(function (line, j) {
      if (r.lens[j] < 12) return;
      var count = Math.max(2, Math.min(60, Math.round(r.lens[j] / 22)));
      for (var q = 0; q < count; q++) {
        var f = (q + 0.5) / count;
        var at = pointAt(line, f);
        // текст рисуется прямым и разворачивается по ходу русла: вдоль самой
        // линии (textPath) на сильном увеличении буквы расползаются по излучине
        var g = el('g', { class: 'river-label-g' });
        var inner = el('g', {});
        var t = el('text', { class: 'river-label o' + r.order, x: 0, y: -2.5 });
        t.textContent = r.name;
        inner.appendChild(t);
        g.appendChild(inner);
        g.style.display = 'none';
        gRiverLabels.appendChild(g);
        r.labels.push({ el: g, inner: inner, at: at, line: line, f: f,
                        len: r.lens[j], shown: false, rot: null });
      }
    });
  });

  regions.forEach(function (r) {
    gBorders.appendChild(el('path', { d: r.d, class: 'region-outline' }));
  });

  markers.forEach(function (m) {
    var g = el('g', { class: m.star ? 'marker marker-star' : 'marker marker-dot',
                      transform: 'translate(' + m.x.toFixed(1) + ' ' + m.y.toFixed(1) + ')' });
    var inner = el('g', {});
    inner.appendChild(m.star ? el('path', { d: STAR_D }) : el('circle', { r: 2.7 }));
    g.appendChild(inner);
    g.style.display = 'none';
    gMarkers.appendChild(g);
    m.el = g; m.inner = inner; m.shown = false;
    if (m.capOf) {
      // подпись столицы справа от звезды; появляется, когда для неё есть место
      var lg = el('g', { class: 'label label-capital',
                         transform: 'translate(' + m.x.toFixed(1) + ' ' + m.y.toFixed(1) + ')' });
      var li = el('g', {});
      var t = el('text', { class: 'lbl-capital', x: CAPITAL_DX, y: CAPITAL_PX * 0.36,
                           'font-size': CAPITAL_PX });
      t.textContent = m.name;
      li.appendChild(t);
      lg.appendChild(li);
      lg.style.display = 'none';
      gLabels.appendChild(lg);
      m.labelEl = lg; m.labelInner = li; m.labelShown = false; m.labelHi = false; m.minK2 = Infinity;
    }
  });

  // подписи: координаты — в системе карты, размер текста — в пикселях экрана,
  // внутренняя группа только масштабируется под зум и разворачивается против
  // поворота карты, чтобы текст всегда стоял прямо
  regions.forEach(function (r) {
    var g = el('g', { class: 'label' });
    g.setAttribute('transform', 'translate(' + r.anchor[0].toFixed(1) + ' ' +
                                 r.anchor[1].toFixed(1) + ')');
    var inner = el('g', {});
    var t1 = el('text', { class: 'lbl-name', x: 0, y: -1.5, 'font-size': NAME_PX });
    t1.textContent = r.short;
    var t2 = el('text', { class: 'lbl-cap', x: 0, y: CAP_PX + 1, 'font-size': CAP_PX });
    t2.textContent = r.capital;
    inner.appendChild(t1);
    inner.appendChild(t2);
    g.appendChild(inner);
    g.style.display = 'none';
    gLabels.appendChild(g);
    r.labelEl = g; r.labelInner = inner; r.nameEl = t1; r.capEl = t2;
    r.labelShown = false; r.labelHi = false; r.minK = Infinity;
  });
  countries.forEach(function (c) {
    var g = el('g', { class: 'label label-country' });
    g.setAttribute('transform', 'translate(' + c.anchor[0].toFixed(1) + ' ' +
                                 c.anchor[1].toFixed(1) + ')');
    var inner = el('g', {});
    var t = el('text', { class: 'lbl-country', x: 0, y: COUNTRY_PX * 0.36,
                         'font-size': COUNTRY_PX });
    t.textContent = c.short.toUpperCase();
    inner.appendChild(t);
    g.appendChild(inner);
    g.style.display = 'none';
    gLabels.appendChild(g);
    c.labelEl = g; c.labelInner = inner;
    c.labelShown = false; c.labelHi = false; c.minK = Infinity;
  });
}

// --------------------------------------------------------------- подписи
// Подписи расставляются один раз (layoutLabels) и после этого не двигаются:
// у каждой запомнен свой масштаб появления minK. При зуме подпись едет вместе
// со своим регионом или руслом, размер на экране остаётся тем же, а пересчёта
// раскладки не происходит — поэтому ничего не прыгает и не перестраивается.
function textWidth(s, size) { return s.length * size * 0.54; }

var NAME_PX = 11.5, CAP_PX = 10;          // размеры подписей на экране, px
var COUNTRY_PX = 13;                      // название страны
var CAPITAL_PX = 10.5;                    // подпись столицы у звезды
var CAPITAL_DX = 10;                      // отступ подписи от центра звезды: дальше её рамки
function riverPx(order) { return order === 1 ? 11.5 : order === 2 ? 10.5 : 9.5; }

// масштабы, на которых проверяется место для подписей: от самого мелкого
// (весь мир) до самого крупного; заполняется после prepare()
var LEVELS = [];
function buildLevels() {
  LEVELS = [];
  for (var L = MIN_K; L <= 95; L *= 1.28) LEVELS.push(L);
}

// простая сетка для проверки пересечений: карта режется на клетки по 50 единиц
function Grid() { this.cells = {}; }
Grid.prototype.key = function (x, y) { return Math.floor(x / 50) + ':' + Math.floor(y / 50); };
Grid.prototype.add = function (b) {
  for (var x = b[0]; x <= b[2] + 50; x += 50) {
    for (var y = b[1]; y <= b[3] + 50; y += 50) {
      var k = this.key(x, y);
      (this.cells[k] || (this.cells[k] = [])).push(b);
    }
  }
};
Grid.prototype.hits = function (b) {
  for (var x = b[0]; x <= b[2] + 50; x += 50) {
    for (var y = b[1]; y <= b[3] + 50; y += 50) {
      var list = this.cells[this.key(x, y)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
      }
    }
  }
  return false;
};

// направление русла вокруг точки подписи, усреднённое по отрезку длиной win
function riverAngle(lb, win) {
  var total = lineLength(lb.line);
  var d = Math.min(0.5, (win / 2) / (total || 1));
  var a = pointAt(lb.line, Math.max(0, lb.f - d));
  var b = pointAt(lb.line, Math.min(1, lb.f + d));
  var dx = b[0] - a[0], dy = b[1] - a[1];
  if (!dx && !dy) { dx = lb.at[2]; dy = lb.at[3]; }
  var deg = Math.atan2(dy, dx) * 180 / Math.PI;
  if (deg > 90) deg -= 180;              // подпись не должна читаться вверх ногами
  if (deg < -90) deg += 180;
  return deg;
}

// угол в диапазон (-180, 180]
function normDeg(a) {
  a = a % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}
// подпись реки в системе карты: на экране она должна стоять под углом
// русла + поворот карты и никогда не читаться вверх ногами
function riverRot(lb) {
  var a = normDeg(lb.angle + view.r);
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a - view.r;
}
function placeRiverLabel(lb) {
  lb.rot = view.r;
  lb.el.setAttribute('transform', 'translate(' + lb.at[0].toFixed(1) + ' ' +
    lb.at[1].toFixed(1) + ') rotate(' + riverRot(lb).toFixed(1) + ')');
}

function layoutLabels() {
  var scale = metrics().s;                   // единицы карты -> px экрана
  var items = [];
  layoutR = view.r;                          // угол, под который сделана раскладка
  // раскладка считается в осях экрана: при повороте карты точки подписей
  // поворачиваются, а сами подписи остаются горизонтальными
  var th = view.r * RAD, cs = Math.cos(th), sn = Math.sin(th);
  function rx(x, y) { return x * cs - y * sn; }
  function ry(x, y) { return x * sn + y * cs; }

  // звёзды столиц видны всегда: подписи не должны на них налезать
  markers.forEach(function (m) {
    if (m.star) items.push({ fixed: true, done: true, x: rx(m.x, m.y), y: ry(m.x, m.y), w: 13, h: 13 });
  });

  // страны — первыми, от крупных к мелким
  countries.slice().sort(function (a, b) { return b.mainArea - a.mainArea; }).forEach(function (c) {
    c.minK = Infinity;
    items.push({ region: c, x: rx(c.anchor[0], c.anchor[1]), y: ry(c.anchor[0], c.anchor[1]),
                 room: c.anchor[2] * 1.6, w: textWidth(c.short, COUNTRY_PX) * 1.25,
                 h: COUNTRY_PX + 2 });
  });

  // субъекты и регионы: сначала крупные, подпись всегда считается как
  // «название + столица», чтобы включение и выключение столиц не меняло раскладку
  regions.slice().sort(function (a, b) { return b.mainArea - a.mainArea; })
    .forEach(function (r) {
      r.minK = Infinity;
      items.push({ region: r, x: rx(r.anchor[0], r.anchor[1]), y: ry(r.anchor[0], r.anchor[1]),
                   room: r.anchor[2],
                   w: Math.max(textWidth(r.short, NAME_PX), textWidth(r.capital, CAP_PX)),
                   h: NAME_PX + CAP_PX + 3 });
    });

  // подписи столиц стоят справа от звезды: центр рамки сдвинут на dx пикселей
  markers.filter(function (m) { return m.capOf; })
    .sort(function (a, b) { return b.capOf.mainArea - a.capOf.mainArea; })
    .forEach(function (m) {
      m.minK2 = Infinity;
      var w = textWidth(m.name, CAPITAL_PX);
      items.push({ cap: m, x: rx(m.x, m.y), y: ry(m.x, m.y), dx: CAPITAL_DX + w / 2, w: w,
                   h: CAPITAL_PX + 2 });
    });

  // реки: сначала самые крупные; у каждой реки свои точки-кандидаты вдоль русла
  var rivers = riverData.slice().sort(function (a, b) {
    return a.order - b.order || (b.length || 0) - (a.length || 0);
  });
  rivers.forEach(function (rv) {
    rv.placed = [];
    var px = riverPx(rv.order);
    rv.labels.forEach(function (lb) {
      lb.minK = Infinity;
      lb.size = px;
      lb.el.firstChild.firstChild.setAttribute('font-size', px);
      var w = textWidth(rv.name, px), h = px;
      lb.angle = riverAngle(lb, 20);
      var rad = (lb.angle + view.r) * RAD;
      var ux = Math.abs(Math.cos(rad)), uy = Math.abs(Math.sin(rad));
      items.push({ river: rv, label: lb, x: rx(lb.at[0], lb.at[1]), y: ry(lb.at[0], lb.at[1]),
                   w: w * ux + h * uy, h: w * uy + h * ux });
    });
  });

  var rest = items;
  for (var li = 0; li < LEVELS.length; li++) {
    var L = LEVELS[li];
    var u = 1 / (L * scale);                 // px -> единицы карты на этом масштабе
    var grid = new Grid();
    var i, it;
    // уже расставленные подписи на этом масштабе занимают меньше места
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.done) grid.add(box(it, u));
    }
    var next = [];
    for (i = 0; i < rest.length; i++) {
      it = rest[i];
      if (it.done) continue;
      var b = box(it, u);
      if (it.cap) {
        // подпись столицы — точечная, ей не нужно помещаться в контур
      } else if (it.region) {
        // подпись должна помещаться внутри своего субъекта
        if (b[2] - b[0] > it.room * 7 || b[3] - b[1] > it.room * 4.5) { next.push(it); continue; }
      } else {
        // две подписи одной реки не должны стоять ближе ~360 px друг к другу
        var sep = 360 * u, tooClose = false;
        for (var q = 0; q < it.river.placed.length; q++) {
          var p = it.river.placed[q];
          if (Math.hypot(p[0] - it.x, p[1] - it.y) < sep) { tooClose = true; break; }
        }
        if (tooClose) { next.push(it); continue; }
      }
      if (grid.hits(b)) { next.push(it); continue; }
      grid.add(b);
      it.done = true;
      if (it.cap) it.cap.minK2 = L;
      else if (it.region) it.region.minK = L;
      else { it.label.minK = L; it.river.placed.push([it.x, it.y]); }
    }
    rest = next;
  }

  // теперь известно, на каком масштабе появится каждая подпись реки, — значит,
  // известна и длина участка, который она закрывает: по нему и берём направление
  riverData.forEach(function (rv) {
    rv.labels.forEach(function (lb) {
      if (lb.minK === Infinity) return;
      var span = textWidth(rv.name, lb.size) / (lb.minK * scale);
      lb.angle = riverAngle(lb, Math.max(8, Math.min(220, span)));
      placeRiverLabel(lb);
    });
  });

  // точка центра региона появляется, когда регион на экране шире ~16 px
  markers.forEach(function (m) {
    if (m.star) return;
    var big = 0;
    m.owners.forEach(function (o) { big = Math.max(big, o.mainArea); });
    m.minK = 16 / (Math.sqrt(big) * scale);
  });

  function box(it, u) {
    var hw = it.w * u / 2 + 1.5 * u, hh = it.h * u / 2 + 1.5 * u, cx = it.x + (it.dx || 0) * u;
    return [cx - hw, it.y - hh, cx + hw, it.y + hh];
  }
  updateLabels();
}

// каждый кадр меняется только масштаб текста и видимость — координаты фиксированы
function updateLabels() {
  var u = 1 / (view.k * metrics().s);        // px -> единицы карты
  var tr = (view.r ? 'rotate(' + (-view.r).toFixed(2) + ') ' : '') +
           'scale(' + u.toFixed(4) + ')';
  function label(r, hi) {
    var show = opts.labels && (opts.allLabels || hi || view.k >= r.minK);
    if (show !== r.labelShown) {
      r.labelEl.style.display = show ? '' : 'none';
      r.labelShown = show;
    }
    if (show) {
      r.labelInner.setAttribute('transform', tr);
      if (hi !== r.labelHi) {
        r.labelEl.classList.toggle('label-hi', hi);
        r.labelHi = hi;
      }
    }
  }
  regions.forEach(function (r) {
    if (r.labelEl) label(r, r === selected || r === hovered);
  });
  countries.forEach(function (c) {
    if (c.labelEl) label(c, c === selected || c === hovered);
  });

  markers.forEach(function (m) {
    var hi = m.owners.indexOf(selected) >= 0 || m.owners.indexOf(hovered) >= 0;
    var show = opts.capitals && (m.star || hi || view.k >= m.minK);
    if (show !== m.shown) {
      m.el.style.display = show ? '' : 'none';
      m.shown = show;
    }
    if (show) m.inner.setAttribute('transform', tr);
    if (m.labelEl) {
      var showL = opts.labels && opts.capitals && (opts.allLabels || hi || view.k >= m.minK2);
      if (showL !== m.labelShown) {
        m.labelEl.style.display = showL ? '' : 'none';
        m.labelShown = showL;
      }
      if (showL) {
        m.labelInner.setAttribute('transform', tr);
        if (hi !== m.labelHi) { m.labelEl.classList.toggle('label-hi', hi); m.labelHi = hi; }
      }
    }
  });

  riverData.forEach(function (rv) {
    rv.labels.forEach(function (lb) {
      var show = opts.rivers && view.k >= lb.minK;
      if (show !== lb.shown) {
        lb.el.style.display = show ? '' : 'none';
        lb.shown = show;
      }
      if (show) {
        if (lb.rot !== view.r) placeRiverLabel(lb);
        lb.inner.setAttribute('transform', 'scale(' + u.toFixed(4) + ')');
      }
    });
  });
}

// столицы можно выключить: подпись остаётся на месте, исчезает только вторая строка
function applyCapitalLines() {
  regions.forEach(function (r) {
    if (!r.capEl) return;
    r.capEl.style.display = opts.capitals ? '' : 'none';
    r.nameEl.setAttribute('y', opts.capitals ? -1.5 : NAME_PX * 0.36);
  });
}

// ----------------------------------------------------- зум, панорама и поворот
// Экранная точка s связана с точкой карты p так: s = (x, y) + k · R(r) · p,
// где R — поворот на r градусов. Все преобразования ниже держат это равенство.
function applyView() {
  gRoot.setAttribute('transform',
    'translate(' + view.x.toFixed(2) + ' ' + view.y.toFixed(2) + ')' +
    (view.r ? ' rotate(' + view.r.toFixed(3) + ')' : '') +
    ' scale(' + view.k.toFixed(4) + ')');
  var needle = document.getElementById('compass-needle');
  if (needle) needle.style.transform = 'rotate(' + view.r.toFixed(2) + 'deg)';
  scheduleLabels();
  updateScaleBar();
}
var labelTimer = null;
function scheduleLabels() {
  if (labelTimer) cancelAnimationFrame(labelTimer);
  labelTimer = requestAnimationFrame(function () { labelTimer = null; updateLabels(); });
}
// после поворота раскладку подписей пересчитываем, но только когда карта
// успокоилась: во время самого жеста подписи просто едут вместе с ней
var relayoutTimer = null, layoutR = 0;
function scheduleRelayout() {
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(function () {
    if (Math.abs(normDeg(view.r - layoutR)) > 0.5) layoutLabels();
  }, 260);
}
// охват карты (Россия и страны Европы и Азии) на экране при текущих k и r, без сдвига
function rotatedBox(b, k, r) {
  var th = r * RAD, cs = Math.cos(th) * k, sn = Math.sin(th) * k;
  var xs = [], ys = [];
  [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].forEach(function (c) {
    xs.push(c[0] * cs - c[1] * sn);
    ys.push(c[0] * sn + c[1] * cs);
  });
  return [Math.min.apply(null, xs), Math.min.apply(null, ys),
          Math.max.apply(null, xs), Math.max.apply(null, ys)];
}
function clampView() {
  view.k = Math.min(MAX_K, Math.max(MIN_K, view.k));
  // карта шире окна — она должна закрывать его (с запасом m по краям); карта
  // уже окна (весь мир на мелком масштабе, поворот на 90°) — она видна целиком
  // и свободно двигается внутри окна
  var b = rotatedBox(extent, view.k, view.r);
  view.x = clampAxis(view.x, b[0], b[2], VW);
  view.y = clampAxis(view.y, b[1], b[3], VH);
}
function clampAxis(v, lo, hi, size) {
  var m = 200;
  if (hi - lo <= size) return clampRange(v, -lo, size - hi);
  return clampRange(v, m - lo, size - hi - m);
}
function clampRange(v, a, b) {
  return Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
}
function zoomAt(px, py, factor) {
  var k0 = view.k;
  view.k *= factor;
  clampView();
  var f = view.k / k0;
  view.x = px - (px - view.x) * f;
  view.y = py - (py - view.y) * f;
  clampView();
  applyView();
}
// поворот вокруг экранной точки (px, py) на deg градусов
function rotateAt(px, py, deg) {
  if (!deg) return;
  var th = deg * RAD, cs = Math.cos(th), sn = Math.sin(th);
  var dx = view.x - px, dy = view.y - py;
  view.x = px + dx * cs - dy * sn;
  view.y = py + dx * sn + dy * cs;
  view.r = normDeg(view.r + deg);
  clampView();
  applyView();
  scheduleRelayout();
}
// плавный поворот на deg градусов вокруг центра экрана
var spin = null;
function animateRotate(deg, ms) {
  // повторное нажатие во время поворота добавляет к нему ещё не пройденную
  // часть: два быстрых нажатия «на 15°» дают ровно 30°
  if (spin) { cancelAnimationFrame(spin.id); deg += spin.left; spin = null; }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !deg) { rotateAt(VW / 2, VH / 2, deg); return; }
  var t0 = performance.now(), done = 0;
  ms = ms || 260;
  spin = { id: 0, left: deg };
  (function step(now) {
    var t = Math.min(1, (now - t0) / ms);
    var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // плавный старт и финиш
    rotateAt(VW / 2, VH / 2, deg * e - done);
    done = deg * e;
    if (t < 1) { spin.left = deg - done; spin.id = requestAnimationFrame(step); }
    else spin = null;
  })(t0);
}
// SVG вписан в контейнер по правилу meet: масштаб берётся по меньшей стороне,
// а остаток добивается полями сверху-снизу или слева-справа. Без учёта этих
// полей щелчок попадал мимо — со сдвигом вправо и вниз.
function metrics() {
  var rect = svg.getBoundingClientRect();
  var s = Math.min((rect.width || VW) / VW, (rect.height || VH) / VH);
  return { rect: rect, s: s,
           ox: ((rect.width || VW) - VW * s) / 2,
           oy: ((rect.height || VH) - VH * s) / 2 };
}
function clientToSvg(cx, cy, m) {
  m = m || metrics();
  return [(cx - m.rect.left - m.ox) / m.s, (cy - m.rect.top - m.oy) / m.s];
}
function svgPoint(evt) { return clientToSvg(evt.clientX, evt.clientY); }
// экранная точка (в единицах SVG) -> точка карты: обратное к s = t + k·R·p
function toMap(sx, sy) {
  var th = -view.r * RAD, cs = Math.cos(th), sn = Math.sin(th);
  var dx = (sx - view.x) / view.k, dy = (sy - view.y) / view.k;
  return [dx * cs - dy * sn, dx * sn + dy * cs];
}
function mapPoint(evt) {
  var p = svgPoint(evt);
  return toMap(p[0], p[1]);
}
function zoomTo(bbox, pad) {
  pad = pad || 1.35;
  var b = rotatedBox(bbox, 1, view.r);
  var w = b[2] - b[0], h = b[3] - b[1];
  var k = Math.min(VW / (w * pad), VH / (h * pad));
  view.k = Math.min(60, Math.max(MIN_K, k));
  var cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
  var th = view.r * RAD, cs = Math.cos(th), sn = Math.sin(th);
  view.x = VW / 2 - view.k * (cx * cs - cy * sn);
  view.y = VH / 2 - view.k * (cx * sn + cy * cs);
  clampView();
  applyView();
}
function resetView() {
  if (spin) { cancelAnimationFrame(spin.id); spin = null; }
  view = { k: 1, x: 0, y: 0, r: 0 };
  applyView();
  scheduleRelayout();
}

// --------------------------------------------------------------- интерфейс
function fmt(n) { return n.toLocaleString('ru-RU'); }

function select(code, zoom) {
  selected = byCode[code] || null;
  areas.forEach(function (r) { r.el.classList.toggle('sel', r === selected); });
  document.querySelectorAll('.reg-item').forEach(function (n) {
    n.setAttribute('aria-current', n.dataset.code === code ? 'true' : 'false');
  });
  renderCard();
  announce(!selected ? 'Выбор снят' : selected.name + ', столица ' + selected.capital);
  if (selected && zoom) zoomTo(selected.bbox, selected.mainArea < 400 ? 4 : 1.5);
  else scheduleLabels();
  // прокручиваем список к выбранному только когда панель на экране: у скрытой
  // панели прокрутка цепляет соседние контейнеры и дёргает карту под пальцем
  if (selected && !document.body.classList.contains('panel-hidden')) {
    var node = document.querySelector('.reg-item[data-code="' + code + '"]');
    if (node) node.scrollIntoView({ block: 'nearest' });
  }
}

// короткое сообщение для скринридера: что сейчас выбрано на карте
function announce(text) {
  var box = document.getElementById('map-status');
  if (box) box.textContent = text;
}

function renderCard() {
  var box = document.getElementById('card');
  if (!selected) {
    box.innerHTML = '<p class="hint">Выберите регион или страну на карте или в списке — ' +
      'покажу название, столицу, площадь и население.</p>';
    return;
  }
  var r = selected, html;
  var title = '<h3 class="card-title" tabindex="-1">' + r.name + '</h3>';
  function people(n, note) {
    return '<dt>Население</dt><dd>' + fmt(n) + ' чел.' +
           (note ? '<span class="card-src">' + note + '</span>' : '') + '</dd>' +
           '<dt>Плотность</dt><dd>' + (n / r.area).toFixed(n / r.area < 10 ? 2 : 1) +
           ' чел./км²</dd>';
  }
  if (r.isCountry) {
    html = title +
      '<p class="card-type">' + r.type + ' · ' + r.part + '</p>' +
      '<dl>' +
        '<dt>Столица</dt><dd><b>' + r.capital + '</b></dd>' +
        '<dt>Площадь</dt><dd>' + fmt(r.area) + ' км²</dd>' +
        people(r.pop, r.popNote) +
      '</dl>';
    if (r.note) html += '<p class="card-note">' + r.note + '</p>';
  } else {
    html = title +
      '<p class="card-type">' + r.type + ' · ' + DNAME[r.district] + ' федеральный округ</p>' +
      '<dl>' +
        '<dt>Столица</dt><dd><b>' + r.capital + '</b></dd>' +
        '<dt>Код</dt><dd>' + r.code + '</dd>' +
        '<dt>Площадь</dt><dd>' + fmt(r.area) + ' км²</dd>' +
        people(r.pop) +
      '</dl>';
  }
  var rr = riversOf(r);
  if (rr.length) html += '<p class="card-rivers"><span>Крупные реки:</span> ' + rr.join(', ') + '</p>';
  box.innerHTML = html;
}

var riverCache = {};
function riversOf(r) {
  if (riverCache[r.code]) return riverCache[r.code];
  var found = [];
  riverData.forEach(function (rv) {
    if (rv.order > 2 && found.length > 5) return;
    var hit = rv.lines.some(function (line) {
      for (var i = 0; i < line.length; i += 2) {
        if (pointInRegion(line[i][0], line[i][1], r)) return true;
      }
      return false;
    });
    if (hit) found.push(rv.name);
  });
  riverCache[r.code] = found;
  return found;
}

// Какой субъект под пальцем или курсором. Спрашиваем у самого браузера: он
// проверяет попадание по нарисованному контуру, поэтому подсвечивается ровно то,
// во что ткнули. Реки, озёра, границы и подписи нажатия не перехватывают.
function regionAt(evt) {
  var el = document.elementFromPoint(evt.clientX, evt.clientY);
  var path = el && el.closest ? el.closest('.region') : null;
  if (path) return byCode[path.getAttribute('data-code')] || null;
  if (el && el.id !== 'map' && !(el.closest && el.closest('#stage'))) return null;
  // запасной путь, если карта чем-то перекрыта: обычная проверка по полигонам
  var p = mapPoint(evt);
  for (var i = 0; i < areas.length; i++) {
    if (pointInRegion(p[0], p[1], areas[i])) return areas[i];
  }
  return null;
}

function buildSidebar() {
  var wrap = document.getElementById('region-list');
  var html = '';
  DISTRICTS.forEach(function (d) {
    var list = regions.filter(function (r) { return r.district === d[0]; });
    if (!list.length) return;
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
    html += '<section class="dist"><h3><i style="background:' + d[2] + '" aria-hidden="true"></i>' +
            d[1] + ' ФО<span class="count">' + list.length +
            '<span class="sr-only"> субъектов</span></span></h3><ul>';
    list.forEach(function (r) {
      html += '<li><button type="button" class="reg-item" data-code="' + r.code + '"' +
              ' aria-current="false">' +
              '<span class="ri-name">' + r.short + '</span>' +
              '<span class="ri-cap"><span class="sr-only">столица </span>' + r.capital +
              '</span></button></li>';
    });
    html += '</ul></section>';
  });
  ['Европа', 'Азия'].forEach(function (part) {
    var list = countries.filter(function (c) { return c.part === part; });
    if (!list.length) return;
    list.sort(function (a, b) { return a.short.localeCompare(b.short, 'ru'); });
    html += '<section class="dist dist-foreign"><h3><i class="sw-foreign" aria-hidden="true"></i>' +
            'Страны: ' + part + '<span class="count">' + list.length +
            '<span class="sr-only"> стран</span></span></h3><ul>';
    list.forEach(function (r) {
      html += '<li><button type="button" class="reg-item" data-code="' + r.code + '"' +
              ' aria-current="false">' +
              '<span class="ri-name">' + r.short + '</span>' +
              '<span class="ri-cap"><span class="sr-only">столица </span>' + r.capital +
              '</span></button></li>';
    });
    html += '</ul></section>';
  });
  wrap.innerHTML = html;
  wrap.addEventListener('click', function (e) {
    var b = e.target.closest('.reg-item');
    if (b) select(b.dataset.code, true);
  });
}

function buildLegend() {
  var wrap = document.getElementById('legend');
  function paint() {
    var html = '';
    if (opts.colorBy === 'district') {
      DISTRICTS.forEach(function (d) {
        html += '<li><i style="background:' + d[2] + '" aria-hidden="true"></i>' +
                d[1] + '<span class="sr-only"> федеральный округ</span></li>';
      });
    } else {
      TYPES.forEach(function (t) {
        html += '<li><i style="background:' + t[1] + '" aria-hidden="true"></i>' + t[0] + '</li>';
      });
    }
    if (countryMeta.length) html += '<li><i class="sw-foreign" aria-hidden="true"></i>Страны Европы и Азии</li>';
    html += '<li><svg class="lg-mark" viewBox="-8 -8 16 16" aria-hidden="true">' +
            '<path class="lg-star" d="' + STAR_D + '"/></svg>Столица государства</li>' +
            '<li><svg class="lg-mark" viewBox="-8 -8 16 16" aria-hidden="true">' +
            '<circle class="lg-dot" r="2.9"/></svg>Центр субъекта России</li>';
    html += '<li><i class="lg-riv" aria-hidden="true"></i>Крупные реки</li>';
    wrap.innerHTML = html;
  }
  paint();
  return paint;
}

function buildSearch() {
  var input = document.getElementById('search');
  var drop = document.getElementById('search-results');
  var status = document.getElementById('search-status');
  var items = [], hits = [], cursor = -1;

  regions.forEach(function (r) {
    items.push({ t: r.short, s: 'субъект, столица ' + r.capital, code: r.code });
    items.push({ t: r.capital, s: 'столица, ' + r.short, code: r.code });
  });
  countries.forEach(function (c) {
    items.push({ t: c.short, s: c.type.toLowerCase() + ', столица ' + c.capital, code: c.code });
    if (c.name !== c.short) items.push({ t: c.name, s: c.type.toLowerCase(), code: c.code });
    items.push({ t: c.capital, s: 'столица, ' + c.short, code: c.code });
  });
  riverData.forEach(function (rv) {
    items.push({ t: rv.name, s: 'река' + (rv.length ? ', ' + fmt(rv.length) + ' км' : ''),
                 river: rv });
  });

  function close() {
    drop.classList.remove('open');
    drop.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    hits = []; cursor = -1;
  }

  function highlight(i) {
    var nodes = drop.querySelectorAll('li');
    if (!nodes.length) return;
    cursor = (i + nodes.length) % nodes.length;
    nodes.forEach(function (n, j) { n.setAttribute('aria-selected', j === cursor ? 'true' : 'false'); });
    input.setAttribute('aria-activedescendant', nodes[cursor].id);
    nodes[cursor].scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    var h = hits[i];
    if (!h) return;
    if (h.code) select(h.code, true);
    else { focusRiver(h.river); announce('Река ' + h.t); }
    input.value = h.t;
    close();
  }

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { close(); status.textContent = ''; return; }
    hits = items.filter(function (i) {
      return i.t.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      return a.t.toLowerCase().indexOf(q) - b.t.toLowerCase().indexOf(q) || a.t.length - b.t.length;
    }).slice(0, 12);
    if (!hits.length) {
      drop.innerHTML = '<li class="sr-empty" role="presentation">Ничего не найдено</li>';
      drop.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
      status.textContent = 'Ничего не найдено';
      return;
    }
    drop.innerHTML = hits.map(function (h, i) {
      return '<li id="sr-opt-' + i + '" role="option" aria-selected="false">' +
             '<b>' + h.t + '</b><span class="sr-desc">' + h.s + '</span></li>';
    }).join('');
    drop.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    cursor = -1;
    status.textContent = 'Найдено вариантов: ' + hits.length +
                         '. Перебирайте стрелками, Enter — открыть.';
    drop.querySelectorAll('li').forEach(function (n, i) {
      n.addEventListener('click', function () { choose(i); });
    });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); input.blur(); return; }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(cursor + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(cursor - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(hits.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor < 0 ? 0 : cursor); }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) close();
  });
}

function focusRiver(rv) {
  var line = rv.lines[rv.main];
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  rv.lines.forEach(function (l) {
    l.forEach(function (c) {
      b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    });
  });
  select(null, false);
  zoomTo(b, 1.25);
  flashRiver(rv);
}
function flashRiver(rv) {
  var p = el('path', { d: rv.d, class: 'river-flash' });
  gRivers.appendChild(p);
  setTimeout(function () { p.remove(); }, 2600);
}

function updateScaleBar() {
  // длина 1 внутренней единицы в километрах вдоль параллели на широте центра
  // экрана: в проекции Миллера масштаб зависит от широты (1 радиан долготы —
  // это 6371 · cos φ км)
  var px = 120;                                   // целевая длина плашки, px
  var units = px / metrics().s / view.k;
  var c = toMap(VW / 2, VH / 2);
  var lat = unprojectLat((c[1] - fit.dy) / fit.k);
  var kmPerUnit = 6371 * Math.max(0.05, Math.cos(lat * RAD)) / fit.k;
  var km = units * kmPerUnit;
  var nice = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
  var pick = nice[0];
  nice.forEach(function (n) { if (n <= km) pick = n; });
  var w = px * pick / km;
  var bar = document.getElementById('scalebar');
  bar.style.width = w.toFixed(1) + 'px';
  bar.querySelector('span').textContent = fmt(pick) + ' км';
  bar.setAttribute('aria-label', 'отрезок на карте — ' + fmt(pick) + ' км');
}

function bindMap() {
  stage = document.getElementById('stage');
  tooltip = document.getElementById('tip');
  var drag = null;

  // правая кнопка мыши или Shift + левая — поворот вокруг центра экрана:
  // карта поворачивается вслед за курсором, как ручка вокруг оси
  function cursorAngle(e) {
    var p = svgPoint(e);
    return Math.atan2(p[1] - VH / 2, p[0] - VW / 2) / RAD;
  }
  var rotateEnded = 0;
  svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // в Windows меню появляется при отпускании кнопки — и там, где её отпустили,
  // поэтому после поворота правой кнопкой гасим его по всей странице
  window.addEventListener('contextmenu', function (e) {
    if ((drag && drag.rotate) || performance.now() - rotateEnded < 400) e.preventDefault();
  });
  svg.addEventListener('mousedown', function (e) {
    if (spin) { cancelAnimationFrame(spin.id); spin = null; }
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0,
             s: 1 / metrics().s, rotate: e.button === 2 || e.shiftKey,
             a: cursorAngle(e) };
    svg.classList.add(drag.rotate ? 'rotating' : 'grabbing');
  });
  window.addEventListener('mousemove', function (e) {
    if (drag) {
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (drag.rotate) {
        var a = cursorAngle(e);
        rotateAt(VW / 2, VH / 2, normDeg(a - drag.a));
        drag.a = a;
        return;
      }
      var s = drag.s;
      view.x = drag.vx + (e.clientX - drag.x) * s;
      view.y = drag.vy + (e.clientY - drag.y) * s;
      clampView(); applyView();
      return;
    }
    if (!e.target.closest || !e.target.closest('#stage')) { hideTip(); return; }
    var r = regionAt(e);
    if (r !== hovered) {
      if (hovered) hovered.el.classList.remove('hover');
      hovered = r;
      if (hovered) hovered.el.classList.add('hover');
      scheduleLabels();
    }
    if (r) showTip(e, r); else hideTip();
  });
  window.addEventListener('mouseup', function (e) {
    if (drag) {
      svg.classList.remove('grabbing', 'rotating');
      if (drag.rotate) rotateEnded = performance.now();
      if (drag.moved < 5 && !drag.rotate) {
        var r = regionAt(e);
        if (r) select(r.code, false); else select(null, false);
      }
      drag = null;
    }
  });
  svg.addEventListener('dblclick', function (e) {
    var p = svgPoint(e);
    zoomAt(p[0], p[1], 1.9);
  });
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = svgPoint(e);
    zoomAt(p[0], p[1], Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016)));
  }, { passive: false });

  // тач: один палец двигает карту, два — двигают, меняют масштаб и поворачивают
  // одновременно. Точка карты между пальцами остаётся под ними, поэтому жест не
  // «уплывает». Поворот включается, только когда пальцы повернулись больше чем
  // на 12°: иначе обычное сведение пальцев слегка крутило бы карту
  var touch = null, pending = null, frame = null, ROT_START = 12;

  function apply() {
    frame = null;
    if (!pending) return;
    var turned = pending.r !== view.r;
    view.k = pending.k; view.x = pending.x; view.y = pending.y; view.r = pending.r;
    pending = null;
    clampView();
    applyView();
    if (turned) scheduleRelayout();
  }
  function queue(k, r, x, y) {
    pending = { k: k, r: r, x: x, y: y };
    if (!frame) frame = requestAnimationFrame(apply);   // не чаще кадра экрана
  }
  function gestureOn() {
    svg.classList.add('zooming');
    clearTimeout(touch && touch.offTimer);
  }
  function gestureOff() {
    clearTimeout(gestureOff.t);
    gestureOff.t = setTimeout(function () { svg.classList.remove('zooming'); }, 120);
  }

  function touchInfo(e) {
    var m = metrics();
    if (e.touches.length >= 2) {
      var a = clientToSvg(e.touches[0].clientX, e.touches[0].clientY, m);
      var b = clientToSvg(e.touches[1].clientX, e.touches[1].clientY, m);
      return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
               d: Math.hypot(a[0] - b[0], a[1] - b[1]),
               a: Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD };
    }
    var p = clientToSvg(e.touches[0].clientX, e.touches[0].clientY, m);
    return { c: p, d: 0, a: 0 };
  }

  function startTouch(e) {
    var t = touchInfo(e);
    // точка карты под центром жеста — её и держим на месте
    var mp = toMap(t.c[0], t.c[1]);
    touch = { d0: t.d, c0: t.c, k0: view.k, r0: view.r, a0: t.a,
              rotating: touch ? touch.rotating : false, aOff: 0,
              mx: mp[0], my: mp[1], moved: touch ? touch.moved : 0,
              // был ли в жесте второй палец: тогда это щипок, а не нажатие
              multi: (touch && touch.multi) || e.touches.length > 1 };
  }

  svg.addEventListener('touchstart', function (e) {
    if (spin) { cancelAnimationFrame(spin.id); spin = null; }
    startTouch(e);
    gestureOn();
  }, { passive: true });

  svg.addEventListener('touchmove', function (e) {
    if (!touch) return;
    e.preventDefault();
    var t = touchInfo(e);
    var k = view.k, r = view.r;
    if (t.d && touch.d0) {
      k = Math.min(MAX_K, Math.max(MIN_K, touch.k0 * (t.d / touch.d0)));
      var da = normDeg(t.a - touch.a0);
      if (!touch.rotating && Math.abs(da) > ROT_START) {
        touch.rotating = true;
        touch.aOff = da;                     // поворот начинается с нуля, без рывка
      }
      if (touch.rotating) r = normDeg(touch.r0 + da - touch.aOff);
    }
    touch.moved += Math.abs(t.c[0] - touch.c0[0]) + Math.abs(t.c[1] - touch.c0[1]);
    var th = r * RAD, cs = Math.cos(th), sn = Math.sin(th);
    queue(k, r, t.c[0] - k * (touch.mx * cs - touch.my * sn),
                t.c[1] - k * (touch.mx * sn + touch.my * cs));
  }, { passive: false });

  svg.addEventListener('touchend', function (e) {
    if (frame) { cancelAnimationFrame(frame); apply(); }
    if (e.touches.length) { startTouch(e); return; }   // палец убрали — жест продолжается
    if (touch && !touch.multi && touch.moved < 8 && e.changedTouches.length === 1) {
      var r = regionAt(e.changedTouches[0]);
      select(r ? r.code : null, false);
    }
    touch = null;
    gestureOff();
  }, { passive: true });

  svg.addEventListener('touchcancel', function () { touch = null; gestureOff(); }, { passive: true });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    // раскладка зависит от размера окна, поэтому пересчитываем её при ресайзе,
    // но не чаще одного раза в 200 мс
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutLabels, 200);
  });
  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' ||
        t.isContentEditable) return;
    // сочетания с Ctrl, Cmd и Alt — команды браузера, а не карты
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === '+' || k === '=') zoomAt(VW / 2, VH / 2, 1.3);
    if (k === '-') zoomAt(VW / 2, VH / 2, 1 / 1.3);
    if (k === '0') resetView();
    // Q, E и N — по букве, в латинской и в русской раскладке (Й, У, Т)
    if (k === 'q' || k === 'й') animateRotate(-15);
    if (k === 'e' || k === 'у') animateRotate(15);
    if (k === 'n' || k === 'т') animateRotate(-view.r);
    if (k === 'escape') select(null, false);
  });
}

function showTip(e, r) {
  tooltip.innerHTML = '<b>' + r.short + '</b><span>' + r.type.toLowerCase() +
                      (r.isCountry ? ', ' + r.part : '') + '</span><em>столица — ' +
                      r.capital + '</em>';
  tooltip.classList.add('open');
  var box = stage.getBoundingClientRect();
  var x = e.clientX - box.left + 16, y = e.clientY - box.top + 16;
  var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  if (x + tw > box.width) x = e.clientX - box.left - tw - 14;
  if (y + th > box.height) y = e.clientY - box.top - th - 14;
  tooltip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}
function hideTip() { tooltip.classList.remove('open'); }

function bindControls() {
  var repaintLegend = buildLegend();
  function toggle(id, key, after) {
    var n = document.getElementById(id);
    n.checked = opts[key];
    n.addEventListener('change', function () {
      opts[key] = n.checked;
      if (after) after();
      scheduleLabels();
    });
  }
  toggle('t-rivers', 'rivers', function () {
    gRivers.style.display = opts.rivers ? '' : 'none';
    gRiverLabels.style.display = opts.rivers ? '' : 'none';
  });
  toggle('t-labels', 'labels');
  toggle('t-capitals', 'capitals', applyCapitalLines);   // и значки столиц тоже
  toggle('t-all', 'allLabels');
  toggle('t-lakes', 'lakes', function () {
    gLakes.style.display = opts.lakes ? '' : 'none';
  });
  document.getElementById('color-by').addEventListener('change', function (e) {
    opts.colorBy = e.target.value;
    regions.forEach(function (r) { r.el.setAttribute('fill', fillOf(r)); });
    repaintLegend();
  });
  document.getElementById('zoom-in').addEventListener('click', function () { zoomAt(VW / 2, VH / 2, 1.35); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomAt(VW / 2, VH / 2, 1 / 1.35); });
  document.getElementById('zoom-reset').addEventListener('click', resetView);
  document.getElementById('rotate-left').addEventListener('click', function () { animateRotate(-15); });
  document.getElementById('rotate-right').addEventListener('click', function () { animateRotate(15); });
  document.getElementById('compass').addEventListener('click', function () { animateRotate(-view.r, 360); });
  document.getElementById('download').addEventListener('click', downloadSVG);
  var sideBtn = document.getElementById('sidebar-toggle');
  var sideTxt = document.getElementById('sidebar-toggle-text');
  function setPanel(hidden) {
    document.body.classList.toggle('panel-hidden', hidden);
    sideBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    sideTxt.textContent = hidden ? 'Показать панель' : 'Скрыть панель';
    // ширина карты изменилась — раскладку подписей и линейку надо пересчитать
    setTimeout(function () { layoutLabels(); updateScaleBar(); }, 240);
  }
  sideBtn.addEventListener('click', function () {
    setPanel(!document.body.classList.contains('panel-hidden'));
  });
  setPanel(window.innerWidth <= 900);      // на телефоне панель по умолчанию свёрнута
}

function downloadSVG() {
  var clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', VW);
  clone.setAttribute('height', VH);
  var css = document.getElementById('map-style').textContent;
  var style = el('style', {});
  style.textContent = css;
  clone.insertBefore(style, clone.firstChild);
  var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n',
                       new XMLSerializer().serializeToString(clone)],
                      { type: 'image/svg+xml' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'karta-rossii.svg';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

function stats() {
  document.getElementById('stats').textContent =
    meta.length + ' регионов России · ' +
    (countries.length ? countries.length + ' стран Европы и Азии · ' : '') +
    riverData.length + ' рек · ' +
    geo.lakes.length + ' озёр и водохранилищ';
}

function init() {
  prepare();
  buildLevels();
  build();
  buildSidebar();
  buildSearch();
  bindMap();
  bindControls();
  stats();
  applyCapitalLines();
  applyView();
  layoutLabels();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

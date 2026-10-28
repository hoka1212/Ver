# -*- coding: utf-8 -*-
"""Assemble the geometry bundle: federal subjects, countries of Europe and Asia,
other land, lakes."""
import json, os
SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def rings(geom):
    if geom['type'] == 'Polygon': return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon': return geom['coordinates']
    return []

def round_poly(polys, nd):
    out = []
    for poly in polys:
        rr = []
        for ring in poly:
            pts = [[round(c[0], nd), round(c[1], nd)] for c in ring]
            ded = [pts[0]]
            for p in pts[1:]:
                if p != ded[-1]: ded.append(p)
            if len(ded) >= 4: rr.append(ded)
        if rr: out.append(rr)
    return out

def bbox(polys):
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    return [min(xs), min(ys), max(xs), max(ys)]

# ---- federal subjects -------------------------------------------------------
src = json.load(open(os.path.join(SC, 'ru_regions_40.json')))
# Natural Earth хранит эти шесть под украинскими кодами ISO — приводим к RU-…,
# чтобы во всём проекте код региона был в одном формате
RENAME = {'UA-43': 'RU-CR', 'UA-40': 'RU-SEV', 'UA-09': 'RU-LNR',
          'UA-14': 'RU-DNR', 'UA-23': 'RU-ZAP', 'UA-65': 'RU-KHE',
          'RU-X01~': 'RU-YAN'}                     # small Kara Sea island off Yamal

regions = {}
for f in src['features']:
    code = f['properties']['iso_3166_2']
    code = RENAME.get(code, code)
    regions.setdefault(code, []).extend(rings(f['geometry']))
regions = {k: round_poly(v, 3) for k, v in regions.items()}
print('regions:', len(regions))

# ---- страны Европы и Азии -----------------------------------------------------
# Собраны из тех же областей admin-1, что и субъекты, и генерализованы с ними
# одним прогоном mapshaper (countries.py prep), поэтому общие границы совпадают
# точка в точку
countries = {}
cs = json.load(open(os.path.join(SC, 'countries_40.json')))
for f in cs['features']:
    countries.setdefault(f['properties']['grp'], []).extend(rings(f['geometry']))
countries = {k: round_poly(v, 3) for k, v in countries.items()}

# Мелкие острова стран (меньше 20 км²) на карте неразличимы, а точек в них
# много — сотни островов Индонезии, Норвегии, Филиппин, Японии. Убираем только
# настоящие острова: если у кусочка есть общие точки с другой страной или с
# Россией (анклав, пограничный островок), он остаётся, иначе у соседа была бы
# дыра. Страны, у которых нет ни одного куска крупнее порога (Мальдивы), не трогаем.
import math
def ring_km2(r):
    R = 6371.0088; s = 0
    for i in range(len(r) - 1):
        (x1, y1), (x2, y2) = r[i], r[i + 1]
        s += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
    return abs(s) * R * R / 2
owner = {}
for code, polys in list(countries.items()) + [('RU', [p for v in regions.values() for p in v])]:
    for poly in polys:
        for c in poly[0]:
            owner.setdefault((c[0], c[1]), set()).add(code)
before = sum(len(r) for v in countries.values() for p in v for r in p)
for code, polys in countries.items():
    if not any(ring_km2(p[0]) >= 20 for p in polys): continue
    countries[code] = [p for p in polys if ring_km2(p[0]) >= 20 or
                       any(len(owner[(c[0], c[1])]) > 1 for c in p[0])]
after = sum(len(r) for v in countries.values() for p in v for r in p)
print('countries:', len(countries), 'points:', before, '->', after)

# ---- остальная суша (Африка, Америка, Австралия) — серой подложкой ------------
from countries import MERGE
shown = set(countries) | set(MERGE) | {'RUS'}
land = []
cn = json.load(open(os.path.join(SC, 'ne50_countries.geojson')))
def keep(polys):
    out = []
    for poly in polys:
        xs = [c[0] for c in poly[0]]; ys = [c[1] for c in poly[0]]
        if max(ys) < -15 or min(ys) > 85: continue
        if not ((max(xs) > -40 and min(xs) < 180) or max(xs) < -140): continue
        if (max(xs) - min(xs)) * (max(ys) - min(ys)) < 0.35: continue
        out.append(poly)
    return out
for f in cn['features']:
    if f['properties'].get('ADM0_A3') in shown: continue
    polys = keep(rings(f['geometry']))
    if not polys: continue
    polys = round_poly(polys, 2)
    if not polys: continue
    land.append({'polys': polys})
print('land polygons:', sum(len(l['polys']) for l in land))

# точка внутри какой-нибудь из показанных стран (для отбора озёр)
def in_ring(x, y, r):
    ins, j = False, len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins
cpolys = [(bbox([p]), p) for ps in countries.values() for p in ps]
def in_countries(x, y):
    return any(b[0] <= x <= b[2] and b[1] <= y <= b[3] and in_ring(x, y, p[0])
               for b, p in cpolys)

# ---- lakes ------------------------------------------------------------------
lakes = []
lk = json.load(open(os.path.join(SC, 'ne10_lakes.geojson')))
for f in lk['features']:
    p = f['properties']
    polys = rings(f['geometry'])
    xs = [c[0] for poly in polys for ring in poly for c in ring]
    ys = [c[1] for poly in polys for ring in poly for c in ring]
    if not xs: continue
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    size = (x1 - x0) * (y1 - y0)
    rank = p.get('scalerank') or 9
    if size < 0.12 and rank > 4: continue
    # озёра России и показанных стран Европы и Азии
    if not ((y1 > 40 and ((x0 > 18 and x1 < 181) or x0 < -165)) or
            in_countries((x0 + x1) / 2, (y0 + y1) / 2)): continue
    polys = round_poly(polys, 3)
    if not polys: continue
    lakes.append({'name': p.get('name_ru'), 'rank': rank, 'size': round(size, 3),
                  'polys': polys})
lakes.sort(key=lambda l: -l['size'])
print('lakes:', len(lakes))

bundle = {'regions': regions, 'countries': countries, 'land': land, 'lakes': lakes}
out = os.path.join(SC, 'russia-geo.js')
with open(out, 'w') as fh:
    fh.write('window.RU_GEO = ')
    json.dump(bundle, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write(';\n')
print('wrote', out, os.path.getsize(out))

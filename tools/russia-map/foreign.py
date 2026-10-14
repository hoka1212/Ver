# -*- coding: utf-8 -*-
"""Regions of the neighbouring countries: dissolve keys, names, centres, figures.

Run twice:
  python3 foreign.py keys   — помечает области соседних стран в all_40.json
                              ключом rkey и пишет fregions_src.json для mapshaper
  python3 foreign.py meta   — собирает таблицу регионов russia-fregions.json
                              (названия, тип, центр с координатами, площадь,
                              население) по Natural Earth и Викиданным
"""
import json, math, os, sys, urllib.parse, urllib.request
SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN = {'Ukraine': 'UA', 'Belarus': 'BY', 'Moldova': 'MD', 'Romania': 'RO',
         'Bulgaria': 'BG', 'Hungary': 'HU', 'Turkey': 'TR'}
RU_UA = {'UA-09', 'UA-14', 'UA-23', 'UA-65', 'UA-43', 'UA-40'}

# Приднестровье: районы левобережья и Бендеры (adm1_code -> ключ).
# В Natural Earth часть из них подписана неверно («Rezina» на месте Рыбницкого
# района, «Bender» вместе со Слободзейским районом и Тирасполем), а у
# Дубоссарского района есть отдельный крошечный кусок MDA-1638
PMR = {'MDA-1652': 'PMR-KAM', 'MDA-1645': 'PMR-RYB', 'MDA-1628': 'PMR-DUB',
       'MDA-1638': 'PMR-DUB', 'MDA-1637': 'PMR-GRI', 'MDA-1650': 'PMR-SLO'}

# Natural Earth не даёт для этих районов ни ссылки на Викиданные, ни центра
MANUAL = {
 'PMR-KAM': ('Каменский район', 'Каменский р-н', 'Район', 'Каменка', (28.700, 48.033)),
 'PMR-RYB': ('Рыбницкий район', 'Рыбницкий р-н', 'Район', 'Рыбница', (29.002, 47.768)),
 'PMR-DUB': ('Дубоссарский район', 'Дубоссарский р-н', 'Район', 'Дубоссары', (29.164, 47.264)),
 'PMR-GRI': ('Григориопольский район', 'Григориопольский р-н', 'Район', 'Григориополь', (29.297, 47.153)),
 'PMR-SLO': ('Тирасполь, Бендеры и Слободзейский район', 'Тирасполь и Бендеры',
             'Города и район', 'Тирасполь', (29.643, 46.840)),
 'MD-GA':   ('Автономное территориальное образование Гагаузия', 'Гагаузия',
             'Автономное территориальное образование', 'Комрат', (28.655, 46.301)),
}
# поправки к Викиданным и Natural Earth: ключ -> поля, которые заменяются
FIX = {
 'UA-32': {'name': 'Киевская область', 'short': 'Киевская обл.', 'capital': 'Киев', 'capitalLL': (30.5234, 50.4501),
           'area': 28131, 'areaApprox': False, 'pop': 1781044, 'popYear': '2022'},
 'UA-30': {'name': 'Киев', 'short': 'Киев', 'type': 'Город со специальным статусом',
           'capital': 'Киев', 'capitalLL': (30.5234, 50.4501), 'area': 839, 'areaApprox': False},
 'BY-HM': {'name': 'Минск', 'short': 'Минск', 'type': 'Город',
           'capital': 'Минск', 'capitalLL': (27.5615, 53.9045), 'area': 409, 'areaApprox': False},
 'BG-22': {'name': 'София (столичная область)', 'short': 'София', 'type': 'Столичная область'},
 'RO-B':  {'name': 'Бухарест', 'short': 'Бухарест', 'type': 'Муниципий',
           'capital': 'Бухарест', 'capitalLL': (26.1025, 44.4268), 'area': 228, 'areaApprox': False},
 'RO-IF': {'capital': 'Буфтя', 'capitalLL': (25.949, 44.561)},
 'HU-BU': {'name': 'Будапешт', 'short': 'Будапешт', 'type': 'Столичный город',
           'capital': 'Будапешт', 'capitalLL': (19.0402, 47.4979)},
 'HU-CS': {'name': 'Медье Чонград-Чанад', 'short': 'Чонград-Чанад'},
 # площадь и население — муниципия целиком (Q17176229), а не только города,
 # чтобы плотность считалась по одной и той же единице
 'MD-CU': {'name': 'Кишинёв', 'short': 'Кишинёв', 'type': 'Муниципий',
           'capital': 'Кишинёв', 'capitalLL': (28.8638, 47.0105),
           'area': 563, 'areaApprox': False, 'pop': 720128, 'popYear': '2024'},
 'MD-GA': {'area': 1832, 'areaApprox': False, 'pop': 103668, 'popYear': '2024'},
 'MD-BA': {'name': 'Бельцы', 'short': 'Бельцы', 'type': 'Муниципий',
           'capital': 'Бельцы', 'capitalLL': (27.9295, 47.7615)},
 # у этого района Natural Earth ссылается на одноимённый жудец Румынии (Q-id),
 # поэтому всё задано вручную; цифры — Викиданные Q2128868, перепись 2024 г.
 'MD-CL': {'name': 'Кэлэрашский район', 'short': 'Кэлэрашский р-н',
           'capital': 'Кэлэрашь', 'capitalLL': (28.306, 47.255), 'area': 753,
           'areaApprox': False, 'pop': 43864, 'popYear': '2024'},
 'MD-BS': {'capital': 'Басарабяска'},
 'TR-12': {'capital': 'Бингёль', 'capitalLL': (40.4986, 38.8847)},
}

# Дунауйварош стоит на правом берегу Дуная, в медье Фейер, но его контур в
# Natural Earth заходит за реку, и центр оказывается в Бач-Кишкуне
HU_FIX = {'HUN-4925': 'HU-FE'}

# Численность населения провинций Турции в Викиданных несогласованна: значения
# за разные годы (2015–2023), часть явно ошибочна (за 2021 г. сумма по 81
# провинции — 75,9 млн при 84,7 млн по стране), поэтому население илов не
# показываем вовсе — лучше без цифры, чем с неверной
NO_POP = {'TR'}

def rings(g):
    if g['type'] == 'Polygon': return [g['coordinates']]
    if g['type'] == 'MultiPolygon': return g['coordinates']
    return []

def in_ring(x, y, r):
    ins, j = False, len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins

def inside(x, y, polys):
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)

def area_km2(polys):
    """площадь на сфере (формула для сферических многоугольников), км²"""
    R = 6371.0088
    def ring(r):
        s = 0
        for i in range(len(r) - 1):
            (x1, y1), (x2, y2) = r[i][:2], r[i + 1][:2]
            s += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
        return abs(s) * R * R / 2
    return sum(ring(p[0]) - sum(ring(h) for h in p[1:]) for p in polys)

def rkey(p, hu_parent):
    code = p['adm1_code']
    if code in PMR: return PMR[code]
    if code in hu_parent: return hu_parent[code]
    return p['iso_3166_2']

def hungary_parents(src):
    """Города на правах медье в Natural Earth вырезаны из своих медье отдельными
    полигонами; приписываем каждый к медье, внутри внешнего контура которого он
    лежит, а если такого нет (город у государственной границы, вроде Шопрона,
    лежит на краю медье) — к медье, с которым у него больше всего общих точек"""
    hu = [f for f in src['features'] if f['properties']['admin'] == 'Hungary']
    county_feats = [f for f in hu if f['properties']['type_en'] == 'County']
    def pts(f):
        return {(round(c[0], 6), round(c[1], 6))
                for poly in rings(f['geometry']) for ring in poly for c in ring}
    counties = [(f, pts(f)) for f in hu if f['properties']['type_en'] == 'County']
    out = {}
    for f in hu:
        if f['properties']['type_en'] != 'Urban county': continue
        if f['properties']['adm1_code'] in HU_FIX:
            out[f['properties']['adm1_code']] = HU_FIX[f['properties']['adm1_code']]
            continue
        # сначала — медье, внутри внешнего контура которого лежит центр города
        ring = max((p[0] for p in rings(f['geometry'])), key=len)
        x = sum(c[0] for c in ring) / len(ring); y = sum(c[1] for c in ring) / len(ring)
        host = [c for c in county_feats
                if any(in_ring(x, y, poly[0]) for poly in rings(c['geometry']))]
        if len(host) == 1:
            out[f['properties']['adm1_code']] = host[0]['properties']['iso_3166_2']
            continue
        mine = pts(f)
        best, shared = max(((c, len(mine & cp)) for c, cp in counties), key=lambda t: t[1])
        if not shared:
            raise SystemExit('no county for %s' % f['properties']['name'])
        out[f['properties']['adm1_code']] = best['properties']['iso_3166_2']
    return out

def keys():
    src = json.load(open(os.path.join(SC, 'ne10_admin1.geojson')))
    hu = hungary_parents(src)
    allf = json.load(open(os.path.join(SC, 'all_40.json')))
    feats = []
    for f in allf['features']:
        p = f['properties']
        if p['grp'] == 'RU': continue
        f['properties'] = {'rkey': rkey(p, hu), 'grp': p['grp']}
        feats.append(f)
    json.dump({'type': 'FeatureCollection', 'features': feats},
              open(os.path.join(SC, 'fregions_src.json'), 'w'))
    print('foreign admin-1 pieces:', len(feats),
          'regions:', len({f['properties']['rkey'] for f in feats}))

def wikidata(ids):
    cache = os.path.join(SC, 'wd_regions.json')
    if not os.path.exists(cache):
        q = ('SELECT ?r ?rLabel ?cap ?capLabel ?coord ?area ?pop ?popdate ?rank WHERE {'
             ' VALUES ?r { %s }'
             ' OPTIONAL { ?r wdt:P36 ?cap . OPTIONAL { ?cap wdt:P625 ?coord . } }'
             ' OPTIONAL { ?r wdt:P2046 ?area . }'
             # устаревшие (deprecated) значения численности не берём вовсе
             ' OPTIONAL { ?r p:P1082 ?ps . ?ps ps:P1082 ?pop ; wikibase:rank ?rank .'
             ' FILTER(?rank != wikibase:DeprecatedRank) OPTIONAL { ?ps pq:P585 ?popdate . } }'
             ' SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". } }'
             % ' '.join('wd:' + i for i in sorted(ids)))
        req = urllib.request.Request(
            'https://query.wikidata.org/sparql',
            data=urllib.parse.urlencode({'query': q}).encode(),
            headers={'Accept': 'application/sparql-results+json',
                     'User-Agent': 'ver-russia-map-build/1.0'})
        open(cache, 'wb').write(urllib.request.urlopen(req, timeout=180).read())
    by = {}
    for b in json.load(open(cache))['results']['bindings']:
        q = b['r']['value'].rsplit('/', 1)[1]
        e = by.setdefault(q, {'caps': {}, 'area': None, 'pops': []})
        if 'cap' in b:
            c = e['caps'].setdefault(b['cap']['value'], {'name': b['capLabel']['value'], 'll': None})
            if 'coord' in b:
                x, y = b['coord']['value'][6:-1].split()
                c['ll'] = (round(float(x), 4), round(float(y), 4))
        if 'area' in b: e['area'] = float(b['area']['value'])
        if 'pop' in b:
            pref = b.get('rank', {}).get('value', '').endswith('PreferredRank')
            e['pops'].append((pref, b.get('popdate', {}).get('value', '')[:4],
                              int(float(b['pop']['value']))))
    return by

def short_of(name, cc):
    if cc in ('UA', 'BY', 'BG'): return name.replace(' область', ' обл.')
    if cc == 'MD': return name.replace(' район', ' р-н')
    return name

def meta():
    src = json.load(open(os.path.join(SC, 'ne10_admin1.geojson')))
    hu = hungary_parents(src)
    geo = {f['properties']['rkey']: rings(f['geometry']) for f in
           json.load(open(os.path.join(SC, 'fregions_40.json')))['features']}
    groups = {}
    for f in src['features']:
        p = f['properties']
        if p['admin'] not in ADMIN or p['iso_3166_2'] in RU_UA: continue
        k = rkey(p, hu)
        g = groups.setdefault(k, {'members': [], 'polys': []})
        g['members'].append(p)
        g['polys'].extend(rings(f['geometry']))
    for g in groups.values():
        # главная запись группы — само медье или район, а не город на правах
        # медье и не обрезок Дубоссарского района
        g['main'] = next((q for q in g['members'] if q['type_en'] != 'Urban county'
                          and q['adm1_code'] != 'MDA-1638'), g['members'][0])
    wd = wikidata({g['main']['wikidataid'] for g in groups.values() if g['main']['wikidataid']})

    out = []
    for k, g in groups.items():
        p = g['main']
        cc = 'PMR' if k.startswith('PMR-') else ADMIN[p['admin']]
        calc = area_km2(g['polys'])
        if k in MANUAL:
            name, short, typ, cap, ll = MANUAL[k]
            r = {'name': name, 'short': short, 'type': typ, 'capital': cap, 'capitalLL': ll,
                 'area': round(calc, -1), 'areaApprox': True, 'pop': None, 'popYear': None}
        else:
            nm = (p['name_ru'] or p['name']).replace('́', '')
            if cc == 'TR' and nm.startswith('ил '): nm = nm[3:]     # «ил Афьонкарахисар»
            typ = {'UA': 'Область', 'BY': 'Область', 'BG': 'Область', 'MD': 'Район',
                   'RO': 'Жудец', 'HU': 'Медье', 'TR': 'Ил'}[cc]
            full = {'RO': 'Жудец ', 'HU': 'Медье ', 'TR': 'Ил '}.get(cc, '') + nm
            e = wd.get(p['wikidataid'], {'caps': {}, 'area': None, 'pops': []})
            caps = list(e['caps'].values())
            inn = [c for c in caps if c['ll'] and inside(c['ll'][0], c['ll'][1], g['polys'])]
            cap = (inn or caps or [{'name': None, 'll': None}])[0]
            area, approx = round(calc, -1), True
            if e['area'] and 0.85 < e['area'] / calc < 1.15: area, approx = round(e['area']), False
            # предпочтительное (preferred) значение, если оно отмечено, иначе самое свежее
            pop = max(e['pops'])[1:] if e['pops'] and cc not in NO_POP else (None, None)
            r = {'name': full, 'short': short_of(nm, cc), 'type': typ, 'capital': cap['name'],
                 'capitalLL': cap['ll'], 'area': area, 'areaApprox': approx,
                 'pop': pop[1], 'popYear': pop[0] or None}
        r.update(FIX.get(k, {}))
        if r.get('area') is None: r['area'], r['areaApprox'] = round(calc, -1), True
        r['code'] = k; r['country'] = cc
        r['area'] = int(r['area'])
        if r['capitalLL']: r['capitalLL'] = list(r['capitalLL'])
        out.append(r)

    missing_geo = [r['code'] for r in out if r['code'] not in geo]
    no_cap = [r['code'] for r in out if not r['capital'] or not r['capitalLL']]
    outside = [r['code'] + ' ' + r['capital'] for r in out if r['capitalLL'] and r['code'] in geo
               and not inside(r['capitalLL'][0], r['capitalLL'][1], geo[r['code']])]
    print('foreign regions:', len(out), 'no geometry:', missing_geo, 'no centre:', no_cap)
    print('centre outside its (generalised) region:', outside)
    order = ['UA', 'BY', 'MD', 'PMR', 'RO', 'BG', 'HU', 'TR']
    out.sort(key=lambda r: (order.index(r['country']), r['name']))
    json.dump(out, open(os.path.join(SC, 'russia-fregions.json'), 'w'), ensure_ascii=False, indent=0)

if __name__ == '__main__':
    {'keys': keys, 'meta': meta}[sys.argv[1]]()

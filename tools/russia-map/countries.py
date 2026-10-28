# -*- coding: utf-8 -*-
"""Countries of Europe and Asia shown next to Russia: geometry source and facts.

Run twice:
  python3 countries.py prep — выбирает из ne10_admin1.geojson области России и
                              всех стран Европы и Азии, помечает каждую ключом
                              страны grp и пишет eurasia_src.json для mapshaper
  python3 countries.py meta — собирает таблицу стран russia-countries.json:
                              название, тип, часть света, столица с координатами,
                              площадь, население (Викиданные + ручные поправки)
"""
import json, os, sys, urllib.parse, urllib.request
SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# области Украины, которые на карте показаны в составе России (Крым и
# Севастополь Natural Earth уже относит к России)
RU_UA = {'UA-09', 'UA-14', 'UA-23', 'UA-65'}
# Приднестровье: районы левобережья и Бендеры (adm1_code)
PMR = {'MDA-1652', 'MDA-1645', 'MDA-1628', 'MDA-1637', 'MDA-1650', 'MDA-1638'}
# зависимые и особые территории рисуются в составе государства, к которому
# относятся (ADM0_A3 -> ADM0_A3)
MERGE = {'HKG': 'CHN', 'MAC': 'CHN', 'ALD': 'FIN', 'FRO': 'DNK', 'GIB': 'GBR',
         'GGY': 'GBR', 'JEY': 'GBR', 'IMN': 'GBR', 'WSB': 'GBR', 'ESB': 'GBR',
         'KAB': 'KAZ', 'CNM': 'CYP'}
# спорные рифы, ледник Сиачен и австралийские острова в Индийском океане
# государствами не являются и на карте не выделяются
DROP = {'SCR', 'PGA', 'KAS', 'IOA', 'RUS'}
# Мальдивы Natural Earth относит к «открытому океану», а не к Азии
EXTRA = {'MDV': 'Asia'}

def rings(g):
    if g['type'] == 'Polygon': return [g['coordinates']]
    if g['type'] == 'MultiPolygon': return g['coordinates']
    return []

def centroid(g):
    ring = max((p[0] for p in rings(g)), key=len)
    return sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)

def far_away(x, y):
    """заморские части европейских стран: Гвиана, Карибы, Реюньон, Майотта"""
    return x < -35 or y < -15 or (x < 90 and y < 0)

def continents():
    z = json.load(open(os.path.join(SC, 'ne10_admin0.geojson')))
    cont = {f['properties']['ADM0_A3']: f['properties']['CONTINENT'] for f in z['features']}
    cont.update(EXTRA)
    return z, cont

def prep():
    a = json.load(open(os.path.join(SC, 'ne10_admin1.geojson')))
    z, cont = continents()
    out = []
    for f in a['features']:
        p = f['properties']; a3 = p['adm0_a3']
        if p['admin'] == 'Russia' or p['iso_3166_2'] in RU_UA:
            grp = 'RU'
        elif cont.get(a3) in ('Europe', 'Asia') and a3 not in DROP:
            if far_away(*centroid(f['geometry'])): continue
            grp = 'PMR' if p['adm1_code'] in PMR else MERGE.get(a3, a3)
        else:
            continue
        f['properties'] = {'iso_3166_2': p['iso_3166_2'], 'adm1_code': p['adm1_code'],
                           'name': p['name'], 'name_ru': p['name_ru'], 'grp': grp}
        out.append(f)
    # буферная зона ООН на Кипре есть только в слое стран, без деления на области
    for f in z['features']:
        if f['properties']['ADM0_A3'] == 'CNM':
            out.append({'type': 'Feature', 'geometry': f['geometry'],
                        'properties': {'iso_3166_2': 'CNM', 'adm1_code': 'CNM', 'name': 'UN buffer zone',
                                       'name_ru': None, 'grp': MERGE['CNM']}})
    json.dump({'type': 'FeatureCollection', 'features': out},
              open(os.path.join(SC, 'eurasia_src.json'), 'w'))
    print('admin-1 pieces:', len(out), 'countries:',
          len({f['properties']['grp'] for f in out}) - 1)

# ---------------------------------------------------------------- сведения
# Соседи, которые на карте были раньше: цифры подобраны вручную и описаны
# в карточке. Площадь и население Украины и Молдовы — без территорий, которые
# на этой карте показаны отдельно (из её площади и оценки Госстата Украины на
# 1 января 2022 г. вычтены цифры Крыма, Севастополя и четырёх регионов 2022 г.)
FIX = {
 'UKR': {'name': 'Украина', 'short': 'Украина', 'area': 467841, 'pop': 32367000,
         'popNote': 'оценка на 1 января 2022 г.',
         'note': 'Без Крыма, Севастополя, ЛНР, ДНР, Запорожской и Херсонской областей, '
                 'которые на этой карте показаны в составе России.'},
 'BLR': {'name': 'Республика Беларусь', 'short': 'Беларусь', 'capital': 'Минск',
         'area': 207600, 'pop': 9413446, 'popNote': 'перепись 2019 г.'},
 'MDA': {'name': 'Республика Молдова', 'short': 'Молдова', 'area': 29683, 'pop': 2423300,
         'popNote': 'перепись 2024 г.',
         'note': 'Без Приднестровья, которое на карте показано отдельно.'},
 'PMR': {'name': 'Приднестровская Молдавская Республика', 'short': 'Приднестровье',
         'type': 'Непризнанное государство', 'capital': 'Тирасполь',
         'capitalLL': [29.6433, 46.8403], 'area': 4163, 'pop': 475373,
         'popNote': 'перепись 2015 г.'},
 'ROU': {'name': 'Румыния', 'short': 'Румыния', 'area': 238397, 'pop': 19053815,
         'popNote': 'перепись 2021 г.'},
 'BGR': {'name': 'Республика Болгария', 'short': 'Болгария', 'area': 110994, 'pop': 6519789,
         'popNote': 'перепись 2021 г.'},
 'HUN': {'name': 'Венгрия', 'short': 'Венгрия', 'area': 93030, 'pop': 9603634,
         'popNote': 'перепись 2022 г.'},
 'TUR': {'name': 'Турецкая Республика', 'short': 'Турция', 'area': 783562, 'pop': 85372377,
         'popNote': 'оценка на конец 2023 г.'},
}

def wikidata(ids):
    cache = os.path.join(SC, 'wd_countries.json')
    if not os.path.exists(cache):
        q = ('SELECT ?r ?rLabel ?cap ?capLabel ?caprank ?coord ?area ?pop ?popdate ?rank WHERE {'
             ' VALUES ?r { %s }'
             ' OPTIONAL { ?r p:P36 ?cs . ?cs ps:P36 ?cap ; wikibase:rank ?caprank .'
             ' FILTER(?caprank != wikibase:DeprecatedRank)'
             ' FILTER NOT EXISTS { ?cs pq:P582 ?capend }'      # бывшие столицы не берём
             ' OPTIONAL { ?cap wdt:P625 ?coord . } }'
             ' OPTIONAL { ?r wdt:P2046 ?area . }'
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
        e = by.setdefault(q, {'label': b['rLabel']['value'], 'caps': {}, 'area': None, 'pops': []})
        if 'cap' in b:
            c = e['caps'].setdefault(b['cap']['value'], {
                'name': b['capLabel']['value'], 'll': None,
                'pref': b['caprank']['value'].endswith('PreferredRank')})
            if 'coord' in b and c['ll'] is None:
                x, y = b['coord']['value'][6:-1].split()
                c['ll'] = [round(float(x), 4), round(float(y), 4)]
        if 'area' in b: e['area'] = max(e['area'] or 0, float(b['area']['value']))
        if 'pop' in b:
            pref = b.get('rank', {}).get('value', '').endswith('PreferredRank')
            e['pops'].append((pref, b.get('popdate', {}).get('value', '')[:4],
                              int(float(b['pop']['value']))))
    return by

def meta():
    z, cont = continents()
    src = json.load(open(os.path.join(SC, 'countries_40.json')))
    codes = sorted(f['properties']['grp'] for f in src['features'])
    adm = {f['properties']['ADM0_A3']: f['properties'] for f in z['features']}
    wd = wikidata({adm[c]['WIKIDATAID'] for c in codes if c in adm})
    over = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                       'countries_fix.json')))
    out = []
    for c in codes:
        p = adm.get(c, adm['MDA'] if c == 'PMR' else None)
        e = wd.get(p['WIKIDATAID'], {'label': p['NAME'], 'caps': {}, 'area': None, 'pops': []})
        caps = sorted(e['caps'].values(), key=lambda k: not k['pref'])
        cap = caps[0] if caps else {'name': None, 'll': None}
        pop = max(e['pops']) if e['pops'] else (False, None, None)
        r = {'code': c, 'name': e['label'], 'short': e['label'], 'type': 'Государство',
             'part': 'Европа' if (cont.get(c) == 'Europe' or c == 'PMR') else 'Азия',
             'capital': cap['name'], 'capitalLL': cap['ll'],
             'area': round(e['area']) if e['area'] else None,
             'pop': pop[2], 'popNote': ('данные ' + pop[1] + ' г.') if pop[1] else None,
             'note': None,
             # цвет по раскраске Natural Earth: у соседей он всегда разный
             'color': p['MAPCOLOR7']}
        r.update(over.get(c, {}))
        r.update(FIX.get(c, {}))
        out.append(r)
    bad = [r['code'] for r in out if not r['capital'] or not r['capitalLL'] or not r['area'] or not r['pop']]
    print('countries:', len(out), 'incomplete:', bad)
    out.sort(key=lambda r: r['short'])
    json.dump(out, open(os.path.join(SC, 'russia-countries.json'), 'w'), ensure_ascii=False, indent=0)

if __name__ == '__main__':
    {'prep': prep, 'meta': meta}[sys.argv[1]]()

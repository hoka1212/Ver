# -*- coding: utf-8 -*-
"""Extract the largest rivers of Russia and of the countries of Europe and Asia
shown on the map from Natural Earth 10m river centerlines."""
import json, math, os, sys

SC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# NE english name -> (russian name, length_km of the whole river, order)
# "order": 1 = greatest rivers (thick), 2 = large. Мелкие притоки на карте не
# показываются — только крупнейшие реки
RIVERS = {
 'Volga':        ('Волга', 3531, 1),
 'Ob':           ('Обь', 3650, 1),
 'Malaya Ob':    ('Обь (Малая Обь)', None, 2),
 'Yenisey':      ('Енисей', 3487, 1),
 'Verkhniy Yenisey': ('Верхний Енисей (Улуг-Хем)', None, 2),
 'Lena':         ('Лена', 4400, 1),
 'Amur':         ('Амур', 2824, 1),
 'Irtysh':       ('Иртыш', 4248, 1),
 'Ertis':        ('Иртыш', 4248, 1),
 'Kolyma':       ('Колыма', 2129, 2),
 'Indigirka':    ('Индигирка', 1726, 2),
 'Yana':         ('Яна', 872, 2),
 'Aldan':        ('Алдан', 2273, 2),
 'Vilyuy':       ('Вилюй', 2650, 2),
 'Olenëk':       ('Оленёк', 2292, 2),
 'Khatanga':     ('Хатанга', 1636, 2),
 'Angara':       ('Ангара', 1779, 2),
 'Lower Tunguska': ('Нижняя Тунгуска', 2989, 2),
 'Podkamennaya Tunguska': ('Подкаменная Тунгуска', 1865, 2),
 'Selenga':      ('Селенга', 1024, 2),
 'Kama':         ('Кама', 1805, 2),
 'Oka':          ('Ока', 1500, 2),
 'Don':          ('Дон', 1870, 2),
 'Ural':         ('Урал', 2428, 2),
 'Severnaya Dvina': ('Северная Двина', 744, 2),
 'Pechora':      ('Печора', 1809, 2),
 'Tobol':        ('Тобол', 1591, 2),
 'Ishim':        ('Ишим', 2450, 2),
 'Esil':         ('Ишим', 2450, 2),
 'Zeya':         ('Зея', 1242, 2),
 'Ussuri':       ('Уссури', 897, 2),
 'Shilka':       ('Шилка', 560, 2),
 'Argun’':       ('Аргунь', 1620, 2),
 'Anadyr’':      ('Анадырь', 1150, 2),
 'Kamchatka':    ('Камчатка', 758, 2),
 'Nizhnyaya Tunguska': ('Нижняя Тунгуска', 2989, 2),
 # --- Днепр и крупнейшие реки стран Европы и Азии. В Natural Earth большие
 # реки разбиты на участки с местными названиями — у каждого участка своя строка
 'Dnipro':       ('Днепр', 2201, 1),
 'Dnepre':       ('Днепр', 2201, 1),
 'Danube':       ('Дунай', 2850, 1),
 'Donau':        ('Дунай', 2850, 1),
 'Dniester':     ('Днестр', 1362, 2),
 'Prut':         ('Прут', 953, 2),
 'Southern Bug': ('Южный Буг', 806, 2),
 'Pripyat':      ('Припять', 761, 2),
 'Daugava':      ('Западная Двина', 1020, 2),
 'Neman':        ('Неман', 937, 2),
 'Firat':        ('Евфрат', 2800, 1),
 'Al Furat':     ('Евфрат', 2800, 1),
 'Euphrates':    ('Евфрат', 2800, 1),
 'Dicle':        ('Тигр', 1850, 2),
 'Tigris':       ('Тигр', 1850, 2),
 'Rhine':        ('Рейн', 1233, 2),
 'Rhein':        ('Рейн', 1233, 2),
 'Rhin':         ('Рейн', 1233, 2),
 'Elbe':         ('Эльба', 1094, 2),
 'Vistula':      ('Висла', 1047, 2),
 'Oder':         ('Одер', 854, 2),
 'Loire':        ('Луара', 1006, 2),
 'Seine':        ('Сена', 777, 2),
 'Rhône':        ('Рона', 812, 2),
 'Rhne':         ('Рона', 812, 2),
 'Po':           ('По', 652, 2),
 'Ebro':         ('Эбро', 910, 2),
 'Tajo':         ('Тахо', 1007, 2),
 'Tejo':         ('Тахо', 1007, 2),
 'Duero':        ('Дуэро', 897, 2),
 'Syr  Darya':   ('Сырдарья', 2212, 2),
 'Amu  Darya':   ('Амударья', 1415, 2),
 'Ertix':        ('Иртыш', 4248, 1),
 'Heilong Jiang': ('Амур', 2824, 1),
 'Songhua':      ('Сунгари', 1927, 2),
 'Liao':         ('Ляохэ', 1345, 2),
 'Tarim':        ('Тарим', 2030, 2),
 'Huang':        ('Хуанхэ', 5464, 1),
 'Yangtze':      ('Янцзы', 6300, 1),
 'Chang Jiang':  ('Янцзы', 6300, 1),
 'Jinsha':       ('Янцзы', 6300, 1),
 'Tongtian':     ('Янцзы', 6300, 1),
 'Tuotuo':       ('Янцзы', 6300, 1),
 'Xi':           ('Сицзян', 2214, 2),
 'Xun':          ('Сицзян', 2214, 2),
 'Hongshui':     ('Сицзян', 2214, 2),
 'Nanpan':       ('Сицзян', 2214, 2),
 'Mekong':       ('Меконг', 4500, 1),
 'Lancang':      ('Меконг', 4500, 1),
 'Salween':      ('Салуин', 2820, 1),
 'Nu':           ('Салуин', 2820, 1),
 'Ayeyarwady':   ('Иравади', 2170, 2),
 'Nmai':         ('Иравади', 2170, 2),
 'Hong':         ('Хонгха', 1149, 2),
 'Brahmaputra':  ('Брахмапутра', 2896, 1),
 'Yarlung':      ('Брахмапутра', 2896, 1),
 'Dihang':       ('Брахмапутра', 2896, 1),
 'Maquan':       ('Брахмапутра', 2896, 1),
 'Ganges':       ('Ганг', 2700, 1),
 'Yamuna':       ('Джамна', 1376, 2),
 'Indus':        ('Инд', 3180, 1),
 'Sutlej':       ('Сатледж', 1450, 2),
 'Godävari':     ('Годавари', 1465, 2),
 'Krishna':      ('Кришна', 1400, 2),
 'Narmada':      ('Нармада', 1312, 2),
 'Helmand':      ('Гильменд', 1150, 2),
 'Kapuas':       ('Капуас', 1143, 2),
 'Kiz?lirmak':   ('Кызылырмак', 1355, 2),
}

# Bounding box of Russia (rivers are kept only where they run through it).
def in_russia(x, y):
    if y < 40 or y > 83: return False
    if x >= 19 and x <= 180: return True
    if x <= -168: return True   # Chukotka east of the date line
    return False

def in_area(x, y):
    # Россия и страны Европы и Азии (названия рек и так выбраны поимённо)
    return in_russia(x, y) or (-25 <= x <= 180 and -12 <= y <= 83)

def rdp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]
    while stack:
        a,b = stack.pop()
        ax,ay = pts[a]; bx,by = pts[b]
        dx,dy = bx-ax, by-ay
        den = math.hypot(dx,dy)
        best=-1.0; idx=-1
        for i in range(a+1,b):
            x,y = pts[i]
            d = abs(dy*x - dx*y + bx*ay - by*ax)/den if den else math.hypot(x-ax,y-ay)
            if d > best: best=d; idx=i
        if best > eps and idx>0:
            keep[idx]=True; stack.append((a,idx)); stack.append((idx,b))
    return [pt for pt,k in zip(pts,keep) if k]

def parts(geom):
    if geom['type'] == 'LineString': return [geom['coordinates']]
    if geom['type'] == 'MultiLineString': return geom['coordinates']
    return []

def main():
    src = json.load(open(os.path.join(SC, 'ne10_rivers.geojson')))
    out = {}
    for f in src['features']:
        p = f['properties']
        nm = p.get('name')
        if nm not in RIVERS: continue
        ru, length, order = RIVERS[nm]
        for line in parts(f['geometry']):
            if not any(in_area(c[0], c[1]) for c in line): continue
            line = rdp([[c[0], c[1]] for c in line], 0.004 if order == 1 else 0.008 if order == 2 else 0.015)
            line = [[round(c[0], 3), round(c[1], 3)] for c in line]
            r = out.setdefault(ru, {'name': ru, 'length': length, 'order': order, 'lines': []})
            r['lines'].append(line)
    rivers = sorted(out.values(), key=lambda r: (r['order'], -(r['length'] or 0)))
    print(len(rivers), 'rivers', sum(len(r['lines']) for r in rivers), 'segments')
    with open(os.path.join(SC, 'russia-rivers.js'), 'w') as fh:
        fh.write('window.RU_RIVERS = ')
        json.dump(rivers, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')

main()

# Данные для карты России (`russia/index.html`)

Три файла в `russia/js/` собраны скриптами из этой папки:

| файл | что внутри | скрипт |
|---|---|---|
| `russia/js/geo.js` | границы 89 регионов и восьми соседних стран (см. ниже), суша остальных стран, озёра и водохранилища | `geo.py` |
| `russia/js/regions.js` | названия, типы, столицы с координатами, округа, площадь и население; то же для соседних стран (`RU_COUNTRIES`) | `regions.py` |
| `russia/js/rivers.js` | русла крупных рек с русскими названиями и длинами | `rivers.py` |

## Как пересобрать

```sh
mkdir -p work && cd work
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
curl -O $BASE/ne_10m_admin_1_states_provinces.geojson
curl -O $BASE/ne_10m_rivers_lake_centerlines.geojson
curl -O $BASE/ne_10m_lakes.geojson
curl -O $BASE/ne_10m_populated_places.geojson
curl -O $BASE/ne_50m_admin_0_countries.geojson
# скрипты ждут короткие имена
for f in 10m_admin_1_states_provinces:ne10_admin1 10m_rivers_lake_centerlines:ne10_rivers \
         10m_lakes:ne10_lakes 10m_populated_places:ne10_places 50m_admin_0_countries:ne50_countries; do
  mv "ne_${f%%:*}.geojson" "${f##*:}.geojson"
done

# генерализация границ (нужен mapshaper: npm i -g mapshaper).
# Субъекты и соседние страны упрощаются одним прогоном, чтобы общие границы
# совпадали точка в точку; точки самих субъектов при этом остаются теми же,
# что и при упрощении одной России.
RU='admin=="Russia" || ["UA-09","UA-14","UA-23","UA-65"].indexOf(iso_3166_2) > -1'
# районы Молдовы на левом берегу Днестра и Бендеры — Приднестровье
PMR='["MDA-1652","MDA-1645","MDA-1628","MDA-1637","MDA-1650","MDA-1638"].indexOf(adm1_code) > -1'
mapshaper ne10_admin1.geojson \
  -filter "$RU || [\"Ukraine\",\"Moldova\",\"Romania\",\"Bulgaria\",\"Turkey\",\"Belarus\",\"Hungary\"].indexOf(admin) > -1" \
  -each "grp = ($RU) ? 'RU' : admin=='Moldova' && $PMR ? 'PMR' :
         {Ukraine:'UA',Moldova:'MD',Romania:'RO',Bulgaria:'BG',Turkey:'TR',Belarus:'BY',Hungary:'HU'}[admin]" \
  -filter-fields iso_3166_2,adm1_code,name,name_ru,grp \
  -simplify 40% keep-shapes -clean \
  -o precision=0.001 format=geojson all_40.json
mapshaper all_40.json -filter 'grp=="RU"' -filter-fields iso_3166_2,adm1_code,name,name_ru \
  -o precision=0.001 format=geojson ru_regions_40.json
mapshaper all_40.json -filter 'grp!="RU"' -dissolve grp \
  -o precision=0.001 format=geojson countries_40.json

python3 ../geo.py && python3 ../regions.py && python3 ../rivers.py
# положить как russia/js/geo.js, russia/js/regions.js, russia/js/rivers.js
cp russia-geo.js ../../../russia/js/geo.js
cp russia-regions.js ../../../russia/js/regions.js
cp russia-rivers.js ../../../russia/js/rivers.js
```

`rivers.py` сам прореживает точки (алгоритм Дугласа — Пекера), поэтому файл рек
получается примерно в три раза меньше исходного.

## Проверки, которые стоит прогнать после пересборки

* столица каждого субъекта попадает внутрь его же полигона (кроме Ленинградской
  области — её центр Санкт-Петербург в состав области не входит, и Абакана,
  который стоит вплотную к границе Хакасии и после генерализации оказывается
  по другую её сторону, и Херсона, который стоит на самом краю области);
* у всех 89 записей `russia-regions.js` есть геометрия в `russia-geo.js` и наоборот;
* точка подписи (полюс недоступности) лежит внутри своего субъекта.

## Крым, Севастополь и регионы 2022 года

Эти шесть регионов лежат в `ne_10m_admin_1_states_provinces` под кодами `UA-…`,
поэтому попадают в выборку отдельным условием фильтра в команде mapshaper.
`geo.py` переименовывает их ключи в `RU-CR`, `RU-SEV`, `RU-LNR`, `RU-DNR`,
`RU-ZAP`, `RU-KHE` (те же коды прописаны в таблице `regions.py`), чтобы во всём
проекте код региона был в едином виде RU-….
В остальном они ничем не отличаются от других записей. Для ЛНР, ДНР, Запорожской
и Херсонской областей площадь и население взяты из украинской статистики по
соответствующим областям (оценка на начало 2022 года), а не из переписи 2021 года.

## Соседние страны

Украина, Беларусь, Молдова, Приднестровье, Румыния, Болгария, Венгрия и Турция
нарисованы не серой подложкой, а так же, как субъекты: их можно навести, выбрать,
найти поиском, у них есть подпись со столицей и карточка. Контуры собраны из
областей `ne_10m_admin_1_states_provinces` (`countries_40.json`), лежат в
`RU_GEO.countries`, а сведения о них — в таблице `C` в `regions.py`.
Приднестровье выделено из районов Молдовы по `adm1_code` (см. команду выше).
Площадь и население Украины даны без Крыма, Севастополя и четырёх регионов
2022 года, Молдовы — без Приднестровья, так как они показаны на карте отдельно.
Охват карты и стартовый вид по-прежнему считаются только по субъектам России.

## Источники

* Natural Earth 1:10 млн и 1:50 млн — общественное достояние (public domain).
* Площадь и население — Росстат, Всероссийская перепись населения 2021 года;
  по соседним странам — национальные переписи и оценки (год указан в карточке).
* Длины рек — справочные, для реки целиком, включая участки вне России.

#!/usr/bin/env bash
# Сборка приложений (Доходы, Мастерская, Директ, Freitag AI) в папку OUT, каждая версия — в своей папке V.
# Используется дважды: старый адрес erichthoxx-sketch.github.io/mine (pages.yml, OUT=_site)
# и новый короткий lanafreitag.ru/my (публикация в хранилище lanafreitag, OUT=out/my).
# Запуск: bash scripts/build-apps.sh <версия> <папка>   (из корня хранилища mine)
set -euo pipefail
V="$1"; OUT="$2"
mkdir -p "$OUT/$V" "$OUT/$V/writer" "$OUT/pisatel" "$OUT/$V/direct" "$OUT/direct" "$OUT/$V/ai" "$OUT/ai"
cp -r css js "$OUT/$V/"
cp -r js/vendor "$OUT/vendor"  # постоянная копия библиотек — для страниц, открытых до обновления
cp -r writer/js "$OUT/$V/writer/"
cp -r direct/js "$OUT/$V/direct/"
echo "$V" > "$OUT/version.txt"
cp manifest.webmanifest heart-line.svg heart-line-180.png heart-line-512.png "$OUT/"
cp writer/manifest.webmanifest writer/photo-32.png writer/photo-180.png writer/photo-512.png writer/bear.svg writer/bear-180.png writer/bear-512.png writer/star.svg writer/star-180.png writer/star-512.png "$OUT/pisatel/"
cp direct/manifest.webmanifest direct/target.svg direct/target-180.png direct/target-512.png proxy/direct-worker.js "$OUT/direct/"
cp ai/manifest.webmanifest ai/style.css "$OUT/ai/"
cp ai/app.js "$OUT/$V/ai/app.js"
cp ai/master-sync.js "$OUT/$V/ai/master-sync.js"
sed "s#__APPV__#$V#; s#\.\./css/style.css#../$V/css/style.css#; s#\./style.css#./style.css?v=$V#; s#\./app.js#../$V/ai/app.js#" ai/index.html > "$OUT/ai/index.html"
sed "s#__APPV__#$V#; s#css/style.css#$V/css/style.css#; s#js/app.js#$V/js/app.js#" index.html > "$OUT/index.html"
sed "s#__APPV__#$V#; s#\.\./css/style.css#../$V/css/style.css#; s#\"js/app.js#\"../$V/writer/js/app.js#" writer/index.html > "$OUT/pisatel/index.html"
sed "s#__APPV__#$V#; s#\.\./css/style.css#../$V/css/style.css#; s#\"js/app.js#\"../$V/direct/js/app.js#" direct/index.html > "$OUT/direct/index.html"
grep -q "$V/ai/app.js" "$OUT/ai/index.html"
grep -q "$V/js/app.js" "$OUT/index.html"
grep -q "$V/writer/js/app.js" "$OUT/pisatel/index.html"
grep -q "$V/css/style.css" "$OUT/pisatel/index.html"
grep -q "$V/direct/js/app.js" "$OUT/direct/index.html"

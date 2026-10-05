# Подключение Google Диска к Мастерской — 4 шага, ~10 минут

Все ссылки ниже сразу открывают ваш проект `dohody`. Входите тем же Gmail, что и в Firebase.

## Шаг 1. Разрешить доступ к Диску и Документам
1. Откройте https://console.cloud.google.com/apis/library/drive.googleapis.com?project=dohody-6d6dd → нажмите синюю кнопку **Enable** (Включить).
2. Откройте https://console.cloud.google.com/apis/library/docs.googleapis.com?project=dohody-6d6dd → **Enable**.

## Шаг 2. Экран входа Google
1. Откройте https://console.cloud.google.com/auth/overview?project=dohody-6d6dd → **Get started** (Начать).
2. **App name**: `Мастерская`. **User support email**: ваш Gmail. → **Next**.
3. **Audience**: выберите **External** → **Next**.
4. **Contact information**: ваш Gmail → **Next** → поставьте галочку согласия → **Continue** → **Create**.

## Шаг 3. Добавить себя как пользователя
1. Откройте https://console.cloud.google.com/auth/audience?project=dohody-6d6dd
2. В разделе **Test users** нажмите **+ Add users**, впишите свой Gmail → **Save**.
   (Публиковать приложение не нужно — оно личное, режим «Testing» как раз для этого.)

## Шаг 4. Ключ для сайта
1. Откройте https://console.cloud.google.com/auth/clients?project=dohody-6d6dd → **+ Create client**.
2. **Application type**: **Web application**. **Name**: `Мастерская`.
3. В **Authorized JavaScript origins** нажмите **+ Add URI** и впишите: `https://erichthoxx-sketch.github.io`
4. **Create**. Появится окно с **Client ID** — строка вида `123456-abc….apps.googleusercontent.com`.
   **Скопируйте Client ID и пришлите Claude.** (Client secret не нужен и не присылайте его.)

## После этого
1. Откройте Мастерскую: https://erichthoxx-sketch.github.io/mine/pisatel/ → войдите той же почтой и паролем, что в доходах.
2. **Подключить Google Диск** → выберите свой Gmail. Google покажет «Приложение не проверено» — это нормально для личного приложения: нажмите **Дополнительно → Перейти на сайт…** и разрешите доступ.
3. ⚙️ → **Папка с книгами** → «Литнет». **Папка для баннеров** → «Маркетинг» (галочка «создать», если её нет).
4. **Книги → + Книга → Выбрать файл на Google Диске** → добавьте книги.

На телефоне: та же ссылка, тот же вход, «Подключить Google Диск» один раз. Значок на экран — как у приложения доходов.

# «Мастерская» → ChatGPT: отдельный защищенный OAuth-шлюз

**Статус:** отдельный прототип в PR, **НЕ опубликован**. Пока не получены учетные данные GitHub OAuth и отдельный Cloudflare KV, в форме ChatGPT нельзя завершить авторизацию. Рабочий `masterskaya-ai` (Claude MCP) не меняется.

## Что делает

- ChatGPT подключается **только** к новому `https://masterskaya-chatgpt-oauth.erichtho-xx.workers.dev/mcp`, не к прежнему `masterskaya-ai`.
- Cloudflare Workers OAuth Provider v1 выдает OAuth 2.1 токены (PKCE S256, CIMD и совместимость с DCR; поддерживает refresh при `offline_access`).
- Пользователь входит через **свой GitHub OAuth App**. Сервер сверяет неизменный цифровой GitHub ID с `OWNER_GITHUB_ID`. Если ID другой — доступ запрещен.
- Дополнительно принимаются только OAuth-запросы с адресом возврата на `chatgpt.com`, после браузерного согласия. Другим приложениям право чтения не выдается.
- Сервер перенаправляет строго пять методов **только чтения** на существующий MCP:
  `list_books`, `get_book_context`, `list_chapters`, `read_chapter`, `search_book`. В ответе `tools/list` скрываются статистика, расходы, Директ и прочие инструменты. Любой вызов скрытого инструмента запрещен сервером.
- Старый `MCP_READ_KEY` нужен только как Cloudflare Secret нового Worker; ChatGPT его не получает, и в GitHub он не хранится.
- Код шлюза: `oauth-bridge/src/index.js`, фильтр прав: `oauth-bridge/src/relay.js`. **Не объединять/не развертывать**, пока не пройдут CI и реальная проверка безопасности и OAuth.

## Когда будешь готова подключить (нужно твое участие)

1. **GitHub OAuth App:** [GitHub Developer settings](https://github.com/settings/developers) → OAuth Apps → New OAuth App.
   - Application name: `Masterskaya ChatGPT Private`
   - Homepage URL: `https://masterskaya-chatgpt-oauth.erichtho-xx.workers.dev`
   - Authorization callback URL: `https://masterskaya-chatgpt-oauth.erichtho-xx.workers.dev/github/callback`
   - GitHub выдаст `Client ID` и `Client Secret`. Их **не присылай в чат**.
2. **Cloudflare → KV:** создай **отдельный** namespace для `OAUTH_KV`. Замени нулевой ID в `oauth-bridge/wrangler.jsonc` реальным KV ID. **Не используй KV `BOOKS` для OAuth-токенов**.
3. **Cloudflare Worker:** имя `masterskaya-chatgpt-oauth`. Добавь 4 секретные переменные:
   - `GITHUB_CLIENT_ID` — из GitHub OAuth App
   - `GITHUB_CLIENT_SECRET` — из GitHub OAuth App
   - `OWNER_GITHUB_ID` — числовой ID твоего GitHub аккаунта (получить через `https://api.github.com/users/erichthoxx-sketch`, поле `id`; **не** username)
   - `MCP_READ_KEY` — действующий секрет исходного MCP Worker (минимум 32 символа)
4. После кодовой проверки в терминале из `oauth-bridge/`: `npm install`, `npm run check`, `npm run build`, затем только с подтверждением пользователя `npm run deploy`. **Текущий PR ничего не деплоит**. Убедись, что OAuth-адрес и правильный subdomain соответствуют твоему Cloudflare.
5. **ChatGPT → Плагины → Добавить пользовательский MCP**: URL **нового** сервера `https://masterskaya-chatgpt-oauth.erichtho-xx.workers.dev/mcp`, тип OAuth, регистрация клиента — предпочтительно Client ID Metadata Document (CIMD) или dynamic registration (DCR), затем GitHub вход владельца и одобрение. Не вводить ключи в эту форму.
6. После установки вызови `list_books`, затем `get_book_context` для одной книги. Убедись, что инструменты доходов и Директа отсутствуют. Если ChatGPT отклоняет создание из-за политики тарифа, код не может обойти ограничения аккаунта.

## Что может пойти не так

- Пока запрашиваешь авторизацию по старому URL `masterskaya-ai…/mcp`, ChatGPT видит API-key MCP и не находит OAuth metadata.
- У OAuth App и нового Worker callback обязан совпадать *до символа*. Если `workers.dev` поддомен другой, исправь и URL, и `MCP_RESOURCE`, и callback в исходнике.
- `OAUTH_KV` в примере имеет **нулевой ID как заглушку**. Это не готовая настройка реального KV.
- Не используй анонимный режим MCP, не выставляй `MCP_READ_KEY` в браузере, не открывай прямой доступ к `/sync/*`.
- Развертывание требует независимой проверки security для OAuth token audience, delegated scope, session/cookie, ChatGPT CIMD и DCR. Неподтвержденная совместимость — не повод выдавать доступ.
- Обновленный канон/главы становятся видимы после синхронизации данных с прежним MCP Worker. В отдельном PR №13 Freitag AI получает свежие Google Docs перед каждым собственным запросом. Это другое направление, не автоматическое серверное получение Google Docs для ChatGPT.

## Отдельная задача: BotHub API

Для BotHub (не для ChatGPT OAuth!) на экране «Для разработчиков» указано: ключ доступен с **пакета Basic**. Если решено тестировать BotHub — взять самый маленький подходящий пакет, оставить **Eco** на первом эксперименте и получить ключ. Сохранить `BOTHUB_API_KEY` **секретом Cloudflare Worker Freitag AI**, не в GitHub/чат. Это никак не влияет на OAuth-шлюз ChatGPT.


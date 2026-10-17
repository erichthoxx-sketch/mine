// ИИ-таргетолог: нейросеть (Claude или ChatGPT — на выбор, по ключу владелицы) сама разбирает кампании
// и предлагает план. Применяется только то, что владелица отметила галочкой: сам ИИ ничего в кабинете не меняет.
// Ключ хранится в настройках владелицы (как ключ Todoist), в код не попадает.
// Запросы идут через её переходник (если он поставлен), иначе — напрямую из браузера.
import { parsePlan, DEFAULT_MAX_BID, PLAN_TAG } from './dcalc.js';

export const PROVIDERS = {
  claude: { name: 'Claude', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { name: 'ChatGPT', model: 'gpt-5', keyUrl: 'https://platform.openai.com/api-keys' },
};

export function systemPrompt({ maxBid = DEFAULT_MAX_BID } = {}) {
  return [
    'Ты — опытный таргетолог Яндекс Директа, который ведёт рекламу книг (любовные романы на Литнете) для автора.',
    'Тебе дают все данные кампаний одним текстом. Работай как аналитик: опирайся только на данные, не выдумывай;',
    'на малых числах (мало кликов, 1–2 покупки) не делай выводов — так и скажи, что нужно подождать.',
    'Отвечай по-русски, просто и коротко: 1) что происходит (3–6 пунктов с цифрами), 2) что делать и почему, 3) что подождать.',
    `Затем — план в блоке \`\`\`${PLAN_TAG} в точности в формате, описанном в данных. Если менять ничего не нужно — пустой список actions.`,
    `Ограничения: бюджеты и дневные лимиты не меняй; ставка не выше ${maxBid} ₽; не больше 8 действий; у каждого действия — короткое «почему».`,
    'Владелица сама отметит, что применить, — объясняй так, чтобы ей было легко решить.',
  ].join('\n');
}

// Запрос к нейросети: {url, headers, body}. base — адрес переходника (или пусто — напрямую)
export function buildRequest({ provider, key, model, system, user, base = '' }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Неизвестная нейросеть');
  const m = model || p.model;
  if (provider === 'claude') {
    return {
      url: (base ? base.replace(/\/+$/, '') + '/anthropic' : 'https://api.anthropic.com') + '/v1/messages',
      headers: {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01', // если модель откажет — ответит запасная
        ...(base ? {} : { 'anthropic-dangerous-direct-browser-access': 'true' }),
      },
      body: { model: m, max_tokens: 16000, system, messages: [{ role: 'user', content: user }], output_config: { effort: 'high' }, fallbacks: 'default' },
    };
  }
  return {
    url: (base ? base.replace(/\/+$/, '') + '/openai' : 'https://api.openai.com') + '/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: { model: m, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
  };
}

// Ответ нейросети → текст
export function readResponse(provider, data) {
  if (data?.error) throw new Error(`${PROVIDERS[provider].name}: ${data.error.message || data.error.type || 'ошибка'}`);
  if (provider === 'claude') {
    if (data?.stop_reason === 'refusal') throw new Error('Claude отказался отвечать на этот запрос — попробуйте ещё раз или другую нейросеть.');
    return (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

export function splitPlan(text, { maxBid } = {}) {
  const { actions, errors } = parsePlan(text, { maxBid });
  const analysis = String(text).replace(new RegExp('```\\s*' + PLAN_TAG + '[\\s\\S]*?```'), '').trim();
  return { analysis, actions, errors };
}

export async function askModel(s, user) {
  const ai = s.ai || {}, key = (s.aiKeys || {})[ai.provider];
  if (!ai.provider || !key) throw new Error('ИИ не подключён — выберите нейросеть и вставьте ключ.');
  const req = buildRequest({ provider: ai.provider, key, model: ai.model, system: systemPrompt({ maxBid: Number(s.direct?.maxBid) || DEFAULT_MAX_BID }), user, base: s.direct?.proxyOk ? s.direct.proxy : '' });
  let res;
  try { res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) }); } catch { throw new Error('Нет связи с нейросетью. Проверьте интернет (и что переходник обновлён до последней версии).'); }
  let data = null;
  try { data = await res.json(); } catch { /* не JSON */ }
  if (res.status === 401) throw new Error('Ключ нейросети не подошёл — проверьте его в настройках ИИ.');
  if (res.status === 429) throw new Error('Нейросеть просит подождать (лимит запросов) — попробуйте через минуту.');
  if (!res.ok && !data?.error) throw new Error(`Нейросеть ответила ошибкой ${res.status}`);
  return readResponse(ai.provider, data);
}

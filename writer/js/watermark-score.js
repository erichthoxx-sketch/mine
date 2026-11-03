// Browser port of guillaumemeyer/watermarks-remover stealer/scorer.py
// and stealer/tokens.py (MIT). Experimental black-box estimates, NOT an
// Anthropic decoder. A real s_star.json trained for the target model is required.
const TOKEN_RE = /[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu;

export function tokenizeWithOffsets(text) {
  const tokens = [];
  for (const match of String(text || '').matchAll(TOKEN_RE)) {
    tokens.push({ text: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

export function scoreTokenPositions(text, model) {
  const table = model?.scorer || {};
  const contextLen = Number(model?.config?.context_len || 0);
  if (!Number.isInteger(contextLen) || contextLen < 1 || contextLen > 128) {
    throw new Error('Некорректная длина контекста статистической модели');
  }
  const tokens = tokenizeWithOffsets(text);
  const hits = [];
  for (let i = contextLen; i < tokens.length; i++) {
    // Matches the upstream Python context_key(...): json.dumps(list(context),
    // ensure_ascii=False, separators=(",", ":")).
    const key = JSON.stringify(tokens.slice(i - contextLen, i).map((t) => t.text));
    const choices = table[key];
    if (!Array.isArray(choices)) continue;
    const entry = choices.find((x) => x.token === tokens[i].text && Number.isFinite(Number(x.score)) && Number(x.score) > 0);
    if (entry) hits.push({ ...tokens[i], score: Number(entry.score) });
  }
  return { hits, tokenCount: tokens.length, matched: hits.length };
}

export function isTrainedScorer(model) {
  return Boolean(model && model.scorer && typeof model.scorer === 'object'
    && Object.keys(model.scorer).length > 0 && Number.isInteger(Number(model?.config?.context_len)));
}

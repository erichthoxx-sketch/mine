import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const GPTUNNEL = 'https://gptunnel.ru/v1/assistant/';
const root = new URL('../', import.meta.url);
const template = JSON.parse(readFileSync(new URL('proxy/wrangler.gptunnel.example.jsonc', root), 'utf8'));
const wranglerVersion = '4.166.0';

async function jsonRequest(url, init, label) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${label} · HTTP ${response.status}`);
  return response.json();
}

async function findAssistant(code, apiKey) {
  const url = new URL('list', GPTUNNEL);
  url.searchParams.set('query', code);
  url.searchParams.set('limit', '100');
  const { data } = await jsonRequest(url, { headers: { Authorization: apiKey } }, 'Список ассистентов GPTunneL');
  const assistant = data?.find((item) => item.mention?.toLowerCase() === code.toLowerCase());
  if (!assistant) throw new Error('Ассистент с этим кодом не найден у владельца ключа.');
  if (assistant.access?.isPrivate !== true || assistant.access.orgId != null) {
    throw new Error('В настройках GPTunneL выберите тип «Приватный» для личного ассистента.');
  }
  if (!Array.isArray(assistant.mcp) || assistant.mcp.length) {
    throw new Error('У ассистента уже настроен MCP или GPTunneL не вернул сведения о подключениях.');
  }
  return assistant.id;
}

function wrangler(args, { capture = false } = {}) {
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  delete env.GPTUNNEL_WORKSHOP_KEY;
  const result = spawnSync('npx', ['--yes', `wrangler@${wranglerVersion}`, ...args], {
    env, encoding: 'utf8', cwd: fileURLToPath(root), stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.error || result.status !== 0) throw new Error(`Wrangler: не удалось выполнить ${args[0]}. ${result.error?.code || ''}`);
  return result.stdout || '';
}

async function deploy(namespaceId, bookId, key) {
  const dir = mkdtempSync(join(tmpdir(), 'masterskaya-gptunnel-'));
  const configFile = join(dir, 'wrangler.json');
  const secretsFile = join(dir, 'secrets.json');
  const name = `${template.name}-${randomBytes(5).toString('hex')}`;
  try {
    const config = { ...template, name, main: fileURLToPath(new URL('proxy/gptunnel-books-worker.js', root)),
      vars: { GPTUNNEL_BOOK_ID: bookId }, kv_namespaces: [{ binding: 'BOOKS', id: namespaceId }] };
    writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
    writeFileSync(secretsFile, JSON.stringify({ GPTUNNEL_WORKSHOP_KEY: key }), { mode: 0o600 });
    console.log(`Создаю отдельный Worker ${name}…`);
    const output = wrangler(['deploy', '--config', configFile, '--secrets-file', secretsFile], { capture: true });
    const urls = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi) || [];
    const worker = urls.find((url) => new URL(url).hostname.startsWith(`${name}.`));
    if (!worker) throw new Error(`Wrangler не вернул URL. Проверьте Worker ${name} в Cloudflare.`);
    return worker;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function verify(worker, key) {
  const url = new URL('/mcp', worker);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const anonymous = await fetch(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(10000) });
  await anonymous.body?.cancel();
  if (anonymous.status !== 401) throw new Error('Проверка Worker без Bearer-токена должна вернуть HTTP 401.');
  const reply = await jsonRequest(url, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${key}` }, body }, 'Проверка MCP');
  const names = reply.result?.tools?.map(({ name }) => name).sort();
  if (names?.join(',') !== 'get_book_context,list_books,list_chapters,read_chapter,search_book') {
    throw new Error('Worker вернул неожиданный список инструментов.');
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Запустите команду в обычном терминале.');
  let hidden = false;
  const output = new Writable({ write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding);
    done();
  } });
  output.isTTY = true;
  const prompts = createInterface({ input: process.stdin, output, terminal: true });
  const abort = new AbortController();
  prompts.once('SIGINT', () => abort.abort());
  const ask = (message) => prompts.question(message, { signal: abort.signal });
  let code, apiKey, namespaceId, bookId;
  try {
    code = (await ask('Код личного ассистента GPTunneL: ')).trim();
    if (!/^[a-z0-9_-]{3,16}$/i.test(code)) throw new Error('Проверьте код ассистента в его настройках.');
    namespaceId = (await ask('ID существующего KV namespace Мастерской (32 символа): ')).trim();
    bookId = (await ask('ID выбранной книги (часть имени ключа после book:): ')).trim();
    if (!/^[a-f0-9]{32}$/i.test(namespaceId) || !/^[a-z0-9_-]{1,100}$/i.test(bookId)) {
      throw new Error('Проверьте ID пространства KV и книги.');
    }
    process.stdout.write('Личный API-ключ GPTunneL (ввод скрыт): ');
    hidden = true;
    apiKey = (await ask('')).trim();
    if (!apiKey) throw new Error('Нужен личный API-ключ GPTunneL.');
  } finally {
    if (hidden) process.stdout.write('\n');
    prompts.close();
  }

  const assistantId = await findAssistant(code, apiKey);
  console.log('В Cloudflare выберите аккаунт, где находится Мастерская.');
  if (!process.env.CLOUDFLARE_API_TOKEN) wrangler(['login']);
  const key = randomBytes(32).toString('hex');
  const worker = await deploy(namespaceId, bookId, key);
  console.log(`Worker создан · ${worker}`);
  await verify(worker, key);
  if (await findAssistant(code, apiKey) !== assistantId) throw new Error('Настройки ассистента изменились во время развёртывания.');
  const server = new URL(process.argv[2] === '--streamable' ? '/mcp' : '/sse', worker).href;
  // GPTunneL хранит этот Bearer-токен как секрет MCP. Промпт и модель в запрос не передаются.
  const result = await jsonRequest(new URL('update', GPTUNNEL), {
    method: 'POST', headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: assistantId, mcp: [{ server, accessToken: key }] })
  }, 'Настройка ассистента GPTunneL');
  if (result.mcp?.[0]?.server !== server) throw new Error('GPTunneL не подтвердил сохранение адреса MCP.');
  console.log('Адрес MCP сохранён в GPTunneL. В настройках ассистента нажмите «Проверить».');
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error instanceof SyntaxError ? 'Сервис вернул неожиданный ответ.' : error.message);
});

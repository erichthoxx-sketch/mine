const ACTIVE = "active";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const GENERATION_MS = 13 * 60 * 1000;
const MAX_OUTPUT = 500000;
const jobKey = id => "job:" + id;
const requestKey = id => "request:" + id;
const summaryKey = id => "summary:" + id;
const json = (body, status = 200) => Response.json(body, {status});

function publicJob(job, complete = false) {
  const {prompt, text, fingerprint, ...metadata} = job;
  return complete ? {...metadata, prompt, text} : {...metadata, excerpt:prompt.slice(0, 110), characters:text.length};
}

async function receiveChapter(stream, fragment) {
  const reader = stream.getReader(),decoder = new TextDecoder();
  let pending = "", finishReason = "", done = false, usage, requestId;
  const line = async value => {
    if (!value.startsWith("data:")) return;
    const data = value.slice(5).trim();
    if (!data || data === "[DONE]") { done ||= data === "[DONE]"; return; }
    const event = JSON.parse(data);
    if (event.error) throw Error("Провайдер прервал выдачу текста.");
    if (typeof event.request_id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(event.request_id)) requestId = event.request_id;
    const choice = event.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (event.usage) {
      usage = {};
      for (const key of ["prompt_tokens", "completion_tokens", "cost_rub"])
        if (Number.isFinite(event.usage[key]) && event.usage[key] >= 0) usage[key] = event.usage[key];
    }
    const content = choice?.delta?.content;
    const text = Array.isArray(content) ? content.map(part => part.text || "").join("") : content;
    if (typeof text === "string" && text) await fragment(text);
  };
  try {
    while (!done) {
      const next = await reader.read();
      if (next.done) break;
      const lines = (pending + decoder.decode(next.value,{stream:true})).split("\n");
      pending = lines.pop();
      for (const item of lines) await line(item);
    }
    pending += decoder.decode();
    if (pending.trim() && !done) await line(pending);
  } finally { await reader.cancel().catch(() => {}); }
  return {finishReason, done:done || !!finishReason, usage, requestId};
}

export function chapterJobsClass(runChapter) {
  return class ChapterJobs {
    constructor(state, env) { this.state = state; this.store = state.storage; this.env = env; }

    saveJob(job) {
      return this.store.put({[jobKey(job.id)]:job,[summaryKey(job.id)]:publicJob(job)});
    }

    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST") {
        const {job, prepared} = await req.json();
        return this.state.blockConcurrencyWhile(async () => {
          const existing = await this.store.get(jobKey(job.id));
          if (existing) {
            if (existing.fingerprint !== job.fingerprint) return json({error:"Это задание уже было принято с другим контекстом."}, 409);
            if (existing.status === "queued") await this.store.setAlarm(Date.now() + 1);
            return json({ok:true, job:publicJob(existing)}, 202);
          }
          if (await this.store.get(ACTIVE)) return json({error:"Одна глава уже пишется в фоне. Её можно открыть в фоновых главах."}, 409);
          await this.cleanup();
          const now = new Date().toISOString();
          const queued = {...job, status:"queued", text:"", createdAt:now, updatedAt:now};
          await this.store.put({[ACTIVE]:job.id, [jobKey(job.id)]:queued, [requestKey(job.id)]:prepared,
            [summaryKey(job.id)]:publicJob(queued)});
          await this.store.setAlarm(Date.now() + 1);
          return json({ok:true, job:publicJob(queued)}, 202);
        });
      }
      const id = url.searchParams.get("id");
      if (id) {
        const job = await this.store.get(jobKey(id));
        return job ? json({ok:true, job:publicJob(job, true)}) : json({error:"Глава не найдена в фоновых заданиях."}, 404);
      }
      const jobs = [...(await this.store.list({prefix:"summary:"})).values()]
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      return json({ok:true, jobs});
    }

    async cleanup() {
      const jobs = [...(await this.store.list({prefix:"summary:"})).values()];
      const oldest = Date.now() - RETENTION_MS;
      const expired = jobs.filter(job => Date.parse(job.createdAt) <= oldest &&
        job.status !== "running" && job.status !== "queued");
      for (let i = 0; i < expired.length; i += 42)
        await this.store.delete(expired.slice(i, i + 42).flatMap(job => [jobKey(job.id),summaryKey(job.id),requestKey(job.id)]));
      const remaining = jobs.filter(job => Date.parse(job.createdAt) > oldest);
      if (remaining.length) await this.store.setAlarm(Math.min(...remaining.map(job => Date.parse(job.createdAt))) + RETENTION_MS + 1);
    }

    async alarm() {
      const claimed = await this.state.blockConcurrencyWhile(async () => {
        const id = await this.store.get(ACTIVE);
        if (!id) { await this.cleanup(); return null; }
        const key = jobKey(id);
        const job = await this.store.get(key);
        if (job?.status === "running" && Date.now() - Date.parse(job.startedAt) < GENERATION_MS) return null;
        if (job?.status !== "queued") return {id,job};
        job.status = "running";
        job.startedAt = job.updatedAt = new Date().toISOString();
        await this.store.setAlarm(Date.now() + GENERATION_MS + 30000);
        await this.saveJob(job);
        const prepared = await this.store.get(requestKey(id));
        await this.store.delete(requestKey(id));
        return {id,job,prepared};
      });
      if (!claimed) return;
      const {id,job,prepared} = claimed;
      let costReceipt;
      try {
        if (!prepared) throw Error("Выдача прервалась. Сохранившийся текст доступен в этом задании.");
        const response = await runChapter(prepared, this.env, AbortSignal.timeout(GENERATION_MS));
        if (!response.ok || !response.body) {
          const error = await response.json().catch(() => ({}));
          throw Error(error.error || "Провайдер не вернул поток главы.");
        }
        const requestId = response.headers.get("X-Freitag-Request-Id");
        if (requestId) job.requestId = requestId;
        let savedAt = 0, savedLength = 0;
        const result = await receiveChapter(response.body, async fragment => {
          if (job.text.length + fragment.length > MAX_OUTPUT) throw Error("Достигнут предел хранения текста главы.");
          job.text += fragment;
          const now = Date.now();
          if (now - savedAt >= 3000 || job.text.length - savedLength >= 6000) {
            job.updatedAt = new Date(now).toISOString();
            await this.saveJob(job);
            savedAt = now;
            savedLength = job.text.length;
          }
        });
        job.finishReason = result.finishReason;
        if(!job.requestId && result.requestId)job.requestId=result.requestId;
        costReceipt = result.usage;
        job.status = job.text && result.done && (!result.finishReason || result.finishReason === "stop") ? "completed" : "incomplete";
        if (job.status === "incomplete") job.error = job.text ? "Выдача прервалась или достигла лимита ответа." : "Модель не вернула текст.";
      } catch (error) {
        if (job) {
          job.status = job.text ? "incomplete" : "failed";
          job.error = error?.name === "TimeoutError" ? "Истекло время ожидания главы." :
            String(error?.message || "Фоновое задание завершилось ошибкой.").slice(0, 280);
        }
      } finally {
        if (job) {
          if (costReceipt) job.usage = costReceipt;
          job.updatedAt = new Date().toISOString();
          await this.saveJob(job);
        }
        await this.store.delete([ACTIVE, requestKey(id)]);
        await this.store.deleteAlarm();
        await this.cleanup();
      }
    }
  };
}

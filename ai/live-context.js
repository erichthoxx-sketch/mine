// Freitag AI: refresh the selected book from Google Docs, then publish it to the
// owner's existing Cloudflare KV before ANY paid model call.
// Only sends the selected book; never changes the source manuscript.
import * as drive from "../writer/js/drive.js";
import { bookSnapshot } from "../writer/js/bookai.js";
import { master } from "./master-sync.js";

// Call directly from the user's Send click BEFORE other awaits, or Google's
// OAuth token popup can be blocked by the browser. Reuses a valid Drive token.
export async function ensureDriveAccess(bookId) {
  if (bookId) await drive.ensureToken();
}

export async function refreshLinkedBook({ bookId, gateway, idToken, fetcher = fetch }) {
  if (!bookId || !/^[a-z0-9_-]{1,100}$/i.test(bookId))
    throw Error("Книга не связана с Мастерской.");
  if (!gateway || !idToken) throw Error("Не подтвержден доступ к Мастерской.");
  // Firebase network read: do not trust locally stored canon or book metadata.
  const books = await master.refresh();
  const current = books.find(b => b.id === bookId);
  if (!current) throw Error("Эта книга больше не доступна в Мастерской.");
  if (!current.fileId) throw Error("У книги нет Google Документа. Привяжи рукопись в Мастерской.");
  // Always read the ACTUAL Google Doc / DOCX at send time. No stale fallback.
  const snapshot = await bookSnapshot(current);
  if (!Array.isArray(snapshot.chapters) || !snapshot.chapters.length ||
      !snapshot.chapters.some(ch => String(ch.text || "").trim()))
    throw Error("Не удалось получить главы из Google Docs. Платный запрос не отправлен.");
  const res = await fetcher(gateway + "/refresh-book", {
    method: "POST", cache: "no-store",
    headers: { Authorization: "Bearer " + idToken, "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  });
  let status;
  try { status = await res.json(); } catch { throw Error("Сервер не подтвердил получение книги."); }
  if (!res.ok || !status.ok || status.chapterCount !== snapshot.chapters.length)
    throw Error(status.error || "Cloudflare не подтвердил обновление рукописи.");
  return { status, canon: master.canonicalText(current), book: current };
}

export const MAX_MATERIAL_LENGTH = 2 * 1024 * 1024;
const MAX_WORD_FILE = 10 * 1024 * 1024;
const MAX_WORD_XML = 8 * 1024 * 1024;
let zipLoader;

function loadWordReader() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  zipLoader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../js/vendor/jszip.min.js", import.meta.url).href;
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(Error("Не удалось загрузить модуль Word. Обнови страницу."));
    document.head.append(script);
  }).catch(error => { zipLoader = null; throw error; });
  return zipLoader;
}

function readWordXml(entry) {
  return new Promise((resolve, reject) => {
    const pieces = [];
    let length = 0;
    const stream = entry.internalStream("uint8array");
    stream.on("data", bytes => {
      length += bytes.length;
      if (length > MAX_WORD_XML) {
        stream.pause();
        reject(Error("Текст в файле Word слишком большой. Раздели его на несколько файлов."));
        return;
      }
      pieces.push(bytes);
    }).on("end", async () => {
      try {
        const bytes = new Uint8Array(await new Blob(pieces).arrayBuffer());
        const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" :
          bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
        resolve(new TextDecoder(encoding).decode(bytes));
      } catch (error) { reject(error); }
    }).on("error", reject).resume();
  });
}

function wordDocumentText(xml) {
  if (/<!DOCTYPE/i.test(xml)) throw Error("Не удалось прочитать текст Word.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  const namespace = root.namespaceURI;
  if (root.localName !== "document" || !["http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main"].includes(namespace))
    throw Error("Не удалось прочитать текст Word.");
  const body = root.getElementsByTagNameNS(namespace, "body")[0];
  if (!body) throw Error("В файле Word нет основного текста.");
  function paragraph(node) {
    const fragments = [];
    for (const child of node.children) {
      if (child.namespaceURI !== namespace) continue;
      switch (child.localName) {
        case "t": fragments.push(child.textContent); break;
        case "tab": fragments.push("\t"); break;
        case "br": case "cr": fragments.push("\n"); break;
        case "noBreakHyphen": fragments.push("‑"); break;
        case "p": case "del": case "moveFrom": break;
        default: fragments.push(paragraph(child));
      }
    }
    return fragments.join("");
  }
  return Array.from(body.getElementsByTagNameNS(namespace, "p"), paragraph).join("\n");
}

export async function readMaterial(file) {
  const extension = /\.(docx|txt|md|json)$/i.exec(file.name)?.[1].toLowerCase();
  if (!extension) throw Error("Выбери файл Word (.docx), TXT, Markdown или JSON.");
  const word = extension === "docx";
  if (file.size > (word ? MAX_WORD_FILE : MAX_MATERIAL_LENGTH))
    throw Error("Файл слишком большой. Предел — " + (word ? "10 МБ для Word." : "2 МБ для текстовых файлов."));
  let text;
  if (word) {
    const Zip = await loadWordReader();
    const zip = await Zip.loadAsync(await file.arrayBuffer()).catch(() => null);
    const entry = zip?.file("word/document.xml");
    if (!entry) throw Error("В этом файле нет читаемого документа Word (.docx).");
    text = wordDocumentText(await readWordXml(entry));
  } else text = await file.text();
  if (!text.trim()) throw Error("В файле нет текста.");
  if (text.length > MAX_MATERIAL_LENGTH) throw Error("В материале больше двух миллионов знаков. Раздели текст на части.");
  return {text, format:extension};
}

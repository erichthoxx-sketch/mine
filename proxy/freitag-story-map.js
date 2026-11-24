const normalize = text => text.toLowerCase().replace(/ё/g, "е");
const letter = /[\p{L}\p{N}]/u;
const separator = /^[ \t]*(?:(?:\*[ \t]*){3,}|(?:#[ \t]*){3,}|(?:~[ \t]*){3,}|Сцена[ \t]+\d+(?:[.: —–-].*)?)[ \t\r]*$/gimu;

export function storySections(text) {
  const sections = [];
  let offset = 0, title = "", scene = 1;
  const add = end => {
    if (text.slice(offset, end).trim()) sections.push({scene:scene++, offset, end, title});
  };
  for (const marker of text.matchAll(separator)) {
    add(marker.index);
    offset = marker.index + marker[0].length;
    title = /^сцена/i.test(marker[0].trim()) ? marker[0].trim().slice(0, 100) : "";
  }
  add(text.length);
  return sections;
}

function reference(chapter, number, section, offset, snippet) {
  return {chapter:number, title:String(chapter.title || "").slice(0, 120),
    scene:section.scene, heading:section.title, offset, snippet};
}

export function storyMap(snapshot, {chapter = 0, query = ""} = {}) {
  const chapters = snapshot.chapters.map(({title, text}, index) =>
    ({chapter:index + 1, title:String(title || "").slice(0, 120), characters:text.length}));
  if (query) return {chapters, matches:findStoryPassages(snapshot.chapters, {query, chapter, count:12, size:420})};
  if (!chapter) return {chapters};
  const selected = snapshot.chapters[chapter - 1];
  return {chapters, matches:storySections(selected.text).map(section => {
    const snippet = selected.text.slice(section.offset, Math.min(section.end, section.offset + 280)).trim();
    return reference(selected, chapter, section, section.offset, snippet);
  })};
}

export function findStoryPassages(chapters, {terms = [], supporting = [], query = "", chapter = 0,
  skip = new Set(), count = 3, size = 740} = {}) {
  const focus = query ? [normalize(query)] : terms;
  const keywords = [...new Set([...focus, ...supporting])];
  if (!keywords.length || size < 80) return [];
  const hits = [], frequencies = new Map();
  for (const [index, source] of chapters.entries()) {
    const number = index + 1;
    if (skip.has(number) || (chapter && number !== chapter) || typeof source?.text !== "string") continue;
    const normalized = normalize(source.text);
    const windows = new Map();
    for (const keyword of keywords) {
      let found = false, at = normalized.indexOf(keyword);
      while (at !== -1) {
        if (query || at === 0 || !letter.test(normalized[at - 1])) {
          const position = Math.floor(at / 460);
          const window = windows.get(position) || {at, terms:new Set()};
          window.terms.add(keyword);
          windows.set(position, window);
          found = true;
        }
        at = normalized.indexOf(keyword, at + keyword.length);
      }
      if (found) frequencies.set(keyword, (frequencies.get(keyword) || 0) + 1);
    }
    for (const window of windows.values()) hits.push({...window, number});
  }
  const score = hit => [...hit.terms].reduce((total, term) =>
    total + (focus.includes(term) ? 3 : 1) / Math.sqrt(frequencies.get(term)), 0);
  for (const hit of hits) hit.score = score(hit);
  hits.sort((a, b) => b.score - a.score || a.number - b.number || a.at - b.at);
  const chosen = [], sections = new Map();
  for (const hit of hits) {
    if (chosen.some(p => p.chapter === hit.number && (!query || Math.abs(p.offset - hit.at) < size))) continue;
    const source = chapters[hit.number - 1];
    if (!sections.has(hit.number)) sections.set(hit.number, storySections(source.text));
    const section = sections.get(hit.number).find(row => row.offset <= hit.at && hit.at < row.end);
    if (!section) continue;
    const from = Math.max(section.offset, hit.at - Math.floor(size / 4));
    const snippet = source.text.slice(from, Math.min(section.end, from + size)).trim();
    if (snippet) chosen.push(reference(source, hit.number, section, hit.at, snippet));
    if (chosen.length >= count) break;
  }
  return chosen;
}

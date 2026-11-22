// Readable HTML-escaped Markdown for the author workspace.
// No HTML pass-through, untrusted links or arbitrary embeds.
const escapeHtml=text=>String(text??"").replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
function inline(text){
  const chunks=[];
  let s=String(text??"").replace(/\x60([^\x60]+)\x60/g,(_,code)=>{
    const id=chunks.length;
    chunks.push("<code>"+escapeHtml(code)+"</code>");
    return "\u0000"+id+"\u0000";
  });
  s=escapeHtml(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g,"$1<em>$2</em>");
  s=s.replace(/\[([^\]]+)\]\((https:\/\/[^()\s]+)\)/g,(_,label,url)=>
    '<a target="_blank" rel="noopener noreferrer" href="'+url+'">'+label+'</a>');
  return s.replace(/\u0000(\d+)\u0000/g,(_,n)=>chunks[Number(n)]||"");
}
export function renderMarkdown(input){
  const lines=String(input??"").replace(/\r\n?/g,"\n").split("\n");
  const out=[];
  let paragraph=[],listType=null,codeLines=null,codeLang="";
  const endParagraph=()=>{
    if(paragraph.length){out.push("<p>"+paragraph.map(inline).join("<br>")+"</p>");paragraph=[];}
  };
  const endList=()=>{if(listType){out.push("</"+listType+">");listType=null;}};
  for(const line of lines){
    const trimmed=line.trim();
    if(codeLines){
      if(/^\x60{3}/.test(trimmed)){
        out.push('<pre><code'+(codeLang?' data-lang="'+escapeHtml(codeLang)+'"':"")+'>'
          +escapeHtml(codeLines.join("\n"))+'</code></pre>');
        codeLines=null;codeLang="";continue;
      }
      codeLines.push(line);continue;
    }
    if(/^\x60{3}/.test(trimmed)){
      endParagraph();endList();codeLines=[];codeLang=trimmed.slice(3).slice(0,32);continue;
    }
    if(!trimmed){endParagraph();endList();continue;}
    const heading=trimmed.match(/^(#{1,3})\s+(.+)$/);
    if(heading){endParagraph();endList();const level=Math.min(heading[1].length+2,5);
      out.push("<h"+level+">"+inline(heading[2])+"</h"+level+">");continue;}
    if(/^(-{3,}|\*{3,})$/.test(trimmed)){endParagraph();endList();out.push("<hr>");continue;}
    const bullet=trimmed.match(/^([-*+]|\d+\.)\s+(.+)$/);
    if(bullet){
      endParagraph();const next=/^\d+\.$/.test(bullet[1])?"ol":"ul";
      if(listType!==next){endList();listType=next;out.push("<"+next+">");}
      out.push("<li>"+inline(bullet[2])+"</li>");continue;
    }
    if(trimmed.startsWith("> ")){endParagraph();endList();out.push("<blockquote>"+inline(trimmed.slice(2))+"</blockquote>");continue;}
    endList();paragraph.push(line);
  }
  endParagraph();endList();
  if(codeLines)out.push("<pre><code>"+escapeHtml(codeLines.join("\n"))+"</code></pre>");
  return out.join("\n");
}

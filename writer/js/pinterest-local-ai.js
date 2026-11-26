// Не используем произвольный внешний URL, ключи и облачные модели.
import { agentPrompt, parseAgentIdeas } from './pinterest.js';
const fields=['bookId','kind','reason','title','description','board','keywords','prompt'];
export function localRequest(books,pins,author,focus,model) {
  const name=String(model||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,100}$/.test(name)||/cloud/i.test(name))throw Error('Укажите название установленной локальной модели Ollama (не cloud)');
  const schema={type:'object',required:['ideas'],additionalProperties:false,properties:{ideas:{type:'array',minItems:1,maxItems:8,items:{type:'object',required:fields,additionalProperties:false,properties:Object.fromEntries(fields.map(k=>[k,k==='bookId'?{type:'string',enum:books.map(b=>b.id)}:{type:'string'}]))}}}};
  if(!books.length)throw Error('Нет книг для рекомендаций');
  return {model:name,stream:false,format:schema,options:{temperature:0.4,num_predict:3500,num_ctx:8192},messages:[{role:'user',content:agentPrompt(books,pins,author,focus)+'\nДля этого вызова оберни массив в объект {"ideas":[...]}. Не используй облачные инструменты.'}]};
}
export async function localIdeas({books,pins,author,focus,model,fetcher=fetch}){
  const body=localRequest(books,pins,author,focus,model),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),180000);
  try{
    let response;
    try{response=await fetcher('http://localhost:11434/api/chat',{method:'POST',mode:'cors',credentials:'omit',redirect:'error',targetAddressSpace:'loopback',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});}
    catch{throw Error('Ollama не отвечает: проверьте запуск, разрешение доступа браузера и модель. Можно использовать импорт JSON.');}
    if(!response.ok)throw Error('Ollama вернула HTTP '+response.status+'. Проверьте имя модели.');
    const data=await response.json();
    if(data.done_reason==='length')throw Error('Модель не закончила ответ. Попробуйте меньше книг или ручной импорт.');
    let parsed;try{parsed=JSON.parse(data.message?.content||'');}catch{throw Error('Модель вернула некорректный JSON');}
    return parseAgentIdeas(JSON.stringify(parsed.ideas),books);
  }finally{clearTimeout(timer);}
}

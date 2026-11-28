// Private, strongly consistent storage for this OAuth issuer only.
import { DurableObject } from 'cloudflare:workers';
export class OAuthRecords extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (name TEXT PRIMARY KEY, value TEXT, metadata TEXT, expires INTEGER)');
  }
  get(name, options={}){
    const row=this.sql.exec('SELECT value FROM records WHERE name=? AND (expires IS NULL OR expires>unixepoch())',name).toArray()[0];
    if(!row)return null;
    return (options==='json'||options?.type==='json')?JSON.parse(row.value):row.value;
  }
  async put(name,value,options={}){
    const expires=options.expiration??(options.expirationTtl?Math.floor(Date.now()/1000)+options.expirationTtl:null);
    this.sql.exec('INSERT OR REPLACE INTO records VALUES (?,?,?,?)',name,value,JSON.stringify(options.metadata??null),expires);
    if(expires && await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+3600000);
  }
  delete(name){this.sql.exec('DELETE FROM records WHERE name=?',name);}
  list({prefix='',cursor='',limit=1000}={}){
    const rows=this.sql.exec('SELECT name,metadata,expires FROM records WHERE substr(name,1,length(?))=? AND name>? AND (expires IS NULL OR expires>unixepoch()) ORDER BY name LIMIT ?',prefix,prefix,cursor,limit+1).toArray();
    const keys=rows.slice(0,limit).map(r=>({name:r.name,metadata:JSON.parse(r.metadata),expiration:r.expires??undefined}));
    return {keys,list_complete:rows.length<=limit,cursor:rows.length>limit?keys.at(-1).name:''};
  }
  async alarm(){
    this.sql.exec('DELETE FROM records WHERE expires<=unixepoch()');
    if(this.sql.exec('SELECT 1 FROM records WHERE expires IS NOT NULL LIMIT 1').toArray().length)
      await this.ctx.storage.setAlarm(Date.now()+3600000);
  }
}

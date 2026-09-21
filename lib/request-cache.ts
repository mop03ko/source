type Entry={value:unknown;updatedAt:number};

/** A bounded, in-memory cache owned by one authenticated CRM instance. */
export class RequestCache {
 private entries=new Map<string,Entry>();
 private pending=new Map<string,Promise<unknown>>();
 private generation=0;
 constructor(readonly scope:string,readonly ttl=30_000,private limit=12,private now=()=>Date.now()){}
 peek<T>(key:string):T|null{return (this.entries.get(key)?.value as T)??null;}
 fresh(key:string){const entry=this.entries.get(key);return !!entry&&this.now()-entry.updatedAt<this.ttl;}
 invalidate(){this.generation++;this.entries.clear();this.pending.clear();}
 async read<T>(key:string,fetcher:()=>Promise<T>):Promise<T>{
  if(this.fresh(key))return this.peek<T>(key)!;
  const existing=this.pending.get(key);if(existing)return existing as Promise<T>;
  const generation=this.generation;
  const request=Promise.resolve().then(fetcher).then(value=>{
   if(generation===this.generation){
    this.entries.delete(key);this.entries.set(key,{value,updatedAt:this.now()});
    while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value!);
   }
   return value;
  }).finally(()=>{if(this.pending.get(key)===request)this.pending.delete(key);});
  this.pending.set(key,request);return request;
 }
}

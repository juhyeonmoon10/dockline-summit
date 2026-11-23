import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root=resolve(process.argv[2]||'dist');
const versioned=new Map(),imports={};
async function indexFiles(dir=''){
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})){
    const file=dir?dir+'/'+entry.name:entry.name;
    if(entry.isDirectory()){await indexFiles(file);continue;}
    if(!/\.js$|\.css$|(?:^|\/)loadout-[^/]+\.png$/.test(file))continue;
    const bytes=await readFile(join(root,file));
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
    const path='./'+file,url=path+'?v='+hash;
    versioned.set(path,url);
    if(file.endsWith('.js'))imports[path]=url;
  }
}
await indexFiles();
const index=join(root,'index.html'),html=await readFile(index,'utf8');
// Static and dynamic imports must resolve to the same module when a returning
// player still has older files cached. Keep unchanged libraries cacheable.
const page=html.replace(/(src|href)="(\.\/[^"]+)"/g,(original,attr,path)=>
  versioned.has(path)?attr+'="'+versioned.get(path)+'"':original
).replace('<script type="module"', '<script type="importmap">'+JSON.stringify({imports})+'</script>\n  <script type="module"');
await writeFile(index,page);

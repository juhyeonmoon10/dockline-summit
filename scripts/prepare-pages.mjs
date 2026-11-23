import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';

const root=resolve(process.argv[2]||'dist');
const versioned=new Map(),imports={};
async function indexFiles(dir=''){
  for(const entry of await readdir(join(root,dir),{withFileTypes:true})){
    const file=dir?dir+'/'+entry.name:entry.name;
    if(entry.isDirectory()){await indexFiles(file);continue;}
    const atlas=/^assets\/[^/]+\.webp$/.test(file);
    if(!atlas&&!/\.js$|\.css$|(?:^|\/)loadout-[^/]+\.png$/.test(file))continue;
    const bytes=await readFile(join(root,file));
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,12);
    const path='./'+file,url=path+'?v='+hash;
    versioned.set(path,url);
    if(file.endsWith('.js')||file.endsWith('.png')||atlas)imports[path]=url;
  }
}
// Module workers do not receive the page import map. Each published set of
// match rules gets its own URL directory so a returning host loads a matching set.
const workerModules=new Map();
async function collectWorker(file){
  if(workerModules.has(file))return;
  const code=await readFile(join(root,file),'utf8');
  workerModules.set(file,code);
  for(const match of code.matchAll(/^import\s+[^'";]*?from\s+['"](\.[^'"]+)['"]/gm)){
    await collectWorker(posix.join(posix.dirname(file),match[1]));
  }
}
await collectWorker('online-worker.js');
const workerHash=createHash('sha256');
for(const [file,code] of workerModules)workerHash.update(file).update('\0').update(code);
const engine='room-engine-'+workerHash.digest('hex').slice(0,12);
await indexFiles();
for(const [file,code] of workerModules){
  const dest=join(root,engine,file);
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,code);
}
imports['./online-worker.js']='./'+engine+'/online-worker.js';
const index=join(root,'index.html'),html=await readFile(index,'utf8');
// Static and dynamic imports must resolve to the same module when a returning
// player still has older files cached. Keep unchanged libraries cacheable.
const page=html.replace(/(src|href)="(\.\/[^"]+)"/g,(original,attr,path)=>
  versioned.has(path)?attr+'="'+versioned.get(path)+'"':original
).replace('<script type="module"', '<script type="importmap">'+JSON.stringify({imports})+'</script>\n  <script type="module"');
await writeFile(index,page);

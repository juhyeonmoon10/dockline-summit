import {assetUrl} from './asset-url.js';

const catalog=new Set(['rifle','sniper','smg','burst','marksman','lmg','pistol','revolver','karambit','balisong']);
const carried=new Map(),requests=new Map();
export const armoryBytes=encoded=>Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
export const armoryPositions=encoded=>Float32Array.from(new Int16Array(armoryBytes(encoded).buffer),n=>n*.0001);
export async function armoryData(id){
  if(!catalog.has(id))return null;
  return (await import(assetUrl('armory-'+id+'-data.js'))).assetData;
}

export const cachedCarriedArmory=id=>carried.get(id);
export function loadCarriedArmory(id){
  if(!catalog.has(id))return Promise.resolve(null);
  if(!requests.has(id)){
    const request=armoryData(id).then(data=>{
      const parts={};
      for(const [name,src] of Object.entries(data.carried??data.preview)){
        parts[name]={
          position:armoryPositions(src.positions),
          color:armoryBytes(src.colors),index:new Uint16Array(armoryBytes(src.faces).buffer)
        };
      }
      carried.set(id,parts);return parts;
    }).catch(()=>null);
    requests.set(id,request);
  }
  return requests.get(id);
}

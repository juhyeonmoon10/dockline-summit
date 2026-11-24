import {assetUrl} from './asset-url.js';

const catalog=new Set(['rifle','shotgun','sniper','smg','burst','marksman','lmg','pistol','revolver','karambit','balisong']);
const carried=new Map(),requests=new Map();
export const armoryBytes=encoded=>Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
export const armoryPositions=encoded=>Float32Array.from(new Int16Array(armoryBytes(encoded).buffer),n=>n*.0001);
export async function armoryData(id){
  if(!catalog.has(id))return null;
  if(id==='shotgun')return (await import(assetUrl('dockline-shotgun-data.js'))).shotgunData;
  return (await import(assetUrl('armory-'+id+'-data.js'))).assetData;
}

export const cachedCarriedArmory=id=>carried.get(id);
function decodeParts(sources){
  const parts={};
  for(const [name,src] of Object.entries(sources)){
    parts[name]={
      position:armoryPositions(src.positions),
      color:armoryBytes(src.colors),index:new Uint16Array(armoryBytes(src.faces).buffer)
    };
  }
  return parts;
}
export function loadCarriedArmory(id){
  if(!catalog.has(id))return Promise.resolve(null);
  if(!requests.has(id)){
    const request=armoryData(id).then(data=>{
      if(id==='shotgun'&&!data.carried)return null;
      const parts=decodeParts(data.carried??data.preview);
      if(id==='revolver'&&data.completeExterior&&data.preview.drum)parts.reload=decodeParts(data.preview);
      if(data.completeExterior&&parts.body)parts.body.completeExterior=true;
      carried.set(id,parts);return parts;
    }).catch(()=>null);
    requests.set(id,request);
  }
  return requests.get(id);
}

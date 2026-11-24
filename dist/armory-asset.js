import * as T from './assets/three.module.min.js';
import {assetUrl} from './asset-url.js';
import {armoryBytes as bytes,armoryData,armoryPositions} from './armory-data.js';
export {cachedCarriedArmory,loadCarriedArmory} from './armory-data.js';

const pending=new Map(),loaded=new Map();
const toLinear=Float32Array.from({length:256},(_,i)=>{
  const c=i/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
});

export function decodeArmoryGeometry(source){
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(armoryPositions(source.positions),3));
  geo.setAttribute('normal',new T.Int8BufferAttribute(new Int8Array(bytes(source.normals).buffer),3,true));
  geo.setAttribute('color',new T.Float32BufferAttribute(Float32Array.from(bytes(source.colors),n=>toLinear[n]),3));
  if(source.uv)geo.setAttribute('uv',new T.Uint16BufferAttribute(new Uint16Array(bytes(source.uv).buffer),2,true));
  geo.setIndex(new T.BufferAttribute(new Uint16Array(bytes(source.faces).buffer),1));
  geo.computeBoundingSphere();return geo;
}

async function material(id,maps=[]){
  const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.73,metalness:.20});
  if(typeof document==='undefined')return paint;
  const loader=new T.TextureLoader();
  // A missing detail map should still leave the textured, or vertex-painted,
  // replacement playable on a spotty festival connection.
  await Promise.allSettled(['base',...maps].map(async name=>{
    const suffix=name==='base'?'':'-'+name;
    const texture=await loader.loadAsync(assetUrl('armory-'+id+suffix+'.webp'));
    texture.flipY=false;texture.anisotropy=4;
    if(name==='base'){texture.colorSpace=T.SRGBColorSpace;paint.map=texture;paint.vertexColors=false;}
    if(name==='normal'){paint.normalMap=texture;paint.normalScale.setScalar(.42);}
    if(name==='orm'){
      paint.roughnessMap=paint.metalnessMap=texture;paint.roughness=paint.metalness=1;
    }
  }));
  return paint;
}

async function readAsset(id){
  const assetData=await armoryData(id);
  if(!assetData)return null;
  const paint=await material(id,assetData.maps);
  const parts={};
  for(const [name,source] of Object.entries(assetData.held)){
    const mesh=new T.Mesh(decodeArmoryGeometry(source),paint);mesh.name=name;
    mesh.userData.previewGeometry=decodeArmoryGeometry(assetData.preview[name]);
    parts[name]=mesh;
  }
  loaded.set(id,parts);return parts;
}

export const cachedArmoryAsset=id=>loaded.get(id);
export function loadArmoryAsset(id){
  if(!pending.has(id)){
    pending.set(id,readAsset(id).catch(()=>{
      // A player can keep playing with the original art after a failed download.
      pending.delete(id);return null;
    }));
  }
  return pending.get(id);
}

export function copyArmoryPart(template){
  const copy=new T.Mesh(template.geometry,template.material);copy.name=template.name;
  copy.userData.previewGeometry=template.userData.previewGeometry;return copy;
}

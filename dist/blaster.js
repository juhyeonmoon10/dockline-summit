// Editable Quaternius CC0 sources and conversion tool: art-source/toon-shooter.
import * as T from './assets/three.module.min.js';
import { guns } from './assets/toon-guns.js';

const cache=new Map();
const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.46,metalness:.27});
export const gunFit={
 rifle:{muzzle:-.616,muzzleY:.075,support:-.335,grip:-.074,sight:.175,flash:.9},
 shotgun:{muzzle:-.738,muzzleY:.017,support:-.565,grip:-.068,sight:.067,flash:1.34},
 sniper:{muzzle:-.937,muzzleY:.064,support:-.397,grip:-.077,sight:.143,flash:1.17},
 pistol:{muzzle:-.327,muzzleY:.057,support:-.045,grip:-.068,sight:.103,flash:.65}
};
const bytes=str=>Uint8Array.from(atob(str),char=>char.charCodeAt(0));
function geometry(packed){
 const raw=bytes(packed[0]),view=new DataView(raw.buffer),count=raw.length/12;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new T.Color();
 for(let i=0;i<count;i++){
  const k=i*12;
  for(let c=0;c<3;c++){positions[i*3+c]=view.getInt16(k+c*2,true)*.0001;normals[i*3+c]=view.getInt8(k+6+c)/127;}
  color.setRGB(raw[k+9]/255,raw[k+10]/255,raw[k+11]/255,T.SRGBColorSpace).toArray(colors,i*3);
 }
 const indexes=bytes(packed[1]),geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('normal',new T.BufferAttribute(normals,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));geo.setIndex(new T.BufferAttribute(new Uint16Array(indexes.buffer),1));geo.computeBoundingSphere();
 return geo;
}
export function blasterMesh(kind='rifle'){
 if(!guns[kind])kind='rifle';
 if(!cache.has(kind)){
  const model=new T.Group();
  for(const [name,source] of Object.entries(guns[kind])){const part=new T.Mesh(geometry(source),paint);part.name=name;model.add(part);}
  cache.set(kind,model);
 }
 return cache.get(kind).clone();
}

import * as T from './assets/three.module.min.js';
import { propData,propBounds } from './assets/environment-props.js';
export { propBounds };
export const propKinds=Object.keys(propData);
const geometryCache=new Map(),paint=new T.MeshLambertMaterial({vertexColors:true});
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const teamColors={blue:[22,143,199],orange:[245,140,66]};
export function propGeometry(kind,variant='source'){
 if(!propData[kind])throw Error('Unknown arena prop: '+kind);
 const key=kind+'/'+variant;if(geometryCache.has(key))return geometryCache.get(key);
 const [packed,indexes]=propData[kind],raw=bytes(packed),view=new DataView(raw.buffer),count=raw.length/12;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),color=new T.Color();
 for(let i=0;i<count;i++){
  const k=i*12;for(let c=0;c<3;c++){positions[i*3+c]=view.getInt16(k+c*2,true)*.001;normals[i*3+c]=view.getInt8(k+6+c)/127;}
  let rgb=[raw[k+9],raw[k+10],raw[k+11]];
  if(teamColors[variant]&&kind==='container'){
   const shade=Math.max(.5,Math.min(1.18,(rgb[0]+rgb[1]+rgb[2])/480));rgb=teamColors[variant].map(v=>Math.min(255,Math.round(v*shade)));
  }
  color.setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,T.SRGBColorSpace).toArray(colors,i*3);
 }
 const indices=bytes(indexes),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setAttribute('color',new T.BufferAttribute(colors,3));
 geometry.setIndex(new T.BufferAttribute(new Uint16Array(indices.buffer),1));geometry.computeBoundingSphere();geometry.computeBoundingBox();geometryCache.set(key,geometry);return geometry;
}
// X/Z centred and feet at Y=0. Dimensions are exported in propBounds.
// Geometry and material are shared; transforms on returned meshes are independent.
export function propMesh(kind,variant='source'){
 const mesh=new T.Mesh(propGeometry(kind,variant),paint);mesh.name='kenney-'+kind;mesh.userData.propKind=kind;return mesh;
}

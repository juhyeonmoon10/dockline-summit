// Export the game's visual fit guides in their posed, local coordinates.
import fs from 'node:fs';
import * as T from '../../dist/assets/three.module.min.js';
import {blasterMesh} from '../../dist/blaster.js';

const [id,file]=process.argv.slice(2),model=blasterMesh(id),parts=[];
const moving=new Set(['magazine','bolt','reflex-sight','scope-housing','ocular-glass','cylinder-hinge','hammer','iron-sights']);
model.updateMatrixWorld(true);
for(const root of model.children){
  root.traverseVisible(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry,{position,normal,color}=geometry.attributes;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.every(m=>m.transparent&&m.opacity<.5))return;
    const points=[],normals=[],rgb=[],v=new T.Vector3(),tint=new T.Color();
    const mat=new T.Matrix3().getNormalMatrix(object.matrixWorld);
    for(let i=0;i<position.count;i++){
      v.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);points.push(...v.toArray());
      v.fromBufferAttribute(normal,i).applyMatrix3(mat).normalize();normals.push(...v.toArray());
      tint.copy(materials[0].color);
      if(color)tint.multiply(new T.Color().fromBufferAttribute(color,i));
      tint.convertLinearToSRGB();rgb.push(...tint.toArray().map(c=>Math.round(Math.min(1,c)*255)));
    }
    const faces=Array.from(geometry.index?.array??Array.from({length:position.count},(_,i)=>i));
    parts.push({name:object.name,action:moving.has(root.name),points,normals,rgb,faces});
  });
}
fs.writeFileSync(file,JSON.stringify(parts));

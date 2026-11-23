import * as T from './assets/three.module.min.js';
import { knifeParts,knifeAngles,knifePartPose } from './knife-art.js';

const templates=new Map();
// A small tiled finish gives the armory closeup brushed flats and a woven grip.
// Pixel data is generated once. The base vertex colours remain usable in software.
function finishTexture(kind){
  const n=128,bytes=new Uint8Array(n*n*4);
  let seed=kind==='grip'?23:47;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const streak=Array.from({length:n},()=>noise());
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=(y*n+x)*4,matte=noise(),row=streak[x];
    const weave=(Math.cos((x+y)*Math.PI/4)+Math.cos((x-y)*Math.PI/4))*.25+.5;
    const tone=kind==='grip'?211+25*weave+19*matte:228+18*row+9*matte;
    bytes[k]=bytes[k+1]=bytes[k+2]=tone;bytes[k+3]=255;
  }
  const texture=new T.DataTexture(bytes,n,n);
  texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  texture.needsUpdate=true;return texture;
}
const materials={};
for(const [key,roughness,metalness] of [['steel',.31,.39],['grip',.76,.08],['hardware',.44,.30]]){
  materials[key]=new T.MeshStandardMaterial({vertexColors:true,roughness,metalness,side:T.DoubleSide,map:finishTexture(key)});
}
const restPose={x:0,y:0,z:0,rx:0,ry:0,rz:0};
export const knifeFit={muzzle:-.10,muzzleY:.35,support:0,grip:-.075,sight:0,flash:0};

function buildMesh(part){
  const geom=new T.BufferGeometry(),linear=new Float32Array(part.positions.length);
  const uv=new Float32Array(part.colors.length*6);
  const color=new T.Color();
  for(let f=0;f<part.colors.length;f++){
    color.setHex(part.colors[f]);
    for(let j=0;j<3;j++){
      const i=f*3+j,k=i*3;
      color.toArray(linear,k);
      uv[2*i]=part.positions[k]*8+part.positions[k+2]*2;
      uv[2*i+1]=part.positions[k+1]*(part.finish==='grip'?8:2.8);
    }
  }
  geom.setAttribute('position',new T.BufferAttribute(part.positions,3));
  geom.setAttribute('color',new T.BufferAttribute(linear,3));
  geom.setAttribute('uv',new T.BufferAttribute(uv,2));
  geom.computeVertexNormals();geom.computeBoundingSphere();
  const mesh=new T.Mesh(geom,materials[part.finish]);mesh.name=part.name;
  mesh.position.fromArray(part.pivot);return mesh;
}
// Geometry and material can be shared. Each clone owns its moving hinges.
export function knifeMesh(skin='karambit'){
  skin=skin==='balisong'?'balisong':'karambit';
  if(!templates.has(skin)){
    const group=new T.Group();group.name=skin;
    for(const part of knifeParts(skin))group.add(buildMesh(part));
    templates.set(skin,group);
  }
  return templates.get(skin).clone();
}
export function animateKnife(mesh,skin,drawAge=Infinity,inspectAge=Infinity){
  if(skin!=='balisong')return;
  const parts=knifeParts(skin),angles=knifeAngles(skin,drawAge,inspectAge);
  for(let i=0;i<parts.length;i++){
    const node=mesh.children[i],pose=knifePartPose(parts[i],angles);
    node.position.set(pose.x,pose.y,pose.z);node.rotation.z=pose.rz;
  }
}

// Wind-up, a quick crossing cut at 100 ms, then a longer readable recovery.
export function knifePose(age,side=1){
  if(age<0||age>=.55)return restPose;
  const frames=[
    [0,0,0,0,0,0,0],
    [.045,.035,.025,.035,-.10,-.25*side,-.25*side],
    [.105,-.35,-.025*side,-.15,.40,.52*side,1.34*side],
    [.190,-.26,-.09*side,-.08,.30,.26*side,.92*side],
    [.55,0,0,0,0,0,0]
  ];
  let i=1;while(i<frames.length-1&&age>frames[i][0])i++;
  const a=frames[i-1],b=frames[i],f=(age-a[0])/(b[0]-a[0]),t=f*f*(3-2*f);
  const out={};for(const [index,key] of ['x','y','z','rx','ry','rz'].entries())out[key]=a[index+1]+(b[index+1]-a[index+1])*t;
  return out;
}

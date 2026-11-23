import * as T from './assets/three.module.min.js';
import { knifeParts,knifeAngles,knifePartPose } from './knife-art.js';
import { KNIFE_TIMING,KARAMBIT_RING } from './knife-types.js';
import { knifeDrawPose } from './knife-motion.js';

const templates=new Map();
// Independent colour, roughness and normal fields keep the steel satin, the
// cast hardware duller and the inset clear-coated when a reflection rolls past.
const materials=new Map();
const finishes={
  steel:{roughness:.46,metalness:.67,relief:.30},
  hardware:{roughness:.55,metalness:.63,relief:.65},
  grip:{roughness:.83,metalness:.05,relief:1.15},
  inlay:{roughness:.46,metalness:.12,relief:.39}
};
function knifeMaterial(kind){
  if(materials.has(kind))return materials.get(kind);
  const n=128,N=n*n,props=finishes[kind],albedo=new Uint8Array(N*4);
  const orm=new Uint8Array(N*4),normals=new Uint8Array(N*4),heights=new Float32Array(N);
  let seed=Object.keys(finishes).indexOf(kind)*973+41;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const band=Array.from({length:n},noise),wrap=v=>(v+n)%n;
  const rub=new Uint8Array(N);
  for(let i=0;i<(kind==='steel'?69:36);i++){
    const x=Math.floor(noise()*n),y=Math.floor(noise()*n),length=2+Math.floor(noise()**2*30),lean=(noise()-.5)*.18;
    for(let j=0;j<length;j++)rub[wrap(y+j)*n+wrap(x+Math.round(lean*j))]=1;
  }
  const tau=Math.PI*2;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const k=y*n+x,grain=noise(),u=x/n*tau,v=y/n*tau;
    const stipple=(Math.cos(u*16+v*16)*Math.cos(u*16-v*16)+1)*.5;
    const stripe=(Math.cos(u*11+3*Math.sin(v+Math.sin(u)))+1)*.5;
    let shape,base,rough;
    if(kind==='grip'){shape=.44*grain+.56*stipple;base=223+20*shape;rough=214+35*shape;}
    else if(kind==='inlay'){shape=.61*stripe+.27*band[x]+.12*grain;base=186+67*shape;rough=179+56*shape;}
    else if(kind==='steel'){shape=.55*band[x]+.45*grain;base=243+9*shape;rough=178+53*shape;}
    else{shape=.27*band[x]+.73*grain;base=228+19*shape;rough=190+52*shape;}
    const scratch=rub[k]?1:0,tone=base+scratch*4,p=k*4;
    heights[k]=shape-scratch*.3;
    albedo[p]=albedo[p+1]=albedo[p+2]=tone;albedo[p+3]=255;
    orm[p]=255;orm[p+1]=rough-scratch*39;orm[p+2]=orm[p+3]=255;
  }
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const p=(y*n+x)*4,dx=heights[y*n+wrap(x-1)]-heights[y*n+wrap(x+1)];
    const dy=heights[wrap(y-1)*n+x]-heights[wrap(y+1)*n+x];
    normals[p]=128+dx*26;normals[p+1]=128+dy*26;normals[p+2]=254;normals[p+3]=255;
  }
  function texture(data,srgb=false){
    const t=new T.DataTexture(data,n,n);
    if(srgb)t.colorSpace=T.SRGBColorSpace;
    t.wrapS=t.wrapT=T.RepeatWrapping;t.generateMipmaps=true;
    t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.needsUpdate=true;
    return t;
  }
  const mat=new T.MeshStandardMaterial({name:'knife-'+kind,vertexColors:true,roughness:props.roughness,
    metalness:props.metalness,side:T.DoubleSide,map:texture(albedo,true),roughnessMap:texture(orm),
    normalMap:texture(normals),normalScale:new T.Vector2(props.relief,props.relief),envMapIntensity:1.0});
  materials.set(kind,mat);return mat;
}

export const knifeFit={muzzle:-.10,muzzleY:.35,support:0,grip:-.075,sight:0,flash:0};

function softenSurface(geom){
  const pos=geom.attributes.position,norm=geom.attributes.normal,src=norm.array.slice(),joins=new Map();
  for(let i=0;i<pos.count;i++){
    const k=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*100000)).join(',');
    if(!joins.has(k))joins.set(k,[]);
    joins.get(k).push(i*3);
  }
  for(const ids of joins.values())for(const a of ids){
    const x=src[a],y=src[a+1],z=src[a+2];
    let xx=x,yy=y,zz=z;
    for(const b of ids){
      if(b===a||x*src[b]+y*src[b+1]+z*src[b+2]<.984)continue;
      xx+=src[b];yy+=src[b+1];zz+=src[b+2];
    }
    const length=Math.hypot(xx,yy,zz)||1;
    norm.setXYZ(a/3,xx/length,yy/length,zz/length);
  }
}
function buildMesh(part){
  const geom=new T.BufferGeometry(),linear=new Float32Array(part.positions.length);
  const uv=new Float32Array(part.colors.length*6);
  const color=new T.Color();
  for(let f=0;f<part.colors.length;f++){
    color.setHex(part.colors[f]);
    for(let j=0;j<3;j++){
      const i=f*3+j,k=i*3;
      color.toArray(linear,k);
      uv[2*i]=part.positions[k]*(part.finish==='grip'?15:7.5)+part.positions[k+2]*1.8;
      uv[2*i+1]=part.positions[k+1]*(part.finish==='grip'?14:5.5);
    }
  }
  geom.setAttribute('position',new T.BufferAttribute(part.positions,3));
  geom.setAttribute('color',new T.BufferAttribute(linear,3));
  geom.setAttribute('uv',new T.BufferAttribute(uv,2));
  geom.computeVertexNormals();softenSurface(geom);geom.computeBoundingSphere();
  let material=knifeMaterial(part.finish);
  if(part.inlays){
    const frame=[],insets=[];
    for(let f=0;f<part.colors.length;f++){
      const indices=part.inlays.some(([a,b])=>f>=a&&f<b)?insets:frame;
      indices.push(f*3,f*3+1,f*3+2);
    }
    geom.setIndex(frame.concat(insets));
    geom.addGroup(0,frame.length,0);geom.addGroup(frame.length,insets.length,1);
    material=[material,knifeMaterial('inlay')];
  }
  const mesh=new T.Mesh(geom,material);mesh.name=part.name;
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

const ringOffset=new T.Vector3();
export function animateCarriedKnife(mesh,skin,drawAge,gripY){
  if(skin==='balisong'){animateKnife(mesh,skin,drawAge);return;}
  if(drawAge>KNIFE_TIMING.karambit.draw&&mesh.userData.atGrip)return;
  const draw=knifeDrawPose(skin,drawAge);
  mesh.rotation.set(.24,-.24,-1.92+draw.turn);
  ringOffset.fromArray(KARAMBIT_RING).applyQuaternion(mesh.quaternion);
  mesh.position.set(-.018,gripY,0).sub(ringOffset);
  mesh.userData.atGrip=drawAge>=KNIFE_TIMING.karambit.draw;
}

export { knifePose } from './knife-motion.js';

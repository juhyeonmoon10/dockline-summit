// Regenerate the four Dockline loadout cards and the transparent first-person fallback atlas.
// Run with Node 18+ from any directory. All inputs ship with the game.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as T from '../../dist/assets/three.module.min.js';
import { blasterMesh, gunFit } from '../../dist/blaster.js';
import { gunModel } from '../../dist/render.js';

const assets=new URL('../../dist/assets/',import.meta.url),factor=2;
const light=new T.Vector3(-.63,.97,.41).normalize();
const srgb=n=>Math.round(255*Math.max(0,Math.min(1,n<.0031308?n*12.92:1.055*Math.pow(n,1/2.4)-.055)));

function png(width,height,pixels){
  const crcTable=Array.from({length:256},(_,i)=>{
    for(let j=0;j<8;j++)i=(i>>>1)^((i&1)?0xedb88320:0);
    return i>>>0;
  });
  function chunk(type,data){
    const result=Buffer.alloc(data.length+12);
    result.writeUInt32BE(data.length);result.write(type,4);data.copy(result,8);
    let crc=0xffffffff;
    for(const v of result.subarray(4,-4))crc=crcTable[(crc^v)&255]^(crc>>>8);
    result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);
    return result;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const stride=4*width,scan=Buffer.alloc((stride+1)*height);
  for(let y=0;y<height;y++)pixels.copy(scan,y*(stride+1)+1,y*stride,(y+1)*stride);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

// Perspective-correct triangle depth, with near clipping for the sleeves which pass the camera.
function render(root,camera,w,h){
  const width=w*factor,height=h*factor,pixels=Buffer.alloc(width*height*4),depth=new Float32Array(width*height);
  root.updateMatrixWorld(true);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
  const vec=new T.Vector3(),focal=camera.isPerspectiveCamera?1/Math.tan(camera.fov*Math.PI/360):0;
  const project=([x,y,d,r,g,b])=>[width*.5+(focal?x/d*focal*height*.5:x*width/(camera.right-camera.left)),
    height*.5-(focal?y/d*focal*height*.5:y*height/(camera.top-camera.bottom)),focal?1/d:-d,r,g,b];
  function triangle(a,b,c){
    const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(det)<.00001)return;
    const x1=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x2=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])));
    const y1=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y2=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){
      const xx=x+.5-c[0],yy=y+.5-c[1];
      const u=((b[1]-c[1])*xx+(c[0]-b[0])*yy)/det,v=((c[1]-a[1])*xx+(a[0]-c[0])*yy)/det,w=1-u-v;
      if(Math.min(u,v,w)<0)continue;
      const index=y*width+x,z=u*a[2]+v*b[2]+w*c[2];
      if(z<=depth[index])continue;
      depth[index]=z;
      for(let k=0;k<3;k++)pixels[index*4+k]=u*a[k+3]+v*b[k+3]+w*c[k+3];
      pixels[index*4+3]=255;
    }
  }
  depth.fill(-Infinity);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const {position,normal,color}=mesh.geometry.attributes,index=mesh.geometry.index?.array;
    const normals=new T.Matrix3().getNormalMatrix(mesh.matrixWorld),vertices=[];
    for(let i=0;i<position.count;i++){
      vec.fromBufferAttribute(normal,i).applyMatrix3(normals).normalize();
      const lit=.61+.15*vec.y+.51*Math.max(0,vec.dot(light));
      vec.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      vertices.push([vec.x,vec.y,-vec.z,srgb(color.getX(i)*lit),srgb(color.getY(i)*lit),srgb(color.getZ(i)*lit)]);
    }
    for(let i=0;i<(index?.length??vertices.length);i+=3){
      const tri=[0,1,2].map(k=>vertices[index?index[i+k]:i+k]),clipped=[];
      for(let j=0;j<3;j++){
        const a=tri[j],b=tri[(j+1)%3];
        if(a[2]>=camera.near)clipped.push(a);
        if((a[2]>=camera.near)!==(b[2]>=camera.near)){
          const t=(camera.near-a[2])/(b[2]-a[2]);
          clipped.push(a.map((v,k)=>v+(b[k]-v)*t));
        }
      }
      const points=clipped.map(project);
      for(let j=1;j+1<points.length;j++)triangle(points[0],points[j],points[j+1]);
    }
  });
  const result=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const rgb=[0,0,0];let count=0;
    for(let j=0;j<factor;j++)for(let i=0;i<factor;i++){
      const index=4*((y*factor+j)*width+x*factor+i);
      if(pixels[index+3]){count++;for(let k=0;k<3;k++)rgb[k]+=pixels[index+k];}
    }
    if(count){const start=4*(y*w+x);for(let k=0;k<3;k++)result[start+k]=rgb[k]/count;result[start+3]=Math.round(255*count/(factor*factor));}
  }
  return result;
}

function loadoutCard(kind){
  const model=blasterMesh(kind),box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3());
  const width=400,height=166,aspect=width/height,camera=new T.OrthographicCamera(-aspect,aspect,1,-1,.01,12);
  camera.position.copy(center).add(new T.Vector3(-2.2,.77,-.35));camera.lookAt(center);camera.updateMatrixWorld(true);
  const projected=new T.Box3(),v=new T.Vector3();
  model.traverse(part=>{if(part.isMesh){const a=part.geometry.attributes.position;for(let i=0;i<a.count;i++)projected.expandByPoint(v.fromBufferAttribute(a,i).applyMatrix4(part.matrixWorld).applyMatrix4(camera.matrixWorldInverse));}});
  const span=projected.getSize(v);const half=Math.max(span.y/2,span.x/aspect/2)*1.15;
  const projectedCenter=projected.getCenter(v);camera.translateX(projectedCenter.x);camera.translateY(projectedCenter.y);
  Object.assign(camera,{left:-half*aspect,right:half*aspect,bottom:-half,top:half});
  writeFileSync(new URL(`loadout-${kind}.png`,assets),png(width,height,render(model,camera,width,height)));
}

const ids=['smg','burst','marksman','lmg'],width=640,height=360,atlasWidth=width*2,atlasHeight=height*ids.length;
const atlas=Buffer.alloc(atlasWidth*atlasHeight*4);
for(const [row,kind] of ids.entries()){
  loadoutCard(kind);
  const fit=gunFit[kind],gun=gunModel(kind);gun.scale.setScalar(.91);
  const camera=new T.PerspectiveCamera(63,width/height,.012,4),muzzles=[];
  for(const aim of [false,true]){
    gun.position.set(aim?0:.188,aim?-(fit.sight*.91+.009):-.174,aim?-.393:-.422);
    gun.rotation.set(aim?0:.049,aim?0:.090,aim?0:-.032);
    const frame=render(gun,camera,width,height);
    for(let y=0;y<height;y++)frame.copy(atlas,4*((row*height+y)*atlasWidth+Number(aim)*width),4*y*width,4*(y+1)*width);
    const point=gun.localToWorld(new T.Vector3(0,fit.muzzleY,fit.muzzle-.036)).project(camera);
    muzzles.push([.5+point.x*.5,.5-point.y*.5].map(n=>Number(n.toFixed(3))));
  }
  console.log(kind,'hip / aimed muzzle',muzzles);
}
writeFileSync(new URL('arcade-views.png',assets),png(atlasWidth,atlasHeight,atlas));

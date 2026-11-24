import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {createCanvasPreview} from '../dist/armory-canvas.js';

test('light changes smoothly across adjacent triangles of a curved armory panel',()=>{
  let pixels;
  const ctx={createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
    putImageData:image=>{pixels=image.data;}};
  const preview=createCanvasPreview({width:64,height:32,getContext:()=>ctx});
  const panel=new T.Mesh(new T.PlaneGeometry(2,1),new T.MeshStandardMaterial({color:0x777777}));
  const {normal,position}=panel.geometry.attributes;
  for(let i=0;i<normal.count;i++)normal.setXYZ(i,position.getX(i)*.8,0,.6);
  panel.userData.previewGeometry=panel.geometry;
  preview.render(panel,2);
  const row=Array.from({length:56},(_,i)=>pixels[4*(16*64+i+4)]);
  assert.ok(new Set(row).size>12,'the panel should contain a continuous highlight');
  for(let i=1;i<row.length;i++)assert.ok(Math.abs(row[i]-row[i-1])<5,'visible triangle boundary');
});

test('the software armory uses a textured panel’s local metal and roughness values',t=>{
  const image=(width,height,data)=>({width,height,data:Uint8ClampedArray.from(data)});
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  t.after(()=>{
    if(original)Object.defineProperty(globalThis,'document',original);
    else delete globalThis.document;
  });
  globalThis.document={createElement:()=>{
    let source;
    return {getContext:()=>({drawImage:im=>{source=im;},getImageData:()=>source})};
  }};
  const base=new T.Texture(image(1,1,[72,72,72,255]));
  const finish=new T.Texture(image(2,1,[255,45,235,255,255,225,5,255]));
  const panel=new T.Mesh(new T.PlaneGeometry(2,1,2,1),new T.MeshStandardMaterial({
    map:base,metalness:1,roughness:1,metalnessMap:finish,roughnessMap:finish
  }));
  const normals=panel.geometry.attributes.normal;
  for(let i=0;i<normals.count;i++)normals.setXYZ(i,0,.335,.942);
  panel.userData.previewGeometry=panel.geometry;
  let frame;
  const ctx={createImageData:(w,h)=>image(w,h,new Uint8ClampedArray(w*h*4)),putImageData:im=>{frame=im.data;}};
  createCanvasPreview({width:64,height:32,getContext:()=>ctx},{studio:true}).render(panel,2);
  const pixel=x=>frame[(16*64+x)*4];
  assert.ok(pixel(4)-pixel(56)>20,'polished trim should catch more light than the adjacent matte coating');
});

test('the Lite reflex window tints visible surfaces and stays transparent over the live arena',()=>{
  let frame;
  const ctx={
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    putImageData:img=>{frame=img.data;}
  };
  const canvas={width:64,height:64,getContext:()=>ctx},preview=createCanvasPreview(canvas);
  const plane=(size,color,x,z,opacity=1)=>{
    const mat=new T.MeshBasicMaterial({color,opacity,transparent:opacity<1,depthWrite:opacity===1});
    const mesh=new T.Mesh(new T.PlaneGeometry(size,size),mat);mesh.position.set(x,0,z);return mesh;
  };
  const glass=plane(1,0x00ffff,0,.1,.125),behind=plane(.35,0xff0000,-.25,0),inFront=plane(.35,0x00ff00,.25,.2);
  const scene=new T.Group();scene.add(glass,inFront,behind);
  preview.render(scene,2);
  const pixel=(x,y)=>[...frame.slice((y*64+x)*4,(y*64+x+1)*4)];
  assert.deepEqual(pixel(24,30),[223,32,32,255],'metal behind the transparent glass');
  assert.deepEqual(pixel(40,30),[0,255,0,255],'opaque frame in front of the glass');
  for(const [x,y] of [[27,22],[43,20],[31,31],[32,32],[31,32],[32,31]]){
    assert.deepEqual(pixel(x,y),[0,255,255,32],'one coat of tint including the shared diagonal');
  }
  assert.deepEqual(pixel(4,4),[0,0,0,0],'uncovered pixels preserve the world behind the canvas');
});

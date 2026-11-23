import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {createCanvasPreview} from '../dist/armory-canvas.js';

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

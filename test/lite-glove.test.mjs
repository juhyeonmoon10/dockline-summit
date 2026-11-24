import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../dist/assets/three.module.min.js';
import {createCanvasPreview} from '../dist/armory-canvas.js';

test('software preview follows each hand pose when two gloves share a mesh',()=>{
  let pixels;
  const ctx={createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(4*w*h)}),putImageData:img=>{pixels=img.data;}};
  const preview=createCanvasPreview({width:64,height:64,getContext:()=>ctx});
  const geo=new T.PlaneGeometry(.25,.25);
  geo.setAttribute('skinIndex',new T.Uint8BufferAttribute(new Uint8Array(16),4));
  geo.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
  const bindPositions=geo.attributes.position.array.slice();
  const scene=new T.Group();
  const hand=()=>{
    const mesh=new T.SkinnedMesh(geo,new T.MeshBasicMaterial());
    const bone=new T.Bone();mesh.add(bone);mesh.bind(new T.Skeleton([bone]));scene.add(mesh);return bone;
  };
  const a=hand(),b=hand();
  const visible=x=>pixels[4*(32*64+x)+3]===255;
  a.position.x=-.5;b.position.x=.5;
  preview.render(scene,2);
  assert.ok(visible(16)&&visible(48)&&!visible(32));
  a.position.x=0;
  preview.render(scene,2);
  assert.ok(!visible(16)&&visible(48)&&visible(32));
  assert.deepEqual(geo.attributes.position.array,bindPositions);
});

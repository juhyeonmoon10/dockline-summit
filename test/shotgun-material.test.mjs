import assert from 'node:assert/strict';
import test from 'node:test';
import {scatterModel} from '../dist/scatter-model.js';
import * as T from '../dist/assets/three.module.min.js';
import {createCanvasPreview} from '../dist/armory-canvas.js';

test('the shotgun body and pump preserve texture seams during mesh reduction',()=>{
  const model=scatterModel();
  for(const name of ['body','pump']){
    const {index,attributes:{uv}}=model.getObjectByName(name).geometry;
    for(let offset=0;offset<index.count;offset+=3){
      const [a,b,c]=index.array.subarray(offset,offset+3);
      const u=[uv.getX(a),uv.getX(b),uv.getX(c)];
      const v=[uv.getY(a),uv.getY(b),uv.getY(c)];
      // No face of this atlas spans a quarter of the image. Joining unrelated
      // UV islands paints large metal triangles across the wooden stock.
      assert.ok(Math.max(...u)-Math.min(...u)<.25 && Math.max(...v)-Math.min(...v)<.25,
        name+' contains a triangle that crosses texture islands at index '+offset);
    }
  }
});

test('the software armory displays detail inside each textured face after the image loads',t=>{
  const atlas={width:2,height:1,data:Uint8Array.of(255,0,0,255,0,0,255,255)};
  let uploads=0,frame;
  const sampler={drawImage(){uploads++;},getImageData:()=>atlas};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>sampler})};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const ctx={createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
    putImageData:image=>{frame=image.data;}};
  const preview=createCanvasPreview({width:16,height:8,getContext:()=>ctx},{studio:true});
  const plane=new T.Mesh(new T.PlaneGeometry(2,1),new T.MeshBasicMaterial());
  plane.userData.previewGeometry=new T.PlaneGeometry(2,1,3,2);
  preview.render(plane,2);
  plane.material.map=new T.Texture(atlas);
  preview.render(plane,2);
  preview.render(plane,2);
  const at=x=>Array.from(frame.subarray((4*16+x)*4,(4*16+x+1)*4));
  assert.deepEqual(at(3),[255,0,0,255]);assert.deepEqual(at(12),[0,0,255,255]);
  assert.equal(uploads,1);
});

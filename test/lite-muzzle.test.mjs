import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiteRenderer} from '../dist/lite.js';
import {decodeLiteOperator,liteOperator} from '../dist/lite-operator.js';
import {fieldViews} from '../dist/assets/field-frames.js';

test('every carried gun emits at the centre of a face on its posed barrel',()=>{
  const team=liteOperator(0),previous=team.model;
  const bytes=readFileSync(new URL('../dist/assets/customs-guard.lite.bin',import.meta.url));
  team.model=decodeLiteOperator(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  try{
    const scene=Object.assign(Object.create(LiteRenderer.prototype),{
      operatorStates:new Map(),meleeSwings:new Map(),remoteMuzzles:new Map(),
    });
    for(const active of Object.keys(fieldViews))for(const pitch of [-.6,.5]){
      const player={id:'remote',team:0,x:2,y:.3,z:4,yaw:.86,pitch,slide:pitch>0?.3:0,active,grounded:true};
      const faces=[];
      // A shooter behind the camera can still fire a visible shot into the view.
      scene.remoteOperator(faces,player,{x:2,y:1,z:0,sp:0,cp:1,sy:0,cy:1},.72,true);
      const {tip}=scene.remoteMuzzles.get(player.id);
      assert.ok(faces.some(({vertices})=>{
        const centre=vertices.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/vertices.length),[0,0,0]);
        return Math.hypot(centre[0]-tip.x,centre[1]-tip.y,centre[2]-tip.z)<1e-7;
      }),active);
    }
  }finally{team.model=previous;}
});

test('calibrated first-person cap pixels and their depth survive camera pitch and aspect',()=>{
  for(const [w,h] of [[425,239],[320,240],[640,260]])for(const pitch of [-.65,.6]){
    const yaw=1.3,cam={x:1,y:2,z:3,sy:Math.sin(yaw),cy:Math.cos(yaw),sp:Math.sin(pitch),cp:Math.cos(pitch)};
    const scene=Object.assign(Object.create(LiteRenderer.prototype),{width:w,height:h,focal:h*.9});
    for(const info of Object.values(fieldViews))for(const [u,v,depth] of info.muzzles){
      assert.ok(Number.isFinite(depth)&&depth>0);
      const screen={x:u*w,y:v*h},tip=scene.viewMuzzle(cam,screen,depth);
      const dx=tip.x-cam.x,dy=tip.y-cam.y,dz=tip.z-cam.z,forward=dx*cam.sy-dz*cam.cy;
      const [x,y]=scene.project([dx*cam.cy+dz*cam.sy,dy*cam.cp-forward*cam.sp,forward*cam.cp+dy*cam.sp,0,0]);
      assert.ok(Math.hypot(x-screen.x,y-screen.y)<1e-8);
    }
  }
});

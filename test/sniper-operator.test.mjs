import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeLiteOperator, posedOperator, operatorGrip } from '../dist/lite-operator.js';
import { supportPads } from '../dist/operator-pads.js';

const asBuffer=data=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const player=(active='sniper',pitch=0,yaw=0)=>({active,pitch,yaw,x:2,y:.3,z:-4,seat:0,speed:0,grounded:true,slide:0});
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<.000002,`${message}: ${a} vs ${b}`);

for(const team of ['guard','responder']){
  const data=await readFile(new URL(`../dist/assets/customs-${team}.lite.bin`,import.meta.url));
  const model=decodeLiteOperator(asBuffer(data)),frames=Object.values(model.clips).reduce((n,c)=>n+c.length,0);
  const positionsAt=(28+9*model.indices.length/3+1)&~1,originalEnd=positionsAt+model.stride*frames*2;
  test(`${team}: old atlas compatibility and complete arm extension`,()=>{
    const old=decodeLiteOperator(asBuffer(data.subarray(0,originalEnd)));
    assert.equal(old.aimWeights,null);assert.equal(old.aimPivots,null);
    assert.deepEqual(old.positions,model.positions);
    assert.equal(model.aimWeights.length,model.count+1);
    assert.equal(model.aimWeights[model.count],255);
    assert.equal(model.aimPivots.length,frames*3);
    const shoulderEnd=originalEnd+8+model.aimWeights.byteLength+(model.aimWeights.byteLength%2)+frames*6;
    const shoulderOnly=decodeLiteOperator(asBuffer(data.subarray(0,shoulderEnd)));
    assert.equal(shoulderOnly.supportWeights,null);
    assert.deepEqual(shoulderOnly.aimPivots,model.aimPivots);
    assert.equal(model.supportWeights.length,(model.count+1)*2);
    assert.equal(model.supportPivots.length,frames*3);
    for(const end of [originalEnd-1,originalEnd+1,data.length-1])assert.throws(()=>decodeLiteOperator(asBuffer(data.subarray(0,end))));
    const wrong=Buffer.from(data);wrong[originalEnd]=0;
    assert.throws(()=>decodeLiteOperator(asBuffer(wrong)),/arm data/);
  });
  test(`${team}: changing props places the weighted support glove on each prop's own contact`,()=>{
    const a=posedOperator(model,player('rifle'),0,null,{});
    const b=posedOperator(model,player('pistol'),0,null,{});
    let glove=0;
    for(let i=0;i<=model.count;i++){
      const weight=model.supportWeights[i*2]/255;
      if(weight>.9)glove++;
      for(let axis=0;axis<3;axis++){
        near(a[i*3+axis]-b[i*3+axis],weight*.86*(supportPads.rifle[axis]-supportPads.pistol[axis]),'support displacement');
      }
    }
    assert.ok(glove>3);
  });
  test(`${team}: sniper aim preserves body and rotates weighted arms and grip`,()=>{
    const level=posedOperator(model,player(),0,null,{});
    const pivotY=model.aimPivots[1]*.001+.3,pivotZ=model.aimPivots[2]*.001-4;
    let body=0,arms=0;
    for(const pitch of [-.78,.78]){
      const posed=posedOperator(model,player('sniper',pitch),0,null,{}),c=Math.cos(pitch),s=Math.sin(pitch);
      for(let v=0;v<=model.count;v++){
        const i=v*3,w=model.aimWeights[v]/255,dy=level[i+1]-pivotY,dz=level[i+2]-pivotZ;
        near(posed[i],level[i],'x remains on aim axis');
        near(posed[i+1],level[i+1]+(dy*c-dz*s-dy)*w,'weighted y');
        near(posed[i+2],level[i+2]+(dy*s+dz*c-dz)*w,'weighted z');
        if(w===0){assert.deepEqual(posed.slice(i,i+3),level.slice(i,i+3));body++;}
        if(w===1)arms++;
      }
    }
    assert.ok(body>100&&arms>20,'real body and arm weights present');
  });
  test(`${team}: running/jumping/crouching and other weapons keep their existing poses`,()=>{
    for(const active of ['rifle','pistol','shotgun','smg','burst','marksman','lmg','knife']){
      for(const movement of [{speed:5},{grounded:false},{slide:.3},{}]){
        const p={...player(active),...movement},a=posedOperator(model,p,.21,null,{}),b=posedOperator(model,{...p,pitch:.75},.21,null,{});
        assert.deepEqual(a,b,active+' pose changed with pitch');
      }
    }
  });
  test(`${team}: carried sniper rotates around its right-hand contact at every yaw`,()=>{
    for(const yaw of [0,1.3,-2.2])for(const pitch of [-.78,0,.78]){
      const p=player('sniper',pitch,yaw),world=posedOperator(model,p,0,null,{}),grip=operatorGrip(world,p),at=world.length-3;
      const localY=-.045*Math.cos(pitch),localZ=-.045*Math.sin(pitch);
      near(grip[0]-localZ*Math.sin(yaw),world[at],'right grip x');
      near(grip[1]+localY,world[at+1],'right grip y');
      near(grip[2]+localZ*Math.cos(yaw),world[at+2],'right grip z');
    }
  });
}

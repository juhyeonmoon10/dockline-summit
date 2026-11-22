import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../dist/assets/three.module.min.js';
import {gunFit} from '../dist/gun-fit.js';
import {firingMuzzle} from '../dist/sim.js';
import {heldMuzzleWorld} from '../dist/operator.js';
import {decodeLiteOperator,operatorGrip,posedOperator} from '../dist/lite-operator.js';

test('host origins stay within the animated barrel excursion, including when aim exceeds the arm range',()=>{
  const mount=new T.Group(),held=new T.Group(),tip=new T.Vector3();
  mount.scale.setScalar(.86);mount.add(held);
  // Each clip has its own hand travel. Running has the largest excursion.
  const poses=[
    [{},.040], [{speed:4.3},.15], [{slide:.30},.022], [{grounded:false},.055],
  ];
  for(const [team,outfit] of ['guard','responder'].entries()){
    const data=readFileSync(new URL('../dist/assets/customs-'+outfit+'.lite.bin',import.meta.url));
    const model=decodeLiteOperator(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
    for(const [stance,tolerance] of poses)for(const active of Object.keys(gunFit))for(const pitch of [-1.4,0,1.4]){
      const p={x:2,y:.8,z:7,yaw:team?-.72:1.34,team,active,pitch,speed:0,grounded:true,...stance};
      const state={};
      for(let i=0;i<10;i++){
        // Read the actual finger position sampled from the shipped character.
        const world=posedOperator(model,p,i*.07,null,state);
        mount.position.fromArray(operatorGrip(world,p));
        mount.rotation.set(Math.max(-.78,Math.min(.78,pitch)),-p.yaw,0,'YXZ');
        assert.ok(heldMuzzleWorld(held,active,tip));
        const cap=firingMuzzle(p);
        assert.ok(tip.distanceTo(cap)<tolerance,outfit+' '+active+' '+pitch+' '+JSON.stringify(stance));
        assert.deepEqual(firingMuzzle({...p,ads:true}),cap);
      }
    }
  }
});

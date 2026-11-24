import test from 'node:test';
import assert from 'node:assert/strict';
import {drawCarriedKarambit,drawLiteKnife} from '../dist/lite-knife.js';
import {knifePose} from '../dist/knife-motion.js';

test('the silver karambit projects finite faces on cold equip, inspection and either slash',()=>{
  const player={knifeSkin:'karambit',speed:4};
  let paths=0;
  const context=new Proxy({canvas:{width:425,height:239}},{
    get(target,key){
      if(key in target)return target[key];
      return (...values)=>{
        assert.ok(values.every(Number.isFinite),'non-finite coordinate in '+key);
        if(key==='fill')paths++;
      };
    }
  });
  for(const [draw,inspect,age,side] of [
    [.08,Infinity,Infinity,1],[Infinity,Infinity,Infinity,1],[Infinity,.55,Infinity,1],
    [Infinity,Infinity,.10,1],[Infinity,Infinity,.10,-1]
  ]){
    paths=0;
    drawLiteKnife(context,player,2,draw,inspect,Number.isFinite(age)?{at:2-age,side}:null);
    assert.ok(paths>0);
    let faces=0;
    drawCarriedKarambit(knifePose(age,side,player.knifeSkin),points=>{
      for(const vertex of points){
        assert.equal(vertex.length,3);
        assert.ok(vertex.every(Number.isFinite));
      }
      faces++;
    });
    assert.ok(faces>0);
  }
});

test('both flat views show the silver blade and ring, and the dark grip',()=>{
  const carried=new Set(),held=new Set();
  drawCarriedKarambit(knifePose(Infinity,1,'karambit'),(_,color)=>carried.add(color));
  const ctx=new Proxy({canvas:{width:425,height:239}},{
    get(target,key){return key in target?target[key]:()=>{};},
    set(target,key,value){
      if(key==='fillStyle')held.add(Number.parseInt(value.slice(1),16));
      target[key]=value;return true;
    }
  });
  drawLiteKnife(ctx,{knifeSkin:'karambit'},1,Infinity,Infinity,null);
  for(const color of carried){
    assert.ok(held.has(color),'cold equip should use the same finish as a remote player');
    const channels=[color>>16,(color>>8)&255,color&255];
    assert.ok(Math.max(...channels)-Math.min(...channels)<24,'blade, ring and grips are neutral tones');
  }
  assert.ok([...carried].filter(color=>(color>>16)>210).length>=2,'polished facets and ring lip');
  assert.ok([...carried].some(color=>(color>>16)<54),'dark rubber grip');
});

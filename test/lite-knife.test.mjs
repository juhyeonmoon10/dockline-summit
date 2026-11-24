import test from 'node:test';
import assert from 'node:assert/strict';
import {drawCarriedKarambit,drawLiteKnife} from '../dist/lite-knife.js';
import {knifePose} from '../dist/knife-motion.js';

test('the compact karambit projects finite faces on cold equip, inspection and either slash',()=>{
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {drawCarriedKarambit,drawLiteKnife} from '../dist/lite-knife.js';
import {LiteRenderer} from '../dist/lite.js';
import {LiteHeldView} from '../dist/lite-held.js';
import {Group} from '../dist/assets/three.module.min.js';
import {knifePose,knifeAttackDuration,karambitVisualDuration} from '../dist/knife-motion.js';

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

test('Lite links opposite karambit strokes by server time, until a weapon change, death or inspection',()=>{
  const renderer=Object.assign(Object.create(LiteRenderer.prototype),{
    meleeSwings:new Map(),meleeImpacts:[],lastMeleeSeq:0,lastElapsed:0,lastRound:1
  });
  const player={id:'local',alive:true,active:'knife',knifeSkin:'karambit'};
  const game={seq:0,elapsed:1,round:1,events:[],players:[player]};
  function attack(at,side,delay){
    game.elapsed=at+delay;
    game.events.push({type:'melee',seq:++game.seq,at,side,actor:player.id,knifeSkin:player.knifeSkin});
    renderer.meleeEvents(game,player,game.elapsed+2);
    return renderer.meleeSwings.get(player.id);
  }
  assert.equal(attack(1,1,.04).previousAge,Infinity);
  game.elapsed=1.53;renderer.meleeEvents(game,player,3.53);
  assert.ok(renderer.meleeSwings.has(player.id),'retain outgoing pose across the cooldown gap');
  assert.ok(Math.abs(attack(1.55,-1,.11).previousAge-.55)<1e-8);
  assert.equal(attack(2.1,-1,.01).previousAge,Infinity,'an independent repeat cannot borrow the opposite pose');
  player.active='rifle';renderer.meleeEvents(game,player,4.16);player.active='knife';
  assert.equal(attack(2.65,1,.02).previousAge,Infinity);
  player.alive=false;renderer.meleeEvents(game,player,4.7);player.alive=true;
  const swing=attack(3.2,-1,.02);
  assert.equal(swing.previousAge,Infinity);
  renderer.heldViewLoading=true;renderer.heldView={draw(...args){assert.equal(args.at(-1),null);return true;}};
  renderer.weapon(player,swing.at+knifeAttackDuration('karambit')+.01,null,null,0);
  assert.equal(renderer.meleeSwings.size,0);
});

test('Lite first-person cache redraws the karambit recovery after the inspect lock releases',()=>{
  let renders=0;
  const layer=Object.assign(Object.create(LiteHeldView.prototype),{
    canvas:{width:1,height:1},preview:{render(){renders++;}},models:new Map(),rig:new Group()
  });
  layer.rig.scale.setScalar(.91);
  const ctx={canvas:{width:435,height:245},drawImage(){}};
  const player={active:'knife',knifeSkin:'karambit',speed:0};
  const swing={side:1,at:0,previousAge:Infinity},unlock=knifeAttackDuration('karambit');
  for(const time of [unlock+.01,unlock+.04,karambitVisualDuration+.01,karambitVisualDuration+.04]){
    layer.draw(ctx,player,time,Infinity,Infinity,swing);
  }
  assert.equal(renders,3,'two recovery frames, one return to rest, then reuse the resting hand');
});

test('the cold software blade starts the return stroke from the displayed follow-through',()=>{
  function vertices(time,swing){
    const points=[];
    const ctx=new Proxy({canvas:{width:425,height:239},lineTo(x,y){points.push(x,y);}},{
      get(target,key){return key in target?target[key]:()=>{};}
    });
    drawLiteKnife(ctx,{knifeSkin:'karambit',speed:0},time,Infinity,Infinity,swing);
    return points;
  }
  const first=vertices(.55,{at:0,side:1}),linked=vertices(.55,{at:.55,side:-1,previousAge:.55});
  const fresh=vertices(.55,{at:.55,side:-1,previousAge:Infinity});
  const distance=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
  assert.ok(distance(first,linked)<1,'same hand and blade position across the timed input boundary');
  assert.ok(distance(fresh,linked)>4,'a fresh attack should begin from the ready pose');
});

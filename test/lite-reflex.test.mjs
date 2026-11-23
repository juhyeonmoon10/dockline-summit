import test from 'node:test';
import assert from 'node:assert/strict';
import {LiteRenderer} from '../dist/lite.js';
import {fieldViews} from '../dist/assets/field-frames.js';
import {REFLEX_APERTURE,opticFit} from '../dist/optic-fit.js';
import {drawReflexDot} from '../dist/lite-reflex.js';

const ids=Object.keys(fieldViews).filter(opticFit);
const sheet={complete:true,naturalWidth:1280};
function renderer(width,height,aim){
  return Object.assign(Object.create(LiteRenderer.prototype),{
    width,height,aim,recoil:0,shotAge:Infinity,fieldAtlas:sheet,motionAtlas:{},stillAtlases:{},
  });
}

test('reflex sprites retain the projected opening through all five raise poses',()=>{
  assert.equal(ids.length,7);assert.equal(fieldViews.sniper.glass,undefined);
  for(const active of ids){
    const entry=fieldViews[active],p={active,speed:0,reload:0};
    for(const [width,height] of [[425,239],[320,240],[455,185]]){
      const scene=renderer(width,height,0);
      for(let i=0;i<entry.aimStops.length;i++){
        scene.aim=entry.aimStops[i];
        const pose=scene.gunPose(p,0);
        assert.equal(pose.uv,entry.muzzles[i]);assert.equal(pose.glass,entry.glass.still[i]);
        assert.equal(pose.glass.length,2*REFLEX_APERTURE.length);
        assert.equal(pose.sw,i===0||i===4?640:384);
        if(i===4){
          const xx=[],yy=[];
          for(let j=0;j<pose.glass.length;j+=2){
            xx.push(pose.x+(pose.glass[j]-pose.uv[0])*pose.gunWidth);
            yy.push(pose.y+(pose.glass[j+1]-pose.uv[1])*height);
          }
          assert.ok(Math.min(...xx)<width/2-4&&Math.max(...xx)>width/2+4,active);
          assert.ok(Math.min(...yy)<height/2-4&&Math.max(...yy)>height/2+4,active);
        }
      }
    }
  }
});

test('the software red dot is drawn at the camera centre after clipping to the glass',()=>{
  const scene=renderer(425,239,1),calls=[];
  const c=new Proxy({canvas:{width:425,height:239},createRadialGradient(...args){
    calls.push(['gradient',...args]);return {addColorStop(){}};
  }},{get(target,key){return key in target?target[key]:(...args)=>calls.push([key,...args]);}});
  const p={active:'shotgun',speed:4,reload:0},pose=scene.gunPose(p,2);
  drawReflexDot(c,pose,768);
  assert.equal(calls.filter(([kind])=>kind==='lineTo').length,REFLEX_APERTURE.length-1);
  assert.ok(calls.findIndex(([kind])=>kind==='clip')<calls.findIndex(([kind])=>kind==='setTransform'));
  const [,x,y,,x2,y2]=calls.find(([kind])=>kind==='gradient');
  assert.deepEqual([x,y,x2,y2],[212.5,119.5,212.5,119.5]);
});

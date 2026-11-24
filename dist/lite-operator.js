// Derived from the same rigged, textured GLBs used by the WebGL renderer.
// Only positions change between frames. Triangle topology and hues stay shared.
import {knifeAttackDuration,knifeClipPhase} from './knife-motion.js';
import {assetUrl} from './asset-url.js';
import {supportPads,supportPalmTurn} from './operator-pads.js';
const CLIPS=['Idle_Shoot','Run_Gun','Jump_Idle','Duck','Punch'];
const sources=['customs-guard','customs-responder'];
const teams=sources.map(()=>({model:null,promise:null,failed:false}));

export function decodeLiteOperator(buffer){
  const bytes=new Uint8Array(buffer),header=new DataView(buffer);
  if(bytes.length<28||String.fromCharCode(...bytes.subarray(0,4))!=='DLC1')throw Error('Invalid character atlas');
  const count=header.getUint16(4,true),triangles=header.getUint16(6,true);
  if(!count||count>1600||!triangles||triangles>1000)throw Error('Invalid character mesh');
  const clips={};let frames=0;
  for(let i=0;i<CLIPS.length;i++){
    const length=header.getUint16(8+4*i,true),seconds=header.getUint16(10+4*i,true)*.001;
    if(!length||length>48||!seconds)throw Error('Invalid character motion');
    clips[CLIPS[i]]={first:frames,length,seconds};frames+=length;
  }
  const positionsAt=(28+9*triangles+1)&~1,stride=(count+1)*3;
  const positionsEnd=positionsAt+stride*frames*2;
  if(buffer.byteLength<positionsEnd)throw Error('Incomplete character atlas');
  let aimWeights=null,aimPivots=null,supportWeights=null,supportPivots=null;
  if(buffer.byteLength>positionsEnd){
    const extension=positionsEnd,weightsAt=extension+8,pivotsAt=(weightsAt+count+2)&~1;
    if(buffer.byteLength<weightsAt||String.fromCharCode(...bytes.subarray(extension,extension+4))!=='ARM1'||
      header.getUint16(extension+4,true)!==count+1||header.getUint16(extension+6,true)!==frames||
      buffer.byteLength<pivotsAt+frames*6)throw Error('Invalid character arm data');
    aimWeights=new Uint8Array(buffer,weightsAt,count+1);
    aimPivots=new Int16Array(buffer,pivotsAt,frames*3);
    const hand=pivotsAt+frames*6;
    if(buffer.byteLength>hand){
      const influence=hand+8,fingers=influence+(count+1)*2;
      if(buffer.byteLength!==fingers+frames*6||String.fromCharCode(...bytes.subarray(hand,hand+4))!=='LHD1'||
        header.getUint16(hand+4,true)!==count+1||header.getUint16(hand+6,true)!==frames)throw Error('Invalid character hand data');
      supportWeights=new Uint8Array(buffer,influence,(count+1)*2);
      supportPivots=new Int16Array(buffer,fingers,frames*3);
    }
  }
  const indices=new Uint16Array(buffer,28,triangles*3);
  for(const index of indices)if(index>=count)throw Error('Invalid character vertex');
  const colors=new Uint32Array(triangles*4),colorsAt=28+6*triangles;
  for(let t=0;t<triangles;t++)for(let shade=0;shade<4;shade++){
    const at=colorsAt+t*3,light=[.78,.90,1.04,1.15][shade];
    const channel=n=>Math.min(255,Math.round((n*.96+8)*light));
    colors[t*4+shade]=((255<<24)|(channel(bytes[at+2])<<16)|(channel(bytes[at+1])<<8)|channel(bytes[at]))>>>0;
  }
  return {count,indices,colors,clips,stride,positions:new Int16Array(buffer,positionsAt,stride*frames),
    aimWeights,aimPivots,supportWeights,supportPivots};
}

export function loadLiteOperators(){
  return Promise.all(teams.map((team,i)=>{
    if(!team.promise){
      team.promise=fetch(assetUrl(sources[i]+'.lite.bin'))
        .then(response=>{if(!response.ok)throw Error('Character download '+response.status);return response.arrayBuffer();})
        .then(data=>{team.model=decodeLiteOperator(data);})
        .catch(()=>{team.failed=true;});
    }
    return team.promise;
  }));
}

export function liteOperator(team){return teams[team===1?1:0];}

export function operatorGrip(world,player){
  const at=world.length-3,aim=player.active==='sniper';
  const pitch=aim?Math.max(-.78,Math.min(.78,player.pitch||0)):0;
  const offsetZ=.045*Math.sin(pitch),offsetY=.045*Math.cos(pitch);
  return [world[at]-offsetZ*Math.sin(player.yaw),world[at+1]+offsetY,world[at+2]+offsetZ*Math.cos(player.yaw)];
}

export function posedOperator(model,player,clock,swing,state){
  const age=swing?clock-swing.at:Infinity;
  const key=player.active==='knife'&&age>=0&&age<knifeAttackDuration(player.knifeSkin)?'Punch':player.slide>0?'Duck':
    player.grounded===false?'Jump_Idle':player.speed>.35?'Run_Gun':'Idle_Shoot';
  const clip=model.clips[key],loop=key==='Idle_Shoot'||key==='Run_Gun';
  if(state.clip!==key||state.previous>clock){
    state.clip=key;state.phase=loop?(player.seat||0)*.22:0;state.previous=clock;
  }
  const dt=Math.min(.1,Math.max(0,clock-state.previous));state.previous=clock;
  const speed=key==='Run_Gun'?Math.max(.6,Math.min(1.55,player.speed/5.4)):1;
  state.phase+=dt*speed;
  const phase=key==='Punch'?knifeClipPhase(age,player.knifeSkin):key==='Duck'?1-Math.min(1,player.slide/.52):state.phase/clip.seconds;
  const frame=loop?(phase%1)*clip.length:Math.min(1,phase)*(clip.length-1);
  const a=Math.floor(frame),b=loop?(a+1)%clip.length:Math.min(clip.length-1,a+1);
  const first=(clip.first+a)*model.stride,second=(clip.first+b)*model.stride;
  const weight=frame-a,positions=model.positions,cy=Math.cos(player.yaw),sy=Math.sin(player.yaw);
  const aim=player.active==='sniper'&&model.aimWeights;
  const pitch=aim?Math.max(-.78,Math.min(.78,player.pitch||0)):0,cp=Math.cos(pitch),sp=Math.sin(pitch);
  const pivotA=(clip.first+a)*3,pivotB=(clip.first+b)*3,pivots=model.aimPivots;
  const pivotY=aim?(pivots[pivotA+1]+(pivots[pivotB+1]-pivots[pivotA+1])*weight)*.001:0;
  const pivotZ=aim?(pivots[pivotA+2]+(pivots[pivotB+2]-pivots[pivotA+2])*weight)*.001:0;
  const pad=model.supportPivots&&supportPads[player.active];
  let leftX=0,leftZ=0,moveX=0,moveY=0,moveZ=0;
  if(pad){
    const left=model.supportPivots,hand=model.stride-3;
    const mix=(array,i,j)=>.001*(array[i]+(array[j]-array[i])*weight);
    leftX=mix(left,pivotA,pivotB);leftZ=mix(left,pivotA+2,pivotB+2);
    moveX=mix(positions,first+hand,second+hand)+.86*pad[0]-leftX;
    moveY=mix(positions,first+hand+1,second+hand+1)+.045+.86*pad[1]-mix(left,pivotA+1,pivotB+1);
    moveZ=mix(positions,first+hand+2,second+hand+2)+.86*pad[2]-leftZ;
  }
  const palmCos=Math.cos(supportPalmTurn),palmSin=Math.sin(supportPalmTurn);
  if(!state.world||state.world.length!==model.stride)state.world=new Float32Array(model.stride);
  const world=state.world;
  for(let i=0;i<model.stride;i+=3){
    let x=(positions[first+i]+(positions[second+i]-positions[first+i])*weight)*.001;
    let y=(positions[first+i+1]+(positions[second+i+1]-positions[first+i+1])*weight)*.001;
    let z=(positions[first+i+2]+(positions[second+i+2]-positions[first+i+2])*weight)*.001;
    if(pad){
      const arm=model.supportWeights[i/3*2]/255,glove=model.supportWeights[i/3*2+1]/255;
      const dx=x-leftX,dz=z-leftZ;
      x+=moveX*arm+(dx*palmCos+dz*palmSin-dx)*glove;
      y+=moveY*arm;
      z+=moveZ*arm+(-dx*palmSin+dz*palmCos-dz)*glove;
    }
    if(aim){
      const influence=model.aimWeights[i/3]/255,dy=y-pivotY,dz=z-pivotZ;
      y+=(dy*cp-dz*sp-dy)*influence;z+=(dy*sp+dz*cp-dz)*influence;
    }
    world[i]=player.x+x*cy-z*sy;world[i+1]=player.y+y;world[i+2]=player.z+x*sy+z*cy;
  }
  return world;
}

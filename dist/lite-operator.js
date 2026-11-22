// Derived from the same rigged, textured GLBs used by the WebGL renderer.
// Only positions change between frames. Triangle topology and hues stay shared.
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
  if(buffer.byteLength!==positionsAt+stride*frames*2)throw Error('Incomplete character atlas');
  const indices=new Uint16Array(buffer,28,triangles*3);
  for(const index of indices)if(index>=count)throw Error('Invalid character vertex');
  const colors=new Uint32Array(triangles*4),colorsAt=28+6*triangles;
  for(let t=0;t<triangles;t++)for(let shade=0;shade<4;shade++){
    const at=colorsAt+t*3,light=[.78,.90,1.04,1.15][shade];
    const channel=n=>Math.min(255,Math.round((n*.96+8)*light));
    colors[t*4+shade]=((255<<24)|(channel(bytes[at+2])<<16)|(channel(bytes[at+1])<<8)|channel(bytes[at]))>>>0;
  }
  return {count,indices,colors,clips,stride,positions:new Int16Array(buffer,positionsAt)};
}

export function loadLiteOperators(){
  return Promise.all(teams.map((team,i)=>{
    if(!team.promise){
      team.promise=fetch(new URL('./assets/'+sources[i]+'.lite.bin',import.meta.url))
        .then(response=>{if(!response.ok)throw Error('Character download '+response.status);return response.arrayBuffer();})
        .then(data=>{team.model=decodeLiteOperator(data);})
        .catch(()=>{team.failed=true;});
    }
    return team.promise;
  }));
}

export function liteOperator(team){return teams[team===1?1:0];}

export function posedOperator(model,player,clock,swing,state){
  const age=swing?clock-swing.at:Infinity;
  const key=player.active==='knife'&&age>=0&&age<.55?'Punch':player.slide>0?'Duck':
    player.grounded===false?'Jump_Idle':player.speed>.35?'Run_Gun':'Idle_Shoot';
  const clip=model.clips[key],loop=key==='Idle_Shoot'||key==='Run_Gun';
  if(state.clip!==key||state.previous>clock){
    state.clip=key;state.phase=loop?(player.seat||0)*.22:0;state.previous=clock;
  }
  const dt=Math.min(.1,Math.max(0,clock-state.previous));state.previous=clock;
  const speed=key==='Run_Gun'?Math.max(.6,Math.min(1.55,player.speed/5.4)):1;
  state.phase+=dt*speed;
  const phase=key==='Punch'?age/.55:key==='Duck'?1-Math.min(1,player.slide/.52):state.phase/clip.seconds;
  const frame=loop?(phase%1)*clip.length:Math.min(1,phase)*(clip.length-1);
  const a=Math.floor(frame),b=loop?(a+1)%clip.length:Math.min(clip.length-1,a+1);
  const first=(clip.first+a)*model.stride,second=(clip.first+b)*model.stride;
  const weight=frame-a,positions=model.positions,cy=Math.cos(player.yaw),sy=Math.sin(player.yaw);
  if(!state.world||state.world.length!==model.stride)state.world=new Float32Array(model.stride);
  const world=state.world;
  for(let i=0;i<model.stride;i+=3){
    const x=(positions[first+i]+(positions[second+i]-positions[first+i])*weight)*.001;
    const y=(positions[first+i+1]+(positions[second+i+1]-positions[first+i+1])*weight)*.001;
    const z=(positions[first+i+2]+(positions[second+i+2]-positions[first+i+2])*weight)*.001;
    world[i]=player.x+x*cy-z*sy;world[i+1]=player.y+y;world[i+2]=player.z+x*sy+z*cy;
  }
  return world;
}

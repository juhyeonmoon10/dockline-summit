import { samples } from './assets/match-samples.js';

export class ArenaSound {
  constructor(){this.enabled=true;this.ctx=null;this.buffers=new Map();this.stepsFor=new Map();}
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        const Ctx=window.AudioContext||window.webkitAudioContext;this.ctx=new Ctx();
        const bus=this.ctx.createDynamicsCompressor();bus.threshold.value=-15;bus.knee.value=18;bus.ratio.value=5;bus.connect(this.ctx.destination);this.bus=bus;
        for(const [id,b64] of Object.entries(samples)){
          const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
          this.ctx.decodeAudioData(bytes.buffer).then(b=>this.buffers.set(id,b)).catch(()=>{});
        }
      }
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }catch{}
  }
  connected(source,gain,pan,when=0){
    const ctx=this.ctx,g=ctx.createGain();g.gain.value=gain;source.connect(g);
    if(ctx.createStereoPanner){const stereo=ctx.createStereoPanner();stereo.pan.value=pan;g.connect(stereo);stereo.connect(this.bus);source.onended=()=>{source.disconnect();g.disconnect();stereo.disconnect();};}
    else{g.connect(this.bus);source.onended=()=>{source.disconnect();g.disconnect();};}
    source.start(ctx.currentTime+when);return g;
  }
  sample(id,gain=.5,pan=0,speed=1,when=0){
    const ctx=this.ctx,buffer=this.buffers.get(id);if(!this.enabled||ctx?.state!=='running'||!buffer||gain<.008)return;
    const src=ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=speed;this.connected(src,gain,pan,when);
  }
  note(f1,f2,dur,vol=.075,delay=0){
    const c=this.ctx;if(!this.enabled||c?.state!=='running')return;
    const o=c.createOscillator(),at=c.currentTime+delay;o.type='sine';o.frequency.setValueAtTime(f1,at);o.frequency.exponentialRampToValueAtTime(f2,at+dur);
    const g=this.connected(o,.0001,0,delay);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(vol,at+.004);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.stop(at+dur+.015);
  }
  relative(a,p){
    const dx=a.x-p.x,dz=a.z-p.z,dist=Math.hypot(dx,dz);return {dist,pan:Math.max(-.94,Math.min(.94,(dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw))/(dist||1)))};
  }
  event(e,game,view){
    if(!view||!this.enabled)return;const actor=game.players.find(p=>p.id===e.actor);if(!actor)return;
    const own=actor.id===view.id,{dist,pan}=this.relative(actor,view);
    if(e.type==='shot'){
      const variation=.97+Math.random()*.06;
      const key=!own&&dist>23?'distant':e.weapon;
      this.sample(key,own?.50:Math.min(.42,2.0/(dist+2)),own?0:pan,variation*(e.weapon==='pistol'?1.32:1));
      if(own&&Math.random()>.76){const end=this.relative({x:e.ex,z:e.ez},view);this.sample('ricochet',.055,end.pan,.92+Math.random()*.14,.025+end.dist/300);}
    }
    if(e.type==='hit'&&own)this.note(e.headshot?1350:840,e.headshot?1760:1060,.06,.10);
    if(e.type==='kill'&&own){this.note(540,810,.1,.09);this.note(830,1010,.12,.065,.07);}
    if(e.type==='reload')this.sample('reload',own?.36:.12/(1+dist*.1),own?0:pan,1.03);
  }
  steps(game,view,t){
    if(!view||!this.enabled)return;
    for(const p of game.players){
      let s=this.stepsFor.get(p.id);if(!s){s={at:t+.12,flip:false,air:false};this.stepsFor.set(p.id,s);}
      if(!p.alive)continue;
      const own=p.id===view.id,{dist,pan}=this.relative(p,view),gain=own?.17:.23/(1+.23*dist);
      if(!p.grounded){s.air=true;continue;}
      if(s.air){s.air=false;s.at=t+.18;this.sample('land',gain*.85,pan);}
      if(t<s.at||p.speed<1.7||dist>17)continue;
      s.at=t+(p.slide>0?.48:Math.max(.23,1.8/p.speed));s.flip=!s.flip;
      this.sample(s.flip?'stepA':'stepB',gain*(p.slide>0?.65:1),pan,(p.slide>0?.77:1)+Math.random()*.06);
    }
  }
  chime(win=true){this.note(win?410:282,win?580:220,.15,.065);this.note(win?686:218,win?855:170,.22,.065,.14);}
}

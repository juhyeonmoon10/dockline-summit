import { samples } from './assets/match-samples.js';

const guns={
  rifle:{length:.36,hold:.025,decay:.080,body:.12,frequency:155,volume:.72,echo:.06},
  pistol:{length:.26,hold:.016,decay:.045,body:.08,frequency:190,volume:.60,echo:.025},
  shotgun:{length:.66,hold:.060,decay:.140,body:.18,frequency:105,volume:.76,echo:.10},
  sniper:{length:.82,hold:.025,decay:.180,body:.14,frequency:125,volume:.72,echo:.14}
};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function mono(buffer){
  const data=new Float32Array(buffer.length);
  for(let c=0;c<buffer.numberOfChannels;c++){
    const channel=buffer.getChannelData(c);
    for(let i=0;i<data.length;i++)data[i]+=channel[i]/buffer.numberOfChannels;
  }
  return data;
}
// Bake each report once: immediate attack, a short body, and quiet outdoor reflections.
function gunBuffer(ctx,source,profile){
  const input=mono(source),rate=source.sampleRate;
  let peak=0;for(const v of input)peak=Math.max(peak,Math.abs(v));
  let start=input.findIndex(v=>Math.abs(v)>=peak*.04);
  start=Math.max(0,start-Math.round(rate*.001));
  const buffer=ctx.createBuffer(1,Math.ceil(profile.length*rate),rate),out=buffer.getChannelData(0);
  const gain=.70/(peak||1),hp=Math.exp(-2*Math.PI*38/rate);
  let previous=0,filtered=0,phase=0;
  for(let i=0;i<out.length;i++){
    const t=i/rate,raw=(input[start+i]||0)*gain;
    filtered=hp*(filtered+raw-previous);previous=raw;
    const envelope=Math.exp(-Math.max(0,t-profile.hold)/profile.decay);
    phase+=2*Math.PI*profile.frequency*(.45+.55*Math.exp(-t/.025))/rate;
    const body=profile.body*Math.sin(phase)*Math.exp(-t/.040)*(1-Math.exp(-t/.001));
    const fade=Math.min(1,t/.0008,(out.length-1-i)/(rate*.012));
    out[i]=(filtered*envelope+body)*Math.max(0,fade);
  }
  const dry=out.slice();
  for(const [seconds,level] of [[.075,profile.echo],[.137,profile.echo*.45]]){
    const offset=Math.round(seconds*rate);
    for(let i=offset;i<out.length;i++)out[i]+=dry[i-offset]*level;
  }
  peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
  if(peak>.86)for(let i=0;i<out.length;i++)out[i]*=.86/peak;
  return buffer;
}
function clip(ctx,source,from=0,duration=source.duration,level=.65){
  const input=mono(source),rate=source.sampleRate,start=Math.floor(from*rate);
  const count=Math.max(1,Math.min(input.length-start,Math.ceil(duration*rate)));
  const buffer=ctx.createBuffer(1,count,rate),out=buffer.getChannelData(0);
  let peak=0;for(let i=0;i<count;i++)peak=Math.max(peak,Math.abs(input[start+i]||0));
  const gain=Math.min(2,level/(peak||1));
  for(let i=0;i<count;i++)out[i]=(input[start+i]||0)*gain*Math.min(1,i/(rate*.002),(count-1-i)/(rate*.012));
  return buffer;
}

export class ArenaSound {
  constructor(){
    this._enabled=true;this.ctx=null;this.ready=null;this.loaded=false;
    this.buffers=new Map();this.stepsFor=new Map();this.voices=new Set();this.pending=[];
  }
  get enabled(){return this._enabled;}
  set enabled(value){this.setEnabled(value);}
  setEnabled(value){
    this._enabled=!!value;
    if(this.master)this.master.gain.setTargetAtTime(this._enabled?.78:0,this.ctx.currentTime,.004);
    if(!this._enabled)this.clear();
  }
  unlock(){
    if(!this.enabled)return Promise.resolve();
    try{
      if(!this.ctx){
        const Ctx=window.AudioContext||window.webkitAudioContext;this.ctx=new Ctx();
        const ctx=this.ctx,bus=ctx.createDynamicsCompressor(),master=ctx.createGain(),ceiling=ctx.createWaveShaper();
        bus.threshold.value=-10;bus.knee.value=6;bus.ratio.value=10;bus.attack.value=.003;bus.release.value=.09;
        // A final soft ceiling catches simultaneous reports before the master volume.
        const curve=new Float32Array(2049);
        for(let i=0;i<curve.length;i++){
          const x=i/(curve.length-1)*2-1,a=Math.abs(x);
          curve[i]=Math.sign(x)*(a<=.75?a:.75+.20*Math.tanh((a-.75)/.20));
        }
        ceiling.curve=curve;master.gain.value=.78;
        bus.connect(ceiling);ceiling.connect(master);master.connect(ctx.destination);
        this.bus=bus;this.master=master;
        const resume=ctx.state==='suspended'?ctx.resume().catch(()=>{}):Promise.resolve();
        this.ready=Promise.all([resume,...Object.entries(samples).map(async([id,b64])=>{
          try{
            const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
            const decoded=await ctx.decodeAudioData(bytes.buffer);
            this.buffers.set(id,guns[id]?gunBuffer(ctx,decoded,guns[id]):clip(ctx,decoded));
            if(id==='reload'){
              this.buffers.set('magOut',clip(ctx,decoded,.100,.34,.48));
              this.buffers.set('rack',clip(ctx,decoded,.970,.43,.58));
              this.buffers.set('shell',clip(ctx,decoded,.100,.20,.42));
            }
          }catch{}
        })]).then(()=>{
          this.loaded=true;
          const queued=this.pending.splice(0);
          if(this.enabled)for(const cue of queued)if(performance.now()-cue.at<350)this.playEvent(cue.event,cue.actor,cue.view);
        });
      }else if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      return this.ready;
    }catch{return Promise.resolve();}
  }
  stop(voice){
    const now=this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.002);
    try{voice.source.stop(now+.008);}catch{}
    this.voices.delete(voice);
  }
  clear(){this.pending.length=0;this.stepsFor.clear();for(const voice of this.voices)this.stop(voice);}
  connected(source,volume,pan,delay=0,options={}){
    const ctx=this.ctx;if(!this.enabled||ctx?.state!=='running')return;
    const priority=options.priority||1;
    if(this.voices.size>=32){
      let oldest;
      for(const voice of this.voices)if(!oldest||voice.priority<oldest.priority)oldest=voice;
      if(oldest.priority>priority)return;
      this.stop(oldest);
    }
    const gain=ctx.createGain(),nodes=[source,gain];gain.gain.value=volume;source.connect(gain);
    let tail=gain;
    if(options.lowpass){
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=options.lowpass;filter.Q.value=.5;
      tail.connect(filter);tail=filter;nodes.push(filter);
    }
    if(ctx.createStereoPanner){
      const stereo=ctx.createStereoPanner();stereo.pan.value=clamp(pan,-.96,.96);
      tail.connect(stereo);tail=stereo;nodes.push(stereo);
    }
    tail.connect(this.bus);
    const voice={source,gain,priority,actor:options.actor,weapon:options.weapon,reload:options.reload,mechanic:options.mechanic};
    this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};
    source.start(ctx.currentTime+delay);return gain;
  }
  sample(id,volume=.5,pan=0,speed=1,delay=0,options={}){
    const ctx=this.ctx,buffer=this.buffers.get(id);
    if(!this.enabled||ctx?.state!=='running'||!buffer||!Number.isFinite(volume)||volume<.008)return;
    const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=clamp(speed,.5,2);
    return this.connected(source,volume,pan,delay,options);
  }
  note(f1,f2,dur,volume=.075,delay=0){
    const ctx=this.ctx;if(!this.enabled||ctx?.state!=='running')return;
    const source=ctx.createOscillator(),at=ctx.currentTime+delay;source.type='sine';
    source.frequency.setValueAtTime(f1,at);source.frequency.exponentialRampToValueAtTime(f2,at+dur);
    const gain=this.connected(source,.0001,0,delay,{priority:4});if(!gain)return;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.003);
    gain.gain.exponentialRampToValueAtTime(.0001,at+dur);source.stop(at+dur+.015);
  }
  relative(a,p){
    const dx=a.x-p.x,dz=a.z-p.z,dist=Math.hypot(dx,dz);
    return {dist,pan:clamp((dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw))/(dist||1),-.94,.94)};
  }
  event(event,game,view){
    if(!view||!this.enabled)return;const actor=game.players.find(p=>p.id===event.actor);if(!actor)return;
    if(!this.loaded){
      if(this.pending.length>=8)this.pending.shift();
      this.pending.push({event:{...event},actor:{...actor},view:{...view},at:performance.now()});return;
    }
    this.playEvent(event,actor,view);
  }
  playEvent(event,actor,view){
    const own=actor.id===view.id;
    const origin=event.type==='shot'&&Number.isFinite(event.x)&&Number.isFinite(event.z)?event:actor;
    const {dist,pan}=this.relative(origin,view),attenuation=own?1:.65/(1+(dist/9)**1.35),position=own?0:pan;
    const options={priority:own?3:2,lowpass:own?0:Math.max(1800,16000/(1+dist*.12))};
    if(event.type==='shot'&&guns[event.weapon]){
      const profile=guns[event.weapon],delay=own?0:Math.min(.12,dist/343);
      this.sample(event.weapon,profile.volume*attenuation,position,.985+Math.random()*.030,delay,options);
      if(event.weapon==='shotgun'||event.weapon==='sniper')this.sample('rack',.20*attenuation,position,event.weapon==='shotgun'?1.18:.82,delay+.22,{...options,priority:1,mechanic:true,actor:actor.id,weapon:event.weapon});
    }
    if(event.type==='hit'&&own)this.note(event.headshot?1350:840,event.headshot?1760:1060,.035,.07);
    if(event.type==='kill'&&own){this.note(540,810,.09,.07);this.note(830,1010,.11,.09,.07);}
    if(event.type==='reload'){
      for(const voice of this.voices)if(voice.reload&&voice.actor===actor.id)this.stop(voice);
      if(!actor.alive||actor.active!==event.weapon||!(actor.reload>0))return;
      const reloadOptions={...options,priority:own?2:1,reload:true,actor:actor.id,weapon:event.weapon};
      if(event.weapon==='shotgun')this.sample('shell',.35*attenuation,position,1,.05,reloadOptions);
      else{
        this.sample('magOut',.35*attenuation,position,1,0,reloadOptions);
        this.sample('rack',.35*attenuation,position,1,Math.max(0,actor.reload-.40),reloadOptions);
      }
    }
  }
  reconcile(game){
    for(const voice of this.voices)if(voice.reload||voice.mechanic){
      const actor=game.players.find(p=>p.id===voice.actor);
      if(!actor?.alive||actor.active!==voice.weapon||(voice.reload&&actor.reload<=0))this.stop(voice);
    }
  }
  steps(game,view,t){
    if(!view||!this.enabled)return;
    for(const p of game.players){
      let s=this.stepsFor.get(p.id);if(!s){s={at:t+.12,flip:false,air:false};this.stepsFor.set(p.id,s);}
      if(!p.alive)continue;
      const own=p.id===view.id,{dist,pan}=this.relative(p,view),gain=own?.13:.18/(1+.23*dist);
      if(!p.grounded){s.air=true;continue;}
      if(s.air){s.air=false;s.at=t+.18;this.sample('land',gain*.85,own?0:pan);}
      if(t<s.at||p.speed<1.7||dist>17)continue;
      s.at=t+(p.slide>0?.48:Math.max(.23,1.8/p.speed));s.flip=!s.flip;
      this.sample(s.flip?'stepA':'stepB',gain*(p.slide>0?.65:1),own?0:pan,(p.slide>0?.77:1)+Math.random()*.06);
    }
  }
  chime(win=true){this.note(win?410:282,win?580:220,.15,.065);this.note(win?686:218,win?855:170,.22,.065,.14);}
}

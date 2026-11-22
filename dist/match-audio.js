import { RELOAD_CONTACT, SHOT_MECHANIC, SNIPER_RELOAD_CONTACT } from './weapon-view.js';

const guns={
  rifle:{length:.34,hold:.018,decay:.064,body:.11,frequency:158,volume:.71,echo:.055,tail:.11,rate:1,foley:1},
  pistol:{length:.23,hold:.012,decay:.040,body:.075,frequency:205,volume:.61,echo:.025,tail:.07,rate:1,foley:1.25},
  shotgun:{length:.64,hold:.015,decay:.044,body:.22,frequency:96,volume:.78,echo:.15,tail:.18,rate:.96,foley:.90,onset:.12},
  sniper:{length:1.12,hold:.016,decay:.090,body:.15,frequency:128,volume:.75,echo:.24,tail:.36,rate:.97,foley:.90},
  smg:{source:'pistol',length:.17,hold:.006,decay:.024,body:.055,frequency:278,volume:.48,echo:.018,tail:.05,rate:1.29,foley:1.38},
  burst:{source:'rifle',length:.26,hold:.010,decay:.040,body:.12,frequency:205,volume:.59,echo:.045,tail:.085,rate:1.12,foley:1.12},
  marksman:{source:'sniper',length:.48,hold:.011,decay:.062,body:.12,frequency:177,volume:.66,echo:.12,tail:.16,rate:1.14,foley:1.04},
  lmg:{source:'rifle',length:.38,hold:.025,decay:.080,body:.20,frequency:87,volume:.65,echo:.06,tail:.12,rate:.81,foley:.78}
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
// Bake once at load time. Direct report and diffuse reflections share one mono
// voice; distant players retain the same weapon identity without a sample swap.
function gunBuffer(ctx,source,profile){
  const input=mono(source),rate=source.sampleRate;
  let peak=0;for(const v of input)peak=Math.max(peak,Math.abs(v));
  let start=input.findIndex(v=>Math.abs(v)>=peak*(profile.onset||.04));
  start=Math.max(0,start-Math.round(rate*.001));
  const buffer=ctx.createBuffer(1,Math.ceil(profile.length*rate),rate),out=buffer.getChannelData(0);
  const gain=.70/(peak||1),hp=Math.exp(-2*Math.PI*38/rate);
  let previous=0,filtered=0,phase=0;
  for(let i=0;i<out.length;i++){
    const t=i/rate,index=start+i*profile.rate,whole=Math.floor(index),mix=index-whole;
    const raw=((input[whole]||0)*(1-mix)+(input[whole+1]||0)*mix)*gain;
    filtered=hp*(filtered+raw-previous);previous=raw;
    const envelope=Math.exp(-Math.max(0,t-profile.hold)/profile.decay);
    phase+=2*Math.PI*profile.frequency*(.45+.55*Math.exp(-t/.025))/rate;
    const body=profile.body*Math.sin(phase)*Math.exp(-t/.040)*(1-Math.exp(-t/.001));
    const fade=Math.min(1,t/.0008,(out.length-1-i)/(rate*.012));
    out[i]=(filtered*envelope+body)*Math.max(0,fade);
  }
  const dry=out.slice(),reflection=new Float32Array(out.length);
  // Unequal delays and low-pass diffusion avoid a repeated gunshot/slapback.
  for(const [seconds,level] of [[.047,1],[.083,.71],[.139,.49],[.223,.28],[.347,.13]]){
    const offset=Math.round(seconds*rate);let low=0;
    const smoothing=1-Math.exp(-2*Math.PI*2400/rate);
    for(let i=offset;i<out.length;i++){
      low+=(dry[i-offset]-low)*smoothing;
      reflection[i]+=low*level*profile.echo;
    }
  }
  let seed=83621,tailLow=0,tailHigh=0;
  const tailStart=.035;
  for(let i=0;i<out.length;i++){
    const t=i/rate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    tailLow+=(seed/2147483648-1-tailLow)*.13;tailHigh+=(tailLow-tailHigh)*.018;
    const envelope=t<tailStart?0:(1-Math.exp(-(t-tailStart)/.012))*Math.exp(-(t-tailStart)/profile.tail);
    out[i]+=(reflection[i]+(tailLow-tailHigh)*profile.echo*.28*envelope)*Math.min(1,(out.length-1-i)/(rate*.03));
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

// Original, deterministic mechanical foley layered with a short CC0 reload
// contact. The click is at buffer start, so it follows the visible contact.
const mechanisms={
  pumpOpen:{duration:.16,frequency:520,grit:.42,decay:.032,drag:.12,seed:3101},
  pumpClose:{duration:.12,frequency:178,grit:.23,decay:.025,drag:.035,seed:4102},
  boltOpen:{duration:.13,frequency:1020,grit:.28,decay:.019,drag:.095,seed:5123},
  boltClose:{duration:.12,frequency:322,grit:.20,decay:.022,drag:.028,seed:6124},
  magOut:{duration:.12,frequency:470,grit:.16,decay:.021,drag:.065,seed:7125},
  magSeat:{duration:.10,frequency:210,grit:.20,decay:.019,drag:.025,seed:8126},
  settle:{duration:.075,frequency:680,grit:.13,decay:.012,drag:.020,seed:9127},
  shell:{duration:.11,frequency:760,grit:.17,decay:.018,drag:.045,seed:1128}
};
function mechanismBuffer(ctx,kind,recording){
  const p=mechanisms[kind],rate=ctx.sampleRate,length=Math.ceil(p.duration*rate);
  const buffer=ctx.createBuffer(1,length,rate),out=buffer.getChannelData(0);
  const recorded=recording?mono(recording):null;
  let onset=0,recordedPeak=0;
  if(recorded){
    for(const v of recorded)recordedPeak=Math.max(recordedPeak,Math.abs(v));
    onset=Math.max(0,recorded.findIndex(v=>Math.abs(v)>=recordedPeak*.12)-Math.round(rate*.0005));
  }
  let seed=p.seed,low=0,peak=0;
  for(let i=0;i<length;i++){
    const t=i/rate,u=t/p.duration;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;low+=(noise-low)*.18;
    const attack=1-Math.exp(-t/.00045),impact=Math.exp(-t/p.decay);
    const metal=Math.sin(2*Math.PI*p.frequency*t)*.30+Math.sin(2*Math.PI*p.frequency*2.71*t)*.09;
    const scrape=(noise-low)*p.grit*Math.exp(-t/p.drag)*(.45+.55*Math.sin(Math.PI*u));
    const real=(recorded?.[onset+i]||0)/(recordedPeak||1)*.21*Math.exp(-t/.035);
    out[i]=(metal*impact+scrape+real)*attack*Math.min(1,(p.duration-t)/.014);
    peak=Math.max(peak,Math.abs(out[i]));
  }
  if(peak)for(let i=0;i<length;i++)out[i]*=.60/peak;
  return buffer;
}

// Short, original foley buffers; generated once, without another audio download.
function meleeBuffer(ctx,kind){
  const swing=kind==='bladeSwing',wall=kind==='bladeWall',duration=swing?.17:wall?.12:.10;
  const rate=ctx.sampleRate,buffer=ctx.createBuffer(1,Math.ceil(rate*duration),rate),data=buffer.getChannelData(0);
  let seed=83921,low=0,previous=0,high=0,phase=0,peak=0;
  const hp=Math.exp(-2*Math.PI*(swing?480:140)/rate);
  for(let i=0;i<data.length;i++){
    const t=i/rate,u=t/duration;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    high=hp*(high+noise-previous);previous=noise;
    const cutoff=swing?2900-1900*u:wall?4200:1100;
    low+=(high-low)*(1-Math.exp(-2*Math.PI*cutoff/rate));
    const envelope=swing?Math.pow(Math.sin(Math.PI*u),1.8):Math.exp(-t/.024)*(1-Math.exp(-t/.001));
    phase+=2*Math.PI*(wall?540:170*Math.exp(-t/.045))/rate;
    const body=swing?0:Math.sin(phase)*.40+(wall?Math.sin(2*Math.PI*2380*t)*Math.exp(-t/.03)*.10:0);
    data[i]=(low+body)*envelope*Math.min(1,(duration-t)/.012);
    peak=Math.max(peak,Math.abs(data[i]));
  }
  if(peak>0)for(let i=0;i<data.length;i++)data[i]*=.65/peak;
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
        for(const kind of ['bladeSwing','bladeHit','bladeWall'])this.buffers.set(kind,meleeBuffer(ctx,kind));
        const resume=ctx.state==='suspended'?ctx.resume().catch(()=>{}):Promise.resolve();
        this.ready=Promise.all([resume,this.loadSamples(ctx)]).then(()=>{
          this.loaded=true;
          const queued=this.pending.splice(0);
          if(this.enabled)for(const cue of queued)if(performance.now()-cue.at<350)this.playEvent(cue.event,cue.actor,cue.view);
        });
      }else if(this.ctx.state==='suspended')return Promise.all([this.ready,this.ctx.resume().catch(()=>{})]);
      return this.ready;
    }catch{return Promise.resolve();}
  }
  async loadSamples(ctx){
    try{
      const {samples}=await import('./assets/match-samples.js');
      await Promise.all(Object.entries(samples).map(async ([id,b64])=>{
        try{
          const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
          const decoded=await ctx.decodeAudioData(bytes.buffer);
          this.buffers.set(id,guns[id]?gunBuffer(ctx,decoded,guns[id]):clip(ctx,decoded));
          for(const [variant,profile] of Object.entries(guns)){
            if(profile.source===id)this.buffers.set(variant,gunBuffer(ctx,decoded,profile));
          }
          if(id==='reload'){
            const release=clip(ctx,decoded,.100,.25,.48),seat=clip(ctx,decoded,.603,.21,.60),rack=clip(ctx,decoded,1.012,.39,.58);
            for(const kind of Object.keys(mechanisms)){
              const recording=kind==='magOut'||kind==='shell'?release:kind==='magSeat'?seat:rack;
              this.buffers.set(kind,mechanismBuffer(ctx,kind,recording));
            }
          }
        }catch(error){console.warn('효과음 해석 실패',id,error);}
      }));
    }catch(error){console.warn('효과음을 불러오지 못했습니다.',error);}
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
    const at=ctx.currentTime+delay;
    const voice={source,gain,priority,actor:options.actor,weapon:options.weapon,reload:options.reload,mechanic:options.mechanic,reloadEnd:options.reloadEnd,at};
    this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};
    source.start(at);return gain;
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
    const origin=['shot','melee','meleeImpact'].includes(event.type)&&Number.isFinite(event.x)&&Number.isFinite(event.z)?event:actor;
    const {dist,pan}=this.relative(origin,view),attenuation=own?1:.65/(1+(dist/9)**1.35),position=own?0:pan;
    const options={priority:own?3:2,lowpass:own?0:Math.max(1800,16000/(1+dist*.12))};
    if(event.type==='melee')this.sample('bladeSwing',.34*attenuation,position,.96+(event.seq%3)*.04,0,options);
    if(event.type==='meleeImpact')this.sample(event.target?'bladeHit':'bladeWall',.44*attenuation,position,.98+(event.seq%3)*.025,0,options);
    if(event.type==='shot'&&guns[event.weapon]){
      const profile=guns[event.weapon],delay=own?0:Math.min(.12,dist/343);
      this.sample(event.weapon,profile.volume*attenuation,position,.988+Math.random()*.024,delay,options);
      // Do not leave a queued reload or previous cycle behind a new shot.
      for(const voice of this.voices)if(voice.actor===actor.id&&(voice.reload||voice.mechanic))this.stop(voice);
      const cycle=SHOT_MECHANIC[event.weapon];
      if(cycle&&actor.alive&&actor.active===event.weapon){
        const mechanicOptions={...options,priority:own?2:1,mechanic:true,actor:actor.id,weapon:event.weapon};
        const pump=event.weapon==='shotgun';
        this.sample(pump?'pumpOpen':'boltOpen',(pump?.29:.24)*attenuation,position,1,delay+cycle.open,mechanicOptions);
        this.sample(pump?'pumpClose':'boltClose',(pump?.35:.29)*attenuation,position,1,delay+cycle.close,mechanicOptions);
      }
    }
    if(event.type==='hit'&&own)this.note(event.headshot?1350:840,event.headshot?1760:1060,.035,.07);
    if(event.type==='kill'&&own){this.note(540,810,.09,.07);this.note(830,1010,.11,.09,.07);}
    if(event.type==='reload'){
      for(const voice of this.voices)if((voice.reload||voice.mechanic)&&voice.actor===actor.id)this.stop(voice);
      if(!actor.alive||actor.active!==event.weapon||!(actor.reload>0))return;
      const reloadOptions={...options,priority:own?2:1,reload:true,actor:actor.id,weapon:event.weapon,reloadEnd:this.ctx.currentTime+actor.reload};
      const duration=actor.reloadDuration||actor.reload;
      const speed=guns[event.weapon]?.foley||1;
      const cue=(sample,phase,level,rate=speed)=>{
        const when=actor.reload-duration*(1-phase);
        if(when>=-.035)this.sample(sample,level*attenuation,position,rate,Math.max(0,when),reloadOptions);
      };
      if(event.weapon==='shotgun')cue('shell',RELOAD_CONTACT.shell,.39,1);
      else if(event.weapon==='sniper'){
        cue('magOut',SNIPER_RELOAD_CONTACT.release,.31);
        cue('magSeat',SNIPER_RELOAD_CONTACT.seat,.42);
        cue('settle',SNIPER_RELOAD_CONTACT.settle,.22);
        if(actor.ammo===0)cue('boltClose',SNIPER_RELOAD_CONTACT.empty,.31,1);
      }
      else{
        cue('magOut',RELOAD_CONTACT.release,.32);
        cue('magSeat',RELOAD_CONTACT.seat,.43);
        cue('settle',RELOAD_CONTACT.settle,event.weapon==='lmg'?.32:.22);
      }
    }
  }
  reconcile(game){
    for(const voice of this.voices)if(voice.reload||voice.mechanic){
      const actor=game.players.find(p=>p.id===voice.actor);
      // Natural completion may leave a few milliseconds of contact decay.
      // Early cancellation, death or an equip change must silence it instead.
      const canceled=voice.reload&&actor?.reload<=0&&this.ctx.currentTime<voice.reloadEnd-.08;
      if(!actor?.alive||actor.active!==voice.weapon||canceled)this.stop(voice);
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

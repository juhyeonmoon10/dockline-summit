import {KARAMBIT_RING} from './knife-types.js';

// The same authored surfaces feed the full renderer, the software renderer and the armory.
// Coordinates here are viewmodel space. The grip origin stays fixed during a change of pose.
const cache=new Map(),tau=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function part(name,finish,pivot=[0,0,0]){
  return {name,finish,pivot,positions:[],colors:[]};
}
function tri(m,a,b,c,color){
  m.positions.push(...a,...b,...c);m.colors.push(color);
}
function quad(m,a,b,c,d,color){tri(m,a,b,c,color);tri(m,a,c,d,color);}
function face(m,points,z,color,back){
  const ring=points.map((p,i)=>i);
  while(ring.length>2){
    let ear=-1;
    for(let k=0;k<ring.length;k++){
      const a=points[ring[(k+ring.length-1)%ring.length]],b=points[ring[k]],c=points[ring[(k+1)%ring.length]];
      if(cross(a,b,c)<=1e-10)continue;
      const occupied=ring.some(i=>{
        const v=points[i];
        return v!==a&&v!==b&&v!==c&&cross(a,b,v)>=-1e-10&&cross(b,c,v)>=-1e-10&&cross(c,a,v)>=-1e-10;
      });
      if(occupied)continue;
      const aa=[...a,z],bb=[...b,z],cc=[...c,z];tri(m,aa,back?cc:bb,back?bb:cc,color);
      ear=k;break;
    }
    if(ear===-1)throw Error('Invalid knife face');
    ring.splice(ear,1);
  }
}
function easedOutline(points){
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    for(const t of [.18,.82])out.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);
  }
  return out;
}
function ccw(points){
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-a[1]*b[0];
  }
  return area>0?points:points.slice().reverse();
}
function inset(points,width){
  return points.map((p,i)=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
    let nx=p[0]-a[0],ny=p[1]-a[1],mx=b[0]-p[0],my=b[1]-p[1];
    const n=Math.hypot(nx,ny),m=Math.hypot(mx,my);nx/=n;ny/=n;mx/=m;my/=m;
    const f=width/Math.max(.50,1+nx*mx+ny*my);
    return [p[0]-(ny+my)*f,p[1]+(nx+mx)*f];
  });
}
function plate(m,outline,z,half,bevel,surface,rim){
  const p=ccw(outline),q=inset(p,bevel),edge=Math.min(half*.62,bevel);
  face(m,q,z+half,surface,false);face(m,q,z-half,surface,true);
  for(let i=0;i<p.length;i++){
    const j=(i+1)%p.length;
    quad(m,[...p[i],z+half-edge],[...p[j],z+half-edge],[...q[j],z+half],[...q[i],z+half],rim);
    quad(m,[...p[i],z-half+edge],[...p[j],z-half+edge],[...p[j],z+half-edge],[...p[i],z+half-edge],rim);
    quad(m,[...q[i],z-half],[...q[j],z-half],[...p[j],z-half+edge],[...p[i],z-half+edge],rim);
  }
}
// A machined annulus retains the open hole and stepped lips when viewed from the edge.
function ring(m,x,y,z,outer,inner,h,faceColor,sideColor,lipColor,count=28){
  const bevel=Math.min((outer-inner)*.22,h*.52),profile=[
    [inner,-h+bevel],[inner+bevel,-h],[outer-bevel,-h],[outer,-h+bevel],
    [outer,h-bevel],[outer-bevel,h],[inner+bevel,h],[inner,h-bevel]
  ],tints=[lipColor,faceColor,lipColor,sideColor,lipColor,faceColor,lipColor,sideColor];
  for(let i=0;i<count;i++){
    const a=i*tau/count,b=(i+1)*tau/count;
    const point=(j,angle)=>[x+profile[j][0]*Math.cos(angle),y+profile[j][0]*Math.sin(angle),z+profile[j][1]];
    for(let j=0;j<profile.length;j++){
      const k=(j+1)%profile.length;
      // A single enamel insert runs across the visible outside of the loop.
      // The polished inner lip remains continuous as the loop turns edge-on.
      const enamel=i>=Math.floor(count*.41)&&i<Math.floor(count*.86);
      const ink=enamel&&(j===1||j===5)?0x76c6b4:enamel&&j===3?0x548e85:tints[j];
      quad(m,point(j,a),point(j,b),point(k,b),point(k,a),ink);
    }
  }
}
// A recessed centre and a polished shoulder read as separate surfaces in the turntable.
function pivotDisc(m,x,y,z,r,amber=false){
  const side=Math.sign(z),n=16,back=side<0;
  function band(a,b,ha,hb,ink){
    for(let i=0;i<n;i++){
      const v=j=>[Math.cos(j*tau/n),Math.sin(j*tau/n)];
      const pt=(j,s,h)=>{const [u,vv]=v(j);return [x+u*s*r,y+vv*s*r,z+side*h];};
      const p=pt(i,a,ha),q=pt(i+1,a,ha),t=pt(i+1,b,hb),s=pt(i,b,hb);
      if(back)quad(m,s,t,q,p,ink);else quad(m,p,q,t,s,ink);
    }
  }
  band(1,.79,0,.0009,amber?0xee9a50:0x858e91);
  band(.79,.66,.0009,.0004,amber?0x9d542a:0x30383b);
  band(.66,.57,.0004,.0014,0x99a3a7);
  const core=Array.from({length:n},(_,i)=>[x+Math.cos(tau*i/n)*r*.57,y+Math.sin(tau*i/n)*r*.57]);
  face(m,core,z+side*.0014,0x687278,back);
  const slot=Array.from({length:12},(_,i)=>{
    const s=(i%2?.18:.29)*r;return [x+Math.cos(tau*i/12+.15)*s,y+Math.sin(tau*i/12+.15)*s];
  });
  face(m,slot,z+side*.0015,0x24292b,back);
}
function blendColor(a,b,t){
  const ch=n=>Math.round(mix((a>>n)&255,(b>>n)&255,t));
  return (ch(16)<<16)|(ch(8)<<8)|ch(0);
}
// The profile changes along the sweep. The distal swedge grows into the tip,
// whilst the highlight on the main face crosses the changing surface normal.
function groundBlade(m,stations,palette){
  const sections=[];
  for(let i=0;i<stations.length-1;i++){
    const a=stations[Math.max(0,i-1)],b=stations[i],c=stations[i+1],d=stations[Math.min(stations.length-1,i+2)];
    sections.push(b,b.map((v,k)=>(9*(v+c[k])-a[k]-d[k])/16));
  }
  sections.push(stations.at(-1));
  function profile(s,sign,t){
    const [ax,ay,bx,by,h,
      swedge=.035+.24*Math.pow(Math.max(0,(t-.25)/.75),.75),
      ridge=.62-.24*t+.035*Math.sin(t*Math.PI*2)]=s;
    const coords=[[0,.31],[swedge,.77],[ridge,1],[.825,.48],[.944,.10],[1,0]];
    return coords.map(([f,z])=>[mix(ax,bx,f),mix(ay,by,f),h*z*sign]);
  }
  for(let i=0;i<sections.length-1;i++){
    const t=i/(sections.length-1),u=(i+1)/(sections.length-1),s=sections[i],next=sections[i+1];
    for(const sign of [-1,1]){
      const a=profile(s,sign,t),b=profile(next,sign,u);
      for(let j=0;j<5;j++){
        const tint=blendColor(palette[j][0],palette[j][1],t);
        if(sign===1)quad(m,a[j],b[j],b[j+1],a[j+1],tint);
        else quad(m,a[j+1],b[j+1],b[j],a[j],tint);
        if(i===0)quad(m,a[j+1],a[j],[a[j][0],a[j][1],0],[a[j+1][0],a[j+1][1],0],tint);
      }
    }
    quad(m,[s[0],s[1],-s[4]*.31],[next[0],next[1],-next[4]*.31],
      [next[0],next[1],next[4]*.31],[s[0],s[1],s[4]*.31],palette[0][1]);
  }
}
// Section pairs are shared with the small silhouettes shown by the lite renderer.
// The last two columns mark the spine facet and grind line across each section.
// They converge into the point and cut diagonally across the shoulder.
export const karambitBladeSections=[
  [.014,.019,-.058,.019,.010,.045,.77], [.022,.049,-.059,.042,.0125,.043,.76],
  [.024,.078,-.054,.056,.0135,.037,.71], [.019,.108,-.058,.075,.0135,.033,.44],
  [.006,.136,-.068,.093,.013,.029,.37], [-.017,.161,-.084,.108,.012,.025,.35],
  [-.045,.178,-.103,.120,.0108,.024,.37], [-.075,.187,-.125,.129,.009,.041,.44],
  [-.106,.188,-.145,.133,.007,.11,.54], [-.136,.178,-.160,.135,.005,.23,.64],
  [-.161,.158,-.173,.134,.0027,.36,.72], [-.183,.133,-.183,.133,0,.44,.77]
];
export const karambitGripSections=[
  [-.181,.007,.033],[-.173,.003,.041],[-.161,-.004,.049],[-.149,-.006,.055],
  [-.138,.001,.059],[-.129,.004,.061],[-.123,.001,.061],[-.116,-.009,.061],
  [-.108,-.015,.061],[-.100,-.016,.060],[-.088,-.010,.058],[-.081,-.006,.056],
  [-.075,-.008,.055],[-.067,-.021,.053],[-.060,-.025,.051],[-.052,-.024,.048],
  [-.042,-.018,.045],[-.035,-.019,.043],[-.029,-.030,.041],[-.024,-.039,.039],
  [-.015,-.044,.036],[-.006,-.045,.034],[.003,-.044,.030],[.010,-.054,.028],
  [.017,-.067,.026],[.023,-.071,.024],[.030,-.065,.022],[.035,-.054,.021],
  [.041,-.033,.018],[.044,-.012,.013],[.0445,-.002,.009]
];
function gripWidth(y){
  let i=1;while(i<karambitGripSections.length-1&&y>karambitGripSections[i][0])i++;
  const [a,l,r]=karambitGripSections[i-1],[b,L,R]=karambitGripSections[i],t=Math.max(0,Math.min(1,(y-a)/(b-a)));
  return [mix(l,L,t),mix(r,R,t)];
}
function karambit(){
  const blade=part('blade','steel'),grip=part('grip','grip'),metal=part('fittings','hardware');
  groundBlade(blade,karambitBladeSections,[
    [0xa9c1c8,0x9aaeb5],[0x4c636d,0x829397],[0x899da3,0xb5c4c6],
    [0xbccacb,0xdce3e2],[0xe4ebe4,0xf6f6ea]
  ]);
  const tang=karambitGripSections.map(([y,l])=>[l-.0015,y]).concat(karambitGripSections.slice().reverse().map(([y,,r])=>[r+.0015,y]));
  plate(metal,tang,0,.014,.0018,0x424d55,0x91a1a7);
  // A continuous crown gives the rubber scales a convex surface and the open
  // grooves a shadow that moves as the player rolls the hand.
  const widths=[0,.060,.18,.41,.64,.83,.95,1],heights=[.0100,.0150,.0198,.0235,.0227,.0200,.015,.010];
  const shell=(y,f,sign,lift=0)=>{
    const [l,r]=gripWidth(y);
    let j=1;while(j<widths.length-1&&f>widths[j])j++;
    return [mix(l+.002,r-.002,f),y,sign*(mix(heights[j-1],heights[j],(f-widths[j-1])/(widths[j]-widths[j-1]))+lift)];
  };
  const shades=[0x202c30,0x283538,0x334346,0x38494a,0x304042,0x293539,0x222c31];
  for(const side of [-1,1]){
    function patch(a,b,c,d,ink){if(side===1)quad(grip,a,b,c,d,ink);else quad(grip,d,c,b,a,ink);}
    for(let i=1;i<karambitGripSections.length;i++){
      const y=karambitGripSections[i-1][0],Y=karambitGripSections[i][0];
      for(let j=1;j<widths.length;j++){
        const l=widths[j-1],r=widths[j];
        patch(shell(y,l,side),shell(y,r,side),shell(Y,r,side),shell(Y,l,side),shades[j-1]);
      }
    }
    // Interrupted ribs follow the palm. Each rib has a lit shoulder and a shadow line.
    for(let row=0;row<5;row++){
      const y=-.141+row*.027;
      for(const [a,b,c,d] of [[.16,.44,.002,.013],[.44,.67,.013,.020],[.67,.84,.020,.018]]){
        const p=shell(y+c,a,side,.0006),q=shell(y+d,b,side,.0006);
        const r=shell(y+d+.003,b,side,.002),s=shell(y+c+.003,a,side,.002);
        patch(p,q,r,s,0x5e7373);
        patch(s,r,shell(y+d+.008,b,side,.0006),shell(y+c+.008,a,side,.0006),0x202c30);
      }
    }
    // An angled metal collar marks the join at the blade shoulder.
    for(let j=1;j<widths.length;j++){
      const a=widths[j-1],b=widths[j];
      const collar=(f,d)=>shell(.008+.016*f+d,f,side,.001);
      const p=collar(a,0),q=collar(b,0),s=collar(a,.012),r=collar(b,.012);
      const u=collar(a,.0025),v=collar(b,.0025);
      if(side>0){quad(metal,u,v,r,s,0x627b7b);quad(metal,p,q,v,u,0xb0d7ce);}
      else{quad(metal,s,r,v,u,0x627b7b);quad(metal,u,v,q,p,0xb0d7ce);}
    }
    pivotDisc(metal,.023,-.153,side*.0238,.0065);
    pivotDisc(metal,-.010,.025,side*.0250,.006);
  }
  ring(metal,...KARAMBIT_RING,.049,.0345,.0137,0x56666a,0x38474a,0xbacccc,48);
  return [blade,grip,metal];
}
// Shape the two cast frames with different shoulders while keeping a continuous
// line when both handles sit together. The open end slots go through both cheeks.
const handleRows=[
  [-.299,.009,0],[-.296,.015,0],[-.289,.018,0],[-.278,.018,0],
  [-.271,.018,.004],[-.264,.018,.008],[-.255,.017,.0075],[-.249,.017,.004],[-.245,.017,0],
  [-.226,.017,0],[-.219,.017,.006],[-.210,.017,.0102],[-.183,.0175,.0106],
  [-.172,.0176,.0076],[-.166,.0176,0],[-.144,.0175,0],[-.138,.0173,.006],
  [-.128,.0173,.0102],[-.111,.017,.0102],[-.103,.017,.0078],[-.096,.017,0],
  [-.085,.017,0],[-.077,.017,0],[-.069,.017,.004],[-.063,.0168,.0072],
  [-.054,.0164,.0074],[-.046,.0168,.0066],[-.040,.017,.003],[-.037,.017,0],
  [-.026,.018,0],[-.015,.020,0],[.002,.021,0],[.012,.0188,0],[.018,.012,0],[.019,.007,0]
];
function centreLine(y,side){
  const t=Math.max(0,-y/.299),bend=Math.sin(t*Math.PI);
  return -.041*bend+(.007+side*.004)*t*t+side*.0028*bend;
}
function handleFrame(m,side){
  const flat=.017,edge=.014,inside=.0095;
  m.inlays=[];
  function point(row,f,z){
    const [y,outer,inner]=row;
    return [centreLine(y,side)+Math.sign(f)*(Math.abs(f)===1?outer:inner),y,z];
  }
  for(const sign of [-1,1]){
    for(let i=0;i<handleRows.length-1;i++){
      const a=handleRows[i],b=handleRows[i+1];
      for(const wing of [-1,1]){
        const op=point(a,wing,sign*flat),oq=point(b,wing,sign*flat);
        const iq=point(b,wing*.5,sign*flat),ip=point(a,wing*.5,sign*flat);
        op[0]-=wing*.0024;oq[0]-=wing*.0024;
        if(b[2])iq[0]+=wing*.0016;if(a[2])ip[0]+=wing*.0016;
        const panel=(p,q,r,s,c)=>sign*wing>0?quad(m,p,q,r,s,c):quad(m,s,r,q,p,c);
        const raised=a[0]>=-.037||b[0]<=-.245;
        panel(op,oq,iq,ip,raised?0x53636c:0x404e58);
        const aEdge=point(a,wing,sign*edge),bEdge=point(b,wing,sign*edge);
        panel(aEdge,bEdge,oq,op,raised?0xb0bcc1:0xa0b0b4);
        panel(point(a,wing,sign*inside),point(b,wing,sign*inside),bEdge,aEdge,0x42494c);
        if(a[2]||b[2]){
          const ar=point(a,wing*.5,sign*edge),br=point(b,wing*.5,sign*edge);
          panel(ip,iq,br,ar,0x94a4ab);
          panel(ar,br,point(b,wing*.5,sign*inside),point(a,wing*.5,sign*inside),0x343b40);
        }
        panel(point(a,wing*.5,sign*inside),point(b,wing*.5,sign*inside),
          point(b,wing,sign*inside),point(a,wing,sign*inside),0x42494d);
      }
    }
    for(const row of [handleRows[0],handleRows.at(-1)]){
      quad(m,point(row,-1,sign*inside),point(row,1,sign*inside),point(row,1,sign*flat),point(row,-1,sign*flat),0x606767);
    }
    pivotDisc(m,0,0,sign*.0173,.0120,true);
    pivotDisc(m,centreLine(-.286,side),-.286,sign*.0173,.0039);
    // Short angled guards leave the open rails visible in silhouette mid-flip.
    const across=[-1,-.83,-.67,0,.67,.83,1],depth=[.0173,.018,.0193,.0205,.0193,.018,.0173];
    const lacquer=(row,f,z)=>[centreLine(row[0],side)+row[1]*f,row[0]+.002*f*side,sign*z];
    const start=m.colors.length;
    for(const [top,bottom,warm] of [[-.243,-.227,false],[-.165,-.145,true],[-.095,-.078,false]]){
      const ink=warm?[0x513b2e,0x935434,0xc27741,0xdb8a4e,0xa25d35,0x553a2e]
        :[0x303a41,0x45535b,0x56636a,0x606c73,0x48565d,0x313b42];
      const panelRows=[[top,.005],[top+.0032,.011],[bottom-.0038,.012],[bottom,.004]];
      for(let j=1;j<panelRows.length;j++){
        const a=panelRows[j-1],b=panelRows[j];
        for(let k=1;k<across.length;k++){
          const l=across[k-1],r=across[k],p=lacquer(a,l,depth[k-1]),q=lacquer(a,r,depth[k]);
          const v=lacquer(b,r,depth[k]),w=lacquer(b,l,depth[k-1]);
          sign>0?quad(m,p,q,v,w,ink[k-1]):quad(m,w,v,q,p,ink[k-1]);
        }
      }
    }
    m.inlays.push([start,m.colors.length]);
    pivotDisc(m,centreLine(-.155,side),-.155,sign*.0205,.0038);
  }
}
function balisong(){
  const base=[.022,.062,0],hinge=[-.023,.062,0];
  const fixed=part('grip','hardware',base),blade=part('blade','steel',base),swing=part('handle','hardware',hinge);
  swing.parentPivot=base;
  handleFrame(fixed,1);handleFrame(swing,-1);
  const tang=[[-.057,-.006],[-.053,.015],[-.043,.024],[.011,.029],[.014,.013],[.011,-.009],
    [.003,-.017],[-.011,-.020],[-.020,-.014],[-.034,-.016],[-.041,-.019],[-.052,-.015]];
  plate(blade,tang,0,.0073,.0014,0x697578,0x969e9c);
  // A shallow forward sweep replaces the straight spear silhouette. The heel
  // and tip curve away from the long insets in the opposite direction.
  groundBlade(blade,[
    [.008,.019,-.039,.018,.007],[.010,.035,-.038,.032,.0075],
    [.013,.047,-.047,.042,.0080],[.018,.066,-.043,.060,.0085],
    [.023,.097,-.033,.089,.0090],[.031,.130,-.025,.121,.0090],
    [.036,.161,-.022,.152,.0088],[.038,.190,-.022,.182,.0083],
    [.035,.216,-.021,.207,.0074],[.030,.237,-.020,.225,.0067],
    [.008,.265,-.024,.250,.0048],[-.008,.280,-.025,.268,.003],
    [-.032,.294,-.032,.294,0]
  ],[[0xb3bfc2,0xd6dddd],[0x50616d,0x788793],[0x81939c,0xaab8be],
     [0xb6c3c7,0xd4dedd],[0xd9e3e3,0xf2f2e8]]);
  const cx=centreLine(-.299,-1);
  const endLock=[[.004,-.294],[.006,-.302],[.002,-.310],[-.015,-.318],[-.030,-.316],[-.032,-.312],
    [-.017,-.313],[-.006,-.305],[-.006,-.294]].map(([x,y])=>[x+cx,y]);
  plate(swing,easedOutline(endLock),0,.006,.001,0xa56339,0xe79a57);
  return [fixed,blade,swing];
}
export function knifeParts(skin='karambit'){
  const key=skin==='balisong'?'balisong':'karambit';
  if(!cache.has(key)){
    const parts=key==='balisong'?balisong():karambit();
    for(const p of parts){p.positions=new Float32Array(p.positions);p.colors=new Uint32Array(p.colors);}
    cache.set(key,parts);
  }
  return cache.get(key);
}
const drawFrames=[[0,3.10,0],[.042,3.04,-.27],[.097,2.42,-1.42],[.14,1.55,-2.43],
  [.178,1.32,-2.24],[.242,.62,-1.26],[.29,-.045,.082],[.335,.025,-.045],[.42,0,0]];
const inspectFrames=[[0,0,0],[.092,-.025,.085],[.14,.13,-.38],[.238,.62,-2.04],[.296,1.13,-2.66],
  [.39,2.79,-.61],[.47,3.085,-.06],[.57,3.085,-.06],[.652,2.86,.53],[.70,2.29,1.92],
  [.782,1.41,2.78],[.868,.67,1.62],[.96,-.038,-.075],[1.006,.02,.043],[1.073,0,0]];
const open={blade:0,handle:0};
function hingePose(frames,t){
  if(!(t>=0)||t>=frames.at(-1)[0])return open;
  let i=1;while(t>frames[i][0])i++;
  const a=frames[i-1],b=frames[i],v=(t-a[0])/(b[0]-a[0]),ease=v*v*(3-2*v);
  return {blade:mix(a[1],b[1],ease),handle:mix(a[2],b[2],ease)};
}
export function knifeAngles(skin,drawAge=Infinity,inspectAge=Infinity){
  if(skin!=='balisong')return open;
  return Number.isFinite(inspectAge)?hingePose(inspectFrames,inspectAge):hingePose(drawFrames,drawAge);
}
export function knifePartPose(part,angles){
  let [x,y,z]=part.pivot;
  if(part.parentPivot){
    const [px,py]=part.parentPivot,dx=x-px,dy=y-py,c=Math.cos(angles.blade),s=Math.sin(angles.blade);
    x=px+dx*c-dy*s;y=py+dx*s+dy*c;
  }
  return {x,y,z,rz:angles[part.name]||0};
}

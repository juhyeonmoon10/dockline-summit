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
    const [ax,ay,bx,by,h]=s;
    const swedge=.035+.24*Math.pow(Math.max(0,(t-.25)/.75),.75);
    const ridge=.62-.24*t+.035*Math.sin(t*Math.PI*2);
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
const gripSections=[
  [-.181,.007,.032],[-.175,-.003,.040],[-.161,-.010,.046],[-.147,-.012,.049],
  [-.139,-.009,.049],[-.131,-.003,.048],[-.122,-.003,.047],[-.115,-.013,.046],
  [-.110,-.020,.045],[-.103,-.022,.045],[-.096,-.020,.045],[-.085,-.010,.045],
  [-.077,-.008,.045],[-.068,-.017,.045],[-.060,-.028,.045],[-.055,-.030,.046],
  [-.047,-.029,.046],[-.038,-.020,.045],[-.031,-.020,.044],[-.022,-.031,.043],
  [-.016,-.039,.043],[-.009,-.043,.044],[.001,-.045,.045],[.009,-.055,.045],
  [.018,-.067,.045],[.025,-.069,.045],[.032,-.060,.043],[.039,-.036,.039],[.044,-.020,.031],[.045,.001,.023]
];
function gripWidth(y){
  let i=1;while(i<gripSections.length-1&&y>gripSections[i][0])i++;
  const [a,l,r]=gripSections[i-1],[b,L,R]=gripSections[i],t=Math.max(0,Math.min(1,(y-a)/(b-a)));
  return [mix(l,L,t),mix(r,R,t)];
}
function karambit(){
  const blade=part('blade','steel'),grip=part('grip','grip'),metal=part('fittings','hardware');
  groundBlade(blade,[
    [.035,.024,-.042,.027,.0105],[.040,.056,-.043,.058,.012],
    [.040,.085,-.032,.080,.012],[.025,.129,-.043,.110,.012],
    [.006,.165,-.061,.132,.012],[-.022,.196,-.084,.152,.012],
    [-.052,.219,-.111,.168,.0115],[-.088,.235,-.143,.181,.0105],
    [-.128,.244,-.175,.190,.0095],[-.166,.244,-.202,.189,.008],
    [-.199,.235,-.228,.180,.0066],[-.230,.220,-.248,.166,.005],
    [-.250,.199,-.265,.148,.0034],[-.265,.174,-.276,.129,.0018],
    [-.283,.106,-.283,.106,0]
  ],[[0xa6b9c2,0xc8d6de],[0x415665,0x677b88],[0x8598a1,0xa2b3bc],
     [0xc1ced0,0xe1e9e8],[0xe1e8e4,0xf2f3ed]]);
  const tang=gripSections.map(([y,l])=>[l-.0015,y]).concat(gripSections.slice().reverse().map(([y,,r])=>[r+.0015,y]));
  plate(metal,tang,0,.014,.0018,0x424d55,0x91a1a7);
  // A continuous crown gives the rubber scales a convex surface and the open
  // grooves a shadow that moves as the player rolls the hand.
  const widths=[0,.060,.18,.41,.64,.83,.95,1],heights=[.0100,.0150,.0198,.0235,.0227,.0200,.015,.010];
  const shell=(y,f,sign,lift=0)=>{
    const [l,r]=gripWidth(y);
    let j=1;while(j<widths.length-1&&f>widths[j])j++;
    return [mix(l+.002,r-.002,f),y,sign*(mix(heights[j-1],heights[j],(f-widths[j-1])/(widths[j]-widths[j-1]))+lift)];
  };
  const shades=[0x242a30,0x2b3238,0x343c42,0x343d43,0x30393f,0x292f35,0x21272d];
  for(const side of [-1,1]){
    function patch(a,b,c,d,ink){if(side===1)quad(grip,a,b,c,d,ink);else quad(grip,d,c,b,a,ink);}
    for(let i=1;i<gripSections.length;i++){
      const y=gripSections[i-1][0],Y=gripSections[i][0];
      for(let j=1;j<widths.length;j++){
        const l=widths[j-1],r=widths[j];
        patch(shell(y,l,side),shell(y,r,side),shell(Y,r,side),shell(Y,l,side),shades[j-1]);
      }
    }
    // Discrete raised diagonal chevrons span the crown and reveal a graphite rim.
    for(let row=0;row<7;row++){
      const y=-.145+row*.022;
      for(let j=2;j<6;j++){
        const x=widths[j-1],X=widths[j],d=f=>(1-f)*.016+.0006*Math.sin(f*6);
        const strip=(f,py,h)=>shell(y+d(f)+py,f,side,h);
        patch(strip(x,0,0),strip(X,0,0),strip(X,.003,.0021),strip(x,.003,.0021),0x54616a);
        patch(strip(x,.003,.0021),strip(X,.003,.0021),strip(X,.009,0),strip(x,.009,0),0x262c31);
      }
    }
    // The top collar is intentionally smooth so the two finish families read at distance.
    for(let i=0;i<18;i++){
      const a=.07+.85*i/18,b=.07+.85*(i+1)/18;
      const collar=(f,d)=>shell(.017+.015*Math.sin(Math.PI*f)+d,f,side,.00055);
      const p=collar(a,0),q=collar(b,0),s=collar(a,.0023),r=collar(b,.0023);
      if(side>0)quad(metal,p,q,r,s,0x67706d);
      else quad(metal,s,r,q,p,0x67706d);
    }
    pivotDisc(metal,.018,-.151,side*.0236,.0062);
    pivotDisc(metal,-.013,.019,side*.0238,.0065);
  }
  ring(metal,.018,-.210,0,.0475,.036,.0137,0x56616a,0x323c43,0xb4c6c8,48);
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

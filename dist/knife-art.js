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
// Both cheeks are continuous around the open center, with a broader shoulder
// at the pointed rear of the profile. The bevel picks up the studio light.
function silverRing(m){
  const [x,y]=KARAMBIT_RING,steps=96,h=.013;
  function section(angle){
    const [outer,inner]=karambitRingRadii(angle);
    return [[inner,-h+.0022],[inner+.0022,-h],[outer-.0020,-h],[outer,-h+.002],
      [outer,h-.002],[outer-.0020,h],[inner+.0022,h],[inner,h-.0022]]
      .map(([r,z])=>[x+r*Math.cos(angle),y+r*Math.sin(angle),z]);
  }
  const shades=[0x898682,0xe4e1db,0xf2f0eb,0xb5b4b0,0xf4f2ee,0xe4e1db,0x898682,0xc7c6c2];
  let before=section(0);
  for(let i=1;i<=steps;i++){
    const after=section(i*tau/steps);
    for(let j=0;j<shades.length;j++){
      const k=(j+1)%shades.length;
      quad(m,before[j],after[j],after[k],before[k],shades[j]);
    }
    before=after;
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
// The side profile is authored on a common artboard. Its origin at the finger
// ring also anchors the first-person spin, equipment cards and software view.
const artScale=.00068;
function profilePoint(u,v){
  return [KARAMBIT_RING[0]+(95-v)*artScale,KARAMBIT_RING[1]+(626-u)*artScale];
}
// Opposing contours advance together to give the silver face an uninterrupted sweep.
export const karambitBladeSections=[
  [219,50,290,166,.010,.12,.48],[202,58,275,166,.010,.14,.48],
  [178,71,250,168,.010,.23,.47],[154,85,221,175,.0098,.27,.45],
  [130,103,194,186,.0093,.23,.42],[105,124,165,200,.0086,.21,.40],
  [82,146,137,217,.0078,.19,.37],[61,170,110,235,.0069,.16,.34],
  [43,198,87,257,.0058,.14,.31],[28,226,66,281,.0048,.11,.29],
  [16,257,49,304,.0039,.09,.27],[8,288,35,328,.0031,.08,.25],
  [4,319,23,353,.0022,.07,.24],[3,348,15,376,.0014,.07,.22],
  [5,373,11,391,.0007,.07,.22],[9,398,9,398,0,.07,.22]
].map(([u,v,U,V,h,spine,ridge])=>[...profilePoint(u,v),...profilePoint(U,V),h,spine,ridge]);

// Across each row the lower contour makes the guard and three finger scallops;
// the upper contour holds the thumb notches and the uninterrupted back pad.
const gripRows=[
  [194,96,102],[199,89,107],[205,80,109],[210,72,109],[212,48,110],
  [220,45,111],[235,44,116],[242,44,120],[246,48,123],[250,43,126],
  [254,47,130],[258,43,135],[262,46,139],[266,41,144],[270,45,149],
  [274,40,157],[278,43,170],[282,38,175],[286,41,176],[290,37,176],
  [294,39,176],[298,35,176],[302,37,175],[305,33,154],[309,35,137],
  [313,30,126],[317,32,118],[322,27,111],[326,29,106],[330,24,104],
  [335,25,101],[340,19,99],[345,21,97],[350,15,96],[362,13,96],
  [376,11,99],[388,9,105],[398,8,113],[404,8,106],[416,6,99],
  [429,5,95],[443,4,93],[456,4,95],[470,3,100],[481,3,109],
  [486,3,113],[493,3,106],[505,3,100],[518,3,97],[526,3,97],
  [530,9,98],[535,11,99],[540,8,101],[543,4,102],[547,6,104],
  [550,11,106],[556,13,111],[561,10,117],[564,6,99],[568,7,81],
  [572,13,72],[578,16,64],[583,12,58],[585,8,55],[589,13,52],
  [595,18,46],[600,17,43],[605,12,40],[609,13,39],[613,20,37],
  [618,22,35],[624,18,34],[626,16,33],[635,19,31],[643,21,31],[644,28,30]
];
export const karambitGripSections=gripRows.map(([u,top,bottom])=>{
  const [left,y]=profilePoint(u,bottom);
  return [y,left,profilePoint(u,top)[0]];
}).reverse();

const loopOutline=[
  [626,31],[652,31],[673,54],[697,78],[721,94],[701,106],[691,114],
  [682,128],[673,141],[659,151],[642,157],[626,159],[608,157],
  [591,151],[577,140],[568,126],[562,111],[561,94],[563,76],
  [571,61],[582,47],[596,38],[611,33]
].map(([u,v])=>[(95-v)*artScale,(626-u)*artScale]);
export function karambitRingRadii(angle){
  const dx=Math.cos(angle),dy=Math.sin(angle);
  for(let i=0;i<loopOutline.length;i++){
    const [x,y]=loopOutline[i],[X,Y]=loopOutline[(i+1)%loopOutline.length];
    const den=dx*(Y-y)-dy*(X-x);
    if(Math.abs(den)<1e-10)continue;
    const t=(x*(Y-y)-y*(X-x))/den,k=(x*dy-y*dx)/den;
    if(t>0&&k>=-1e-8&&k<=1.00000001)return [t,.034];
  }
  throw Error('Open karambit ring outline');
}

function karambit(){
  const blade=part('blade','steel'),grip=part('grip','grip'),metal=part('fittings','hardware');
  groundBlade(blade,karambitBladeSections,[
    [0x757c84,0x939a9f],[0x949fa6,0xb8bfc4],[0xdfe4e6,0xe1e5e6],
    [0xc5cbce,0xe1e3e3],[0x969ea2,0xeef1f2]
  ]);
  const outline=karambitGripSections.map(([y,l])=>[l,y])
    .concat(karambitGripSections.slice().reverse().map(([y,,r])=>[r,y]));
  plate(grip,outline,0,.012,.0005,0x222324,0x2c2d2e);
  const fractions=[0,.05,.17,.35,.55,.76,.91,1];
  const heights=[.012,.017,.022,.025,.026,.023,.019,.012];
  const shades=[0x232425,0x2d2f30,0x393b3c,0x323435,0x292b2c,0x2b2d2e,0x222324];
  // Each sculpted pad rolls towards its own finger hollow. The stippled insert
  // and diagonally ribbed guard sit just proud of this continuous black shell.
  function level(u){
    let i=1;while(i<gripRows.length-1&&u>gripRows[i][0])i++;
    const [a,t,b]=gripRows[i-1],[A,T,B]=gripRows[i],f=Math.min(1,Math.max(0,(u-a)/(A-a)));
    return [mix(t,T,f),mix(b,B,f)];
  }
  function skin(u,v,side,lift=0){
    const [top,bottom]=level(u),f=Math.min(1,Math.max(0,(bottom-v)/(bottom-top)));
    let j=1;while(j<fractions.length-1&&f>fractions[j])j++;
    const h=mix(heights[j-1],heights[j],(f-fractions[j-1])/(fractions[j]-fractions[j-1]));
    const pad=1-Math.min(1,Math.abs(u-353)/50,Math.abs(u-443)/45,Math.abs(u-525)/41);
    return [...profilePoint(u,v),side*(h+.006*pad*Math.sin(f*Math.PI)+lift)];
  }
  for(const side of [-1,1]){
    function band(a,b,c,d,ink){
      if(side*cross(a,b,c)>0)quad(grip,a,b,c,d,ink);else quad(grip,d,c,b,a,ink);
    }
    for(let i=1;i<gripRows.length;i++){
      const [u,t,b]=gripRows[i-1],[U,T,B]=gripRows[i];
      for(let j=1;j<fractions.length;j++){
        const l=fractions[j-1],r=fractions[j];
        band(skin(u,mix(b,t,l),side),skin(U,mix(B,T,l),side),
          skin(U,mix(B,T,r),side),skin(u,mix(b,t,r),side),shades[j-1]);
      }
    }
    // Pinched diagonal ribs on the triangular black guard panel.
    for(let i=0;i<17;i++){
      const a=i/17,b=(i+1)/17;
      const left=t=>[232+47*t,61+73*t],right=t=>[330-34*t,51+81*t];
      const p=t=>skin(...left(t),side,.0010),q=t=>skin(...right(t),side,.0010);
      const m=t=>skin(...left(t),side,.0018),n=t=>skin(...right(t),side,.0018);
      band(p(a),q(a),n(a+(b-a)*.36),m(a+(b-a)*.36),0x434647);
      band(m(a+(b-a)*.36),n(a+(b-a)*.36),q(b),p(b),0x252627);
    }
    const insert=[[338,49,54],[345,31,49],[356,28,43],[370,25,41],
      [383,24,46],[397,22,61],[403,22,61],[414,21,47],[428,20,37],
      [444,19,33],[459,18,33],[476,18,39],[492,18,54],[498,18,51],
      [511,18,39],[525,18,31],[533,22,25]];
    for(let i=1;i<insert.length;i++){
      const [u,t,b]=insert[i-1],[U,T,B]=insert[i];
      const n=Math.ceil((U-u)/4);
      for(let k=0;k<n;k++)for(let j=0;j<5;j++){
        const at=(s,v,z)=>skin(mix(u,U,s),mix(mix(t,T,s),mix(b,B,s),v),side,z);
        const l=k/n,r=(k+1)/n,top=j/5,bot=(j+1)/5;
        const a=at(l,top,.0011),bb=at(r,top,.0011),c=at(r,bot,.0011),d=at(l,bot,.0011);
        const center=at((l+r)/2,(top+bot)/2,.0016);
        const facet=(p,q,ink)=>side<0?tri(grip,p,q,center,ink):tri(grip,q,p,center,ink);
        facet(a,bb,0x303233);facet(bb,c,0x262829);facet(c,d,0x202122);facet(d,a,0x292b2c);
      }
    }
  }
  silverRing(metal);
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

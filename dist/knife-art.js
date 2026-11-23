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
      quad(m,point(j,a),point(j,b),point(k,b),point(k,a),tints[j]);
    }
  }
}
function pivotDisc(m,x,y,z,r,faceColor,rimColor){
  const poly=Array.from({length:10},(_,i)=>[x+r*Math.cos(tau*i/10),y+r*Math.sin(tau*i/10)]);
  plate(m,poly,z,.0026,.0013,faceColor,rimColor);
  const slot=[[x-r*.51,y-r*.10],[x+r*.39,y+r*.29],[x+r*.50,y+r*.09],[x-r*.40,y-r*.29]];
  const front=z>0;face(m,ccw(slot),z+(front?.0027:-.0027),0x222726,!front);
}
// Two ground faces meet along a continuous raised ridge on each side of the blade.
function groundBlade(m,sections,colors,curved=false){
  if(curved){
    // Interpolate the sweep, retaining the unmistakable hooked outline at zoom.
    const smooth=[];
    for(let i=0;i<sections.length-1;i++){
      const a=sections[Math.max(i-1,0)],b=sections[i],c=sections[i+1],d=sections[Math.min(i+2,sections.length-1)];
      smooth.push(b,b.map((v,j)=>(9*(v+c[j])-a[j]-d[j])/16));
    }
    sections=[...smooth,sections.at(-1)];
  }
  function section(s,side){
    const [ax,ay,bx,by,thick]=s;
    return [[ax,ay,side*thick*.48],
      [mix(ax,bx,.085),mix(ay,by,.085),side*thick*.87],
      [mix(ax,bx,.48),mix(ay,by,.48),side*thick],
      [mix(ax,bx,.944),mix(ay,by,.944),side*thick*.17],
      [bx,by,0]];
  }
  for(let i=0;i<sections.length-1;i++){
    const s=sections[i],next=sections[i+1];
    for(const sign of [-1,1]){
      const a=section(s,sign),b=section(next,sign);
      for(let j=0;j<4;j++){
        if(sign===1)quad(m,a[j],b[j],b[j+1],a[j+1],colors[j]);
        else quad(m,a[j+1],b[j+1],b[j],a[j],colors[j]);
      }
      if(i===0){
        for(let j=0;j<4;j++){
          quad(m,a[j+1],a[j],[a[j][0],a[j][1],0],[a[j+1][0],a[j+1][1],0],colors[0]);
        }
      }
    }
    quad(m,[s[0],s[1],-s[4]*.48],[next[0],next[1],-next[4]*.48],
      [next[0],next[1],next[4]*.48],[s[0],s[1],s[4]*.48],colors[0]);
  }
}
function karambit(){
  const blade=part('blade','steel'),grip=part('grip','grip'),metal=part('fittings','hardware');
  groundBlade(blade,[
    [.039,.022,-.052,.028,.014],[.052,.070,-.062,.061,.017],
    [.056,.118,-.058,.082,.018],[.049,.160,-.061,.105,.018],
    [.033,.198,-.075,.131,.017],[.010,.230,-.096,.154,.016],
    [-.021,.253,-.119,.169,.015],[-.055,.269,-.144,.178,.014],
    [-.092,.276,-.165,.182,.012],[-.130,.272,-.184,.182,.009],
    [-.167,.258,-.201,.180,.006],[-.198,.232,-.213,.175,.004],
    [-.224,.201,-.226,.170,.002],[-.242,.158,-.242,.158,0]
  ],[0x8a9c9e,0x485e66,0x8d9fa2,0xdce5e2],true);
  const tang=[[.019,-.201],[.052,-.176],[.046,-.131],[.046,-.079],[.048,-.036],[.052,.012],[.046,.042],[.024,.057],
    [-.026,.060],[-.058,.041],[-.074,.044],[-.068,.024],[-.042,.007],[-.039,-.011],[-.046,-.030],
    [-.039,-.040],[-.033,-.056],[-.039,-.072],[-.034,-.082],[-.022,-.099],[-.025,-.115],[-.015,-.127],[-.006,-.145],[-.008,-.171]];
  plate(metal,easedOutline(tang),0,.020,.0025,0x4c5b56,0x87968d);
  const scale=[[-.002,-.166],[.022,-.179],[.042,-.162],[.035,-.111],[.035,-.067],[.037,-.034],[.041,.010],[.030,.036],
    [.005,.046],[-.025,.041],[-.044,.028],[-.048,.018],[-.031,.002],[-.030,-.016],[-.035,-.029],[-.025,-.045],
    [-.022,-.060],[-.026,-.072],[-.015,-.088],[-.011,-.105],[-.014,-.114],[-.001,-.135]];
  const badge=[[-.036,.024],[-.021,.036],[.003,.038],[.028,.028],[.026,.020],[.004,.027],[-.023,.023]];
  for(const sign of [-1,1]){
    plate(grip,easedOutline(scale),sign*.021,.0065,.003,0x2b3935,0x4c5b53);
    face(metal,ccw(badge),sign*.0278,0x98b6ab,sign<0);
    for(let i=0;i<10;i++){
      const y=-.125+i*.014,cx=.009-i*.0019;
      const slash=[[cx-.011,y+.002],[cx+.012,y-.008],[cx+.024,y-.006],[cx+.009,y-.002],[cx-.008,y+.004]];
      face(grip,ccw(slash),sign*.0278,i%3===0?0x405047:0x38463e,sign<0);
      const rim=[[cx-.011,y+.002],[cx+.012,y-.008],[cx+.023,y-.0068],[cx+.013,y-.0068]];
      face(grip,ccw(rim),sign*.02795,0x556358,sign<0);
    }
    pivotDisc(metal,.014,-.141,sign*.028,.0078,0x86988f,0xb0b3a0);
    pivotDisc(metal,-.010,.013,sign*.028,.0084,0xa7aa93,0xe1c994);
  }
  ring(metal,.018,-.210,0,.051,.0345,.0165,0x697671,0x344241,0x9ba8a1,36);
  return [blade,grip,metal];
}
// Each row defines the outside and the window in a continuous milled plate.
// A zero-width window forms the solid bridges between the through-slots.
function ventedHandle(m,side,body,lip){
  const rows=[
    [-.256,.012,0],[-.251,.0215,0],[-.241,.0225,0],[-.234,.0225,.005],
    [-.226,.0225,.0105],[-.204,.022,.0105],[-.196,.0215,.005],[-.190,.0215,0],
    [-.183,.021,0],[-.177,.0208,.006],[-.171,.0208,.0105],[-.141,.0205,.0105],[-.134,.0205,.005],[-.130,.0205,0],
    [-.122,.020,0],[-.117,.0198,.005],[-.110,.0198,.009],[-.084,.0195,.009],[-.076,.019,.004],[-.072,.019,0],
    [-.061,.019,0],[-.058,.019,.004],[-.052,.019,.008],[-.040,.019,.008],[-.034,.019,.004],[-.031,.019,0],
    [-.015,.022,0],[.003,.024,0],[.017,.020,0],[.021,.014,0]
  ];
  const point=(row,frac,z)=>{
    const [y,outer,inner]=row,drift=side*Math.max(0,-y-.04)*.052-.015*Math.sin(Math.max(0,-y)/.256*Math.PI);
    const offset=Math.sign(frac)*(Math.abs(frac)===1?outer:inner);
    return [drift+offset,y,z];
  };
  // Cheeks sit on either side of a dark spine; the free blade passes between them.
  for(const sign of [-1,1]){
    const flat=sign*.022,edge=sign*.019,inside=sign*.012;
    for(let i=0;i<rows.length-1;i++){
      const a=rows[i],b=rows[i+1];
      for(const sideX of [-1,1]){
        const p=point(a,sideX,flat),q=point(b,sideX,flat),r=point(b,sideX*.5,flat),s=point(a,sideX*.5,flat);
        const bevel=.0018; p[0]-=sideX*bevel;q[0]-=sideX*bevel;
        if(b[2])r[0]+=sideX*.0012;if(a[2])s[0]+=sideX*.0012;
        const write=(p,q,r,s,c)=>sign*sideX>0?quad(m,p,q,r,s,c):quad(m,s,r,q,p,c);
        const bolster=a[0]>=-.031,heel=b[0]<=-.234;
        write(p,q,r,s,bolster?0x67686a:heel?0x646062:body);
        if(!bolster&&!heel){
          // A narrow uncoated band runs along the spine of the anodised scale.
          const line=p[0]+sideX*.0001,lineB=q[0]+sideX*.0001;
          const za=flat+sign*.0001;
          write([line,p[1],za],[lineB,q[1],za],[lineB-sideX*.0017,q[1],za],[line-sideX*.0017,p[1],za],0xb7a18a);
        }
        const edgeA=point(a,sideX,edge),edgeB=point(b,sideX,edge);
        write(edgeA,edgeB,q,p,lip);
        write(point(a,sideX,inside),point(b,sideX,inside),edgeB,edgeA,0x4b4c50);
        if(a[2]||b[2]){
          const ra=point(a,sideX*.5,edge),rb=point(b,sideX*.5,edge);
          write(s,r,rb,ra,lip);write(ra,rb,point(b,sideX*.5,inside),point(a,sideX*.5,inside),0x454649);
        }
        write(point(a,sideX*.5,inside),point(b,sideX*.5,inside),point(b,sideX,inside),point(a,sideX,inside),0x656064);
      }
    }
    for(const r of [rows[0],rows.at(-1)]){
      const a=point(r,-1,inside),b=point(r,1,inside),c=point(r,1,flat),d=point(r,-1,flat);
      quad(m,a,b,c,d,lip);
    }
    pivotDisc(m,0,0,sign*.024,.0144,0x49464a,0xc8ae8a);
    pivotDisc(m,side*.011,-.246,sign*.024,.0067,0x6e6767,0xb9a796);
  }
}
function balisong(){
  const base=[.022,.062,0],hinge=[-.023,.062,0];
  const fixed=part('grip','hardware',base),blade=part('blade','steel',base),swing=part('handle','hardware',hinge);
  // The blade pivots at the fixed handle; its second pin carries the moving handle.
  swing.parentPivot=base;
  ventedHandle(fixed,1,0x937865,0xc0a48d);ventedHandle(swing,-1,0x947966,0xc9ad91);
  const tang=[[-.058,-.008],[-.053,.017],[-.042,.027],[.014,.027],[.016,.005],[.010,-.012],[-.002,-.022],[-.043,-.021]];
  plate(blade,tang,0,.009,.0018,0x64646a,0xb7b1a6);
  groundBlade(blade,[
    [[.012,.022],[-.037,.022],.009],[[.010,.040],[-.041,.040],.011],
    [[.009,.046],[-.059,.044],.012],[[.008,.068],[-.056,.066],.012],
    [[.007,.096],[-.055,.090],.012],[[.008,.143],[-.065,.130],.012],
    [[.009,.174],[-.065,.163],.010],[[.008,.185],[-.062,.174],.010],
    [[-.006,.204],[-.056,.204],.008],[[-.012,.223],[-.046,.227],.006],
    [[-.021,.242],[-.036,.243],.004],[[-.029,.256],[-.029,.256],0]
  ].map(([a,b,t])=>[...a,...b,t]),[0x89939b,0x647882,0xa0afb4,0xdce3de]);
  // A keeper at the heel finishes the silhouette and breaks the symmetry of the handles.
  plate(swing,[[.005,-.256],[.007,-.268],[-.010,-.275],[-.034,-.274],[-.039,-.267],[-.011,-.265],[-.008,-.253]],
    0,.008,.0014,0x61666a,0x9a9a97);
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
const drawFrames=[[0,3.10,0],[.115,2.81,-.52],[.24,1.75,-2.25],[.36,.75,-1.78],[.49,-.04,.12],[.56,0,0]];
const inspectFrames=[[0,0,0],[.43,0,0],[.74,.095,-1.42],[1.02,.98,-2.57],[1.32,2.61,-.70],
  [1.50,3.085,-.06],[1.78,3.085,-.06],[1.98,2.67,.67],[2.24,1.56,2.70],[2.46,.54,1.71],
  [2.68,-.055,-.12],[2.82,0,0]];
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

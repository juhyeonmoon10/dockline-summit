// The WebGL and software renderers share the same rail yard, including the painted
// pointwork. Geometry inside the yard is built from the simulation's collision hulls.
const steel=0x374b48, iron=0x263736, green=0x426e60, mint=0x9aaea1;
const concrete=0xb6b5a2, buff=0xe4d7b5, yellow=0xf2be55, rust=0x9d5337;
const siding=5.3;

export function paintSwitchyardGround(ctx,width,height,map) {
  const halfW=map.width/2,halfD=map.depth/2;
  ctx.save();
  ctx.scale(width/map.width,height/map.depth);ctx.translate(halfW,halfD);
  const fill=(x,z,w,d,color)=>{ctx.fillStyle=color;ctx.fillRect(x,z,w,d);};
  const line=(x0,z0,x1,z1,weight,color)=>{
    ctx.beginPath();ctx.moveTo(x0,z0);ctx.lineTo(x1,z1);ctx.lineWidth=weight;ctx.strokeStyle=color;ctx.stroke();
  };
  fill(-halfW,-halfD,map.width,map.depth,'#b7b3a1');
  for(let x=-halfW;x<halfW;x+=3.5)line(x,-halfD,x,halfD,.025,'#9d9d90');
  for(let z=-halfD;z<halfD;z+=4.6)line(-halfW,z,halfW,z,.03,'#979a8e');
  for(const s of [-1,1]){
    fill(s*siding-2.1,-halfD,4.2,map.depth,'#7e8175');
    fill(s*14.5-3.15,-halfD,6.3,map.depth,'#a6a696');
    line(s*18.3,-halfD,s*18.3,halfD,.12,'#e9c568');
  }
  for(const s of [-1,1])line(-s*siding,-12,s*siding,12,3.5,'#85877a');
  // Fixed seed keeps aggregate on the rail bed stable between renderers.
  let seed=4705;
  const noise=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<3200;i++){
    const x=(noise()-.5)*map.width,z=(noise()-.5)*map.depth;
    fill(x,z,.025+noise()*.11,.045,noise()<.5?'rgba(34,46,43,.22)':'rgba(247,236,201,.28)');
  }
  const track=(x0,z0,x1,z1)=>{
    const length=Math.hypot(x1-x0,z1-z0),dx=(x1-x0)/length,dz=(z1-z0)/length;
    for(let t=.35;t<length;t+=.76){
      const x=x0+t*dx,z=z0+t*dz;
      line(x-dz*1.20,z+dx*1.20,x+dz*1.20,z-dx*1.20,.23,'#635e50');
      line(x-dz*1.13,z+dx*1.13,x+dz*1.13,z-dx*1.13,.12,'#88806c');
    }
    for(const g of [-.78,.78]){
      const ox=dz*g,oz=-dx*g;
      line(x0+ox,z0+oz,x1+ox,z1+oz,.18,'#574e43');
      line(x0+ox,z0+oz,x1+ox,z1+oz,.066,'#dcd4b6');
    }
  };
  for(const s of [-1,1])track(s*siding,-halfD,s*siding,halfD);
  for(const s of [-1,1])track(-s*siding,-12,s*siding,12);
  for(const s of [-1,1]){
    const crossover=s*15.8;
    for(let x=-9.8;x<9.8;x+=.75)fill(x,crossover-.68,.27,1.36,'#ded3af');
    line(-9.9,crossover-1,9.9,crossover-1,.10,'#e6bd57');
    line(-9.9,crossover+1,9.9,crossover+1,.10,'#e6bd57');
    for(let z=-18;z<18;z+=1.7)fill(s*10.55-.06,z,.12,.75,'#eee0b7');
    ctx.save();ctx.translate(s*13,s*19.5);if(s<0)ctx.rotate(Math.PI);
    ctx.fillStyle='#616e64';ctx.font='900 1.5px Arial';ctx.textAlign='center';ctx.fillText(s>0?'S / 01':'N / 02',0,0);
    ctx.restore();
  }
  ctx.restore();
}

export const switchyardPaints = {
  boxcarSouth: ['boxcar','#a34f37','047'], boxcarNorth: ['boxcar','#3d7669','062'],
  boxcarEnd: ['end','#706d59'], freight: ['freight','#b2854c'], relay: ['relay','#707e70'],
  flatcar: ['flatcar','#5b6960'], buffers: ['buffers','#404a41'], platform: ['platform','#83877a'],
  proceed: ['signal','#26372d',2], stop: ['signal','#26372d',0],
  terminal: ['terminal','#264d45'], shutter: ['shutter','#748379'],
};

export function paintSwitchyardPanel(ctx,width,height,key) {
  const [type,color,number]=switchyardPaints[key];
  const W=type==='terminal'?600:type==='boxcar'?450:type==='flatcar'||type==='platform'?500:192,H=160;
  ctx.save();ctx.scale(width/W,height/H);
  const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  const circle=(x,y,r,c)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
  const text=(str,x,y,size,c)=>{ctx.fillStyle=c;ctx.font='bold '+size+'px Arial';ctx.fillText(str,x,y);};
  const stroke=(x0,y0,x1,y1,c,width)=>{
    ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
  };
  rect(0,0,W,H,color);
  if(type==='boxcar'||type==='end'||type==='freight'){
    const rolling=type!=='freight',edge=rolling?133:160;
    for(let x=8;x<W;x+=14){
      rect(x,6,4,edge-10,'rgba(34,38,29,.28)');rect(x+4,6,2,edge-10,'rgba(254,239,196,.25)');
    }
    rect(0,0,W,6,'#b4a682');rect(0,edge-7,W,7,'#4d5042');
    for(const x of [2,W-9])rect(x,4,7,edge-8,'#564f3e');
    const cx=W/2,door=type==='boxcar'?112:W-34;
    rect(cx-door/2,12,door,edge-26,'#574e3e');rect(cx-door/2+3,15,door-6,edge-32,color);
    for(let y=23;y<edge-19;y+=12)rect(cx-door/2+7,y,door-14,2,'rgba(34,38,29,.26)');
    for(const x of [cx-door*.19,cx+door*.19]){
      rect(x,20,3,edge-45,'#ddd1aa');rect(x-4,edge-43,10,4,'#353c31');
    }
    if(type==='boxcar'){
      rect(17,27,113,26,'#e1d2a9');text('D L  /  '+number,23,46,18,'#37473d');
      text('FREIGHT',W-90,92,15,'#e7d9b1');
      for(let i=0;i<7;i++)rect(W-86+i*8,99,4,7,'#d6c9a6');
    }
    if(type==='boxcar'){
      rect(0,edge,W,H-edge,'#323a34');rect(0,edge+3,W,4,'#928570');
      for(const x of [.13,.23,.77,.87]){
        circle(W*x,148,11,'#242b29');circle(W*x,148,6,'#787a65');circle(W*x,148,2,'#434941');
      }
    }else if(type==='end'){
      rect(0,edge,W,H-edge,'#353e36');
      for(const x of [12,W-37])rect(x,edge+5,25,11,'#252b28');
    }else{
      rect(12,22,49,24,'#ddcea9');text('12 / K',16,39,13,'#4b4e3e');
    }
  }else if(type==='flatcar'||type==='platform'){
    rect(0,0,W,18,'#e2b555');rect(0,19,W,7,'#504d3f');
    for(let x=16;x<W;x+=37){rect(x,33,8,99,'#535e53');rect(x+8,32,4,100,'#a8a493');}
    rect(0,135,W,25,'#414c44');
    if(type==='flatcar')for(const x of [.12,.22,.78,.88]){
      circle(W*x,117,35,'#333b33');circle(W*x,117,21,'#797b6b');circle(W*x,117,8,'#4e574d');
    }
  }else if(type==='buffers'){
    rect(0,0,W,24,'#d4ae5e');rect(0,26,W,16,'#6c7060');
    for(const x of [17,W-53]){
      rect(x+4,67,29,47,'#767968');rect(x,84,36,27,'#262e2a');
    }
    rect(84,58,24,42,'#272f29');rect(90,83,12,35,'#879080');
  }else if(type==='relay'||type==='shutter'){
    for(let y=8;y<H;y+=10){rect(2,y,W-4,2,'#4e6056');rect(2,y+2,W-4,1,'#abb0a0');}
    rect(0,0,6,H,'#3d5147');rect(W-6,0,6,H,'#3d5147');
    if(type==='relay'){rect(13,23,58,32,'#e7c675');text('S / 04',18,45,18,'#38443b');rect(80,95,9,22,'#313f37');}
  }else if(type==='signal'){
    for(let i=0;i<3;i++){
      const y=28+51*i,lit=i===number;
      ctx.save();ctx.translate(W/2,y);ctx.scale(2.25,1);
      circle(0,0,23,'#18271f');circle(0,2,17,lit?['#fa745d','#e9b44c','#82d5ad'][i]:'#45574a');
      if(lit)circle(-4,-3,5,i?'#c6edc9':'#fda98b');
      ctx.restore();
    }
  }else{
    rect(0,0,W,8,'#edc16b');rect(0,H-8,W,8,'#edc16b');
    stroke(27,123,84,37,'#edc16b',10);stroke(52,123,109,37,'#edc16b',10);stroke(76,88,109,123,'#edc16b',9);
    text('SWITCHYARD',136,91,62,'#f4e4bd');text('D O C K L I N E    /    F R E I G H T   T E R M I N A L',142,125,15,'#eac46f');
  }
  ctx.restore();
}

export function buildSwitchyard(map,face) {
  // Every face is wound outwards, with the first edge at the bottom of the artwork.
  const box=(x,y,z,w,h,d,body,top=body,end=body)=>{
    const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2,t=y+h;
    face([[l,y,f],[r,y,f],[r,t,f],[l,t,f]],end,1);
    face([[r,y,n],[l,y,n],[l,t,n],[r,t,n]],end,1);
    face([[r,y,f],[r,y,n],[r,t,n],[r,t,f]],body,0);
    face([[l,y,n],[l,y,f],[l,t,f],[l,t,n]],body,0);
    face([[l,t,f],[r,t,f],[r,t,n],[l,t,n]],top,2);
  };
  const facade=(x,y,z,w,h,side,mat)=>{
    const a=x-side*w/2,b=x+side*w/2;
    face([[a,y,z],[b,y,z],[b,y+h,z],[a,y+h,z]],mat,2);
  };
  for(const b of map.boxes){
    const base=b.base||0,body={
      boxcar:b.z>0?'boxcarSouth':'boxcarNorth',flatcar:'flatcar',platform:'platform',
      supply:'freight',freight:'freight',relay:'relay'
    }[b.kind];
    const cap={boxcar:b.z>0?0xb47757:0x679383,flatcar:0x9f9274,platform:concrete,freight:0xbca272,supply:0xbca272,relay:mint}[b.kind];
    const end=b.kind==='boxcar'?'boxcarEnd':b.kind==='flatcar'?'buffers':body;
    box(b.x,base,b.z,b.w,b.h-base,b.d,body,cap,end);
    if(b.kind==='platform'||b.kind==='boxcar'||b.kind==='flatcar'){
      for(const side of [-1,1]){
        const x=b.x+side*(b.w/2-.19),l=x-.075,r=x+.075,n=b.z-b.d/2+.03,f=b.z+b.d/2-.03;
        face([[l,b.h+.009,f],[r,b.h+.009,f],[r,b.h+.009,n],[l,b.h+.009,n]],b.kind==='platform'?yellow:buff,2);
      }
    }
  }
  for(const r of map.ramps){
    const l=r.x-r.w/2,rr=r.x+r.w/2,z0=r.z-r.sign*r.d/2,z1=r.z+r.sign*r.d/2;
    const rampTop=(x0,x1,lift,mat)=>{
      const v=[[x0,lift,z0],[x1,lift,z0],[x1,r.h+lift,z1],[x0,r.h+lift,z1]];
      face(r.sign<0?v:v.reverse(),mat,2);
    };
    rampTop(l,rr,0,concrete);rampTop(l+.12,l+.26,.012,yellow);rampTop(rr-.26,rr-.12,.012,yellow);
    for(const side of [-1,1]){
      const x=side<0?l:rr,v=[[x,0,z0],[x,0,z1],[x,r.h,z1],[x,r.h,z1]];
      face(side*r.sign<0?v:v.reverse(),steel,1);
    }
    facade(r.x,0,z1,r.w,r.h,r.sign,steel);
  }
  const w=map.width/2,d=map.depth/2;
  face([[-98,-.72,98],[98,-.72,98],[98,-.72,-98],[-98,-.72,-98]],0x92998b,2);
  box(0,-.65,0,map.width+6,.6,map.depth+7,0x908e7a);
  for(const side of [-1,1]){
    // Low concrete boundaries leave the sidings and train sheds visible.
    box(side*(w+.20),0,0,.40,1.14,map.depth+.8,steel,concrete);
    box(0,0,side*(d+.20),map.width+.80,1.14,.40,steel,concrete);
    const gz=side*12.5,h=7.55,span=w+1.25;
    for(const x of [-span,span]){
      box(x,0,gz,.55,h,.73,green);box(x,0,gz,.8,.8,.9,concrete);
    }
    box(0,h-.65,gz,span*2+.55,.19,.66,green);
    box(0,h+.42,gz,span*2+.55,.18,.55,mint);
    // A signal bridge has an open steel web and hanging three-aspect heads.
    for(let i=0;i<20;i++){
      const a=-span+2*span*i/20,b=-span+2*span*(i+1)/20,y=i%2?h+.47:h-.52,t=i%2?h-.52:h+.47;
      for(const z of [gz-.17,gz+.17]){
        const v=[[a,y-.08,z],[b,t-.08,z],[b,t+.08,z],[a,y+.08,z]];
        face(z>gz?v:v.reverse(),green,1);
      }
    }
    for(const x of [-siding,siding]){
      box(x,h-2.72,gz,.96,2.13,.48,iron,steel);
      for(const look of [-1,1])facade(x,h-2.69,gz+look*.25,.87,2.05,look,x*look>0?'proceed':'stop');
    }
    const shed=side*(d+9.6),facadeZ=shed-side*2.16;
    box(0,0,shed,33.4,5.7,4.3,green,iron);
    for(const x of [-10.8,0,10.8]){
      const roof=[[x-5.7,5.7,facadeZ],[x+5.7,5.7,facadeZ],[x,7.55,facadeZ],[x,7.55,facadeZ]];
      face(side<0?roof:roof.reverse(),green,1);
      facade(x,.25,facadeZ-side*.02,8.45,4.13,-side,'shutter');
      for(const col of [-1,1])box(x+col*4.5,0,facadeZ, .38,5.65,.48,buff);
    }
    box(0,4.3,facadeZ-side*.12,12.65,2.4,.45,steel);
    facade(0,4.42,facadeZ-side*.36,12.35,2.15,-side,'terminal');
    // A shunting locomotive stands outside each end wall, nose towards the yard.
    const tx=side*10.8,tz=side*(d+3.8),front=tz-side*2.8;
    box(tx,.28,tz,3.8,.80,5.7,iron);
    box(tx,1.08,tz,3.42,2.05,5.55,side>0?green:rust);
    box(tx,3.13,tz+side*.20,3.56,1.33,2.15,steel,mint);
    box(tx,4.46,tz+side*.20,3.88,.18,2.42,mint);
    for(const sx of [-1,1]){
      facade(tx+sx*.82,3.38,tz-side*.89,1.34,.86,-side,0xaccac3);
      facade(tx+sx*.98,2.56,front, .48,.25,-side,0xffdda0);
      facade(tx+sx*.99,1.63,front, .96,.38,-side,buff);
    }
    facade(tx,1.24,front,1.24,1.22,-side,'shutter');
    box(tx,.66,front,3.94,.35,.36,yellow);
    // Dispatch cabins and stacked cargo frame the two side sidings.
    const yardX=side*(w+6.6);
    box(yardX,0,-side*9,6.4,4.3,7.9,rust,buff);
    box(yardX,4.3,-side*9,6.25,1.7,7.75,0x75948d,mint);
    box(yardX,6.0,-side*9,7.2,.35,8.65,steel);
    for(const [offset,z] of [[0,6],[3.8,10],[-.5,14]]){
      box(yardX+side*offset,0,side*z,3.15,2.8,6.8,'freight',buff);
    }
    const bankZ=side*(d+17.0);
    // A grain elevator and its gallery rise behind the freight sheds.
    for(const x of [side*10.8,side*15.5]){
      const point=(index,height,radius)=>{
        const a=index*Math.PI/7;return [x+radius*Math.cos(a),height,bankZ+radius*Math.sin(a)];
      };
      for(let i=0;i<14;i++){
        const band=(bottom,top,r,col)=>{
          face([point(i+1,bottom,r),point(i,bottom,r),point(i,top,r),point(i+1,top,r)],col,i<7?1:2);
        };
        band(0,9.3,2.26,i%2?0xb4b5a2:0xa5ac9a);
        band(9.3,9.6,2.29,green);band(9.6,10.4,2.26,0xbac4af);
        const peak=[x,11.6,bankZ];
        face([point(i+1,10.4,2.33),point(i,10.4,2.33),peak,peak],0x84988b,2);
      }
    }
    box(side*19.2,0,bankZ,2.25,13.95,2.65,green,mint);
    box(side*19.2,13.12,bankZ,2.67,1.13,3.00,mint,steel);
    box(side*14.9,11.05,bankZ,8.7,.62,.73,steel,mint);
  }
}

// The old public map id is also the name of this module. Both renderers use the
// same warehouse faces and the same paintings, all generated once on a map change.
const steel=0x455552, zinc=0x929c92, paint=0x596b61;
const dark=0x343e3c, orange=0xd18446;
export const switchyardPaints = [
  'concrete','inspection','door','glass','trailer','vehicleEnd','cab','deck',
  'hood','windshield','wheel','pallet','crate','sack','metal','shutter','display','customs','clerestory',
];

function generators(seed){
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

export function paintSwitchyardGround(c,width,height,map){
  const W=map.width,D=map.depth,noise=generators(4019);
  c.save();c.scale(width/W,height/D);c.translate(W/2,D/2);
  const rect=(x,z,w,d,color)=>{c.fillStyle=color;c.fillRect(x,z,w,d);};
  const line=(ax,az,bx,bz,color,lineWidth)=>{
    c.strokeStyle=color;c.lineWidth=lineWidth;c.beginPath();c.moveTo(ax,az);c.lineTo(bx,bz);c.stroke();
  };
  rect(-W/2,-D/2,W,D,'#646763');
  for(let x=-W/2;x<W/2;x+=4)for(let z=-D/2;z<D/2;z+=4){
    const l=134+Math.floor(noise()*20);
    rect(x+.036,z+.041,3.965,3.96,'rgb('+(l+4)+','+(l+3)+','+(l-3)+')');
    rect(x+.052,z+.057,3.83,.035,'rgba(225,220,201,.44)');
    if(noise()<.31){
      const k=noise()*2.5;
      line(x+k,z,x+k+.13,z+.16,'rgba(57,60,53,.40)',.041);
      line(x+k+.13,z+.16,x+k+.51,z+.25,'rgba(57,60,53,.32)',.024);
    }
  }
  // Broad scale trowel variation and absorbed water survive mipmapping.
  for(let i=0;i<920;i++){
    const x=(noise()-.5)*W,z=(noise()-.5)*D,r=.08+noise()*.78;
    const stain=c.createRadialGradient(x,z,0,x,z,r);
    stain.addColorStop(0,noise()<.48?'rgba(60,61,55,.17)':'rgba(238,229,206,.16)');
    stain.addColorStop(1,'rgba(130,128,114,0)');rect(x-r,z-r,2*r,2*r,stain);
  }
  for(let i=0;i<10500;i++){
    const x=(noise()-.5)*W,z=(noise()-.5)*D,t=noise();
    rect(x,z,.018+t*.095,.012+t*.065,t>.52?'rgba(64,68,62,.16)':'rgba(251,246,217,.22)');
  }
  for(const s of [-1,1]){
    const shade=c.createLinearGradient(-7.4*s,0,-16*s,0);
    shade.addColorStop(0,'rgba(37,52,53,0)');shade.addColorStop(.43,'rgba(39,54,55,.30)');shade.addColorStop(1,'rgba(32,43,45,.60)');
    rect(s>0?-16:7.4,s>0?-.6:-18.3,8.6,18.9,shade);
    c.save();c.scale(s,s);
    // Twin tyre impressions curve out of the doorway into the truck bay.
    for(const offset of [-1.04,1.04]){
      const trace=(lateral,weight,color,dash=[])=>{
        c.beginPath();c.moveTo(1.2+offset+lateral,24.2);
        c.bezierCurveTo(1.2+offset+lateral,19,5.3+offset+lateral,17.4,5.3+offset+lateral,12.4);
        c.lineTo(5.3+offset+lateral,7.5);c.strokeStyle=color;c.lineWidth=weight;c.setLineDash(dash);c.stroke();
      };
      trace(0,.35,'rgba(44,46,41,.23)');trace(-.095,.10,'rgba(52,53,46,.26)',[.22,.07]);
      trace(.09,.08,'rgba(55,54,48,.26)',[.18,.10]);c.setLineDash([]);
    }
    c.restore();
    const px=s*-10.8;
    line(px,s*12.8,px,s*22.3,'#d2c9a1',.10);
    for(let z=13;z<=21;z+=1.35)rect(px+.22,s*z,.14,.62,'#ddd3af');
    for(let i=0;i<9;i++)rect(s*9.1+i*.4*(s>0?1:-1),s*10.4,.20,.63,'#d1b16c');
    // Diffuse daylight falls onto the work apron from the raised end shutter.
    c.save();c.scale(s,s);
    const g=c.createLinearGradient(0,24,0,12.9);g.addColorStop(0,'rgba(255,245,213,.68)');g.addColorStop(.63,'rgba(244,226,183,.25)');g.addColorStop(1,'rgba(255,242,205,0)');
    c.fillStyle=g;c.beginPath();c.moveTo(-5.5,24);c.lineTo(5.5,24);c.lineTo(2.4,12.9);c.lineTo(-6.1,12.9);c.closePath();c.fill();c.restore();
  }
  // Layered footprints approximate short-range contact occlusion in both paths.
  for(const b of map.boxes.filter(b=>!b.base)){
    const x=b.x-b.w/2,z=b.z-b.d/2,t=Math.min(.74,.16+b.h*.15);
    for(let i=12;i>0;i--){
      const spread=t*i/12;
      rect(x-spread,z-spread,b.w+2*spread,b.d+2*spread,'rgba(32,35,31,.055)');
    }
  }
  rect(-2.76,-3.02,5.52,6.04,'#49524f');rect(-2.68,-2.94,5.36,5.88,'#929a91');
  for(let z=-2.91;z<2.9;z+=.58){rect(-2.65,z,5.3,.026,'#53605a');rect(-2.65,z+.03,5.3,.028,'#b6b8a7');}
  for(const s of [-1,1]){
    rect(s*2.56-.035,-2.9,.07,5.8,'#d4a568');
    for(let z=-2.72;z<2.9;z+=.48)rect(s*2.40-.045,z,.09,.09,'#555b52');
    c.save();c.translate(-s*2.85,s*1.38);c.rotate(s*Math.PI/2);c.fillStyle='#ebe2b8';
    c.font='bold .37px Arial';c.fillText('04   /   WEIGHBRIDGE',0,0);c.restore();
  }
  c.restore();
}

export function paintSwitchyardPanel(c,width,height,key){
  // Faces have different physical proportions, so text and plating use native
  // aspect ratios before being packed into renderer-sized texture tiles.
  const W={concrete:550,inspection:510,door:290,glass:430,trailer:440,vehicleEnd:145,cab:164,windshield:246,wheel:160,hood:260,deck:520,pallet:220,crate:190,sack:280,metal:340,shutter:540,display:382,customs:585,clerestory:600}[key];
  const H=160,n=generators(758+W);
  c.save();c.scale(width/W,height/H);
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const stroke=(x1,y1,x2,y2,color,w)=>{
    c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
  };
  const word=(str,x,y,size,col)=>{c.fillStyle=col;c.font='bold '+size+'px Arial, sans-serif';c.fillText(str,x,y);};
  const circle=(x,y,r,col)=>{c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  const polygon=(points,color)=>{
    c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
  };
  const gloss=(x,y,w,h,c0,c1)=>{
    const g=c.createLinearGradient(x,y,x+.32*w,y+h);g.addColorStop(0,c0);g.addColorStop(1,c1);rect(x,y,w,h,g);
  };
  const noise=(count,bright,dark)=>{
    for(let i=0;i<count;i++){const x=n()*W,y=n()*H;rect(x,y,.5+n()*2,.5+n()*1.3,n()<.50?bright:dark);}
  };
  const windowFrame=(x,y,w,h,sections)=>{
    rect(x,y,w,h,'#323e3b');
    const span=(w-7)/sections;
    for(let i=0;i<sections;i++){
      const l=x+4+i*span;
      gloss(l,y+4,span-3,h-8,'#374d4c','#6e8178');
      c.save();c.beginPath();c.rect(l,y+4,span-3,h-8);c.clip();
      rect(l,y+h*.51,span-4,h*.045,'#445449');rect(l+span*.29,y+h*.54,span*.48,h*.21,'#43574b');
      polygon([[l-10,y+7],[l+span*.77,y+7],[l+span*.34,y+h*.42],[l-18,y+h*.42]],'rgba(210,226,212,.36)');
      polygon([[l+span*.79,y+7],[l+span*.92,y+7],[l+span*.49,y+h*.42],[l+span*.37,y+h*.42]],'rgba(219,235,221,.26)');
      stroke(l,y+5,l+span,y+5,'#9daca0',1.5);c.restore();
    }
    rect(x-1,y+h-2,w+2,3,'#c3c3ab');
  };
  const masonry=(tinted=false)=>{
    gloss(0,0,W,H,'#c9c6b3','#a6ac9d');
    rect(0,H*.64,W,H*.36,tinted?'#74877a':'#8b9b8e');
    rect(0,H*.64,W,2,'#859489');rect(0,H-6,W,6,'#778278');
    for(let x=9;x<W;x+=W*.28){
      rect(x,0,1.35,H,'rgba(76,83,70,.19)');
      for(const y of [18,82,145])circle(x+7,y,1.25,'rgba(66,76,65,.26)');
    }
    for(let i=0;i<32;i++){
      const x=n()*W,y=116+n()*40;stroke(x,y,x+2+n()*15,y+n()*2,'rgba(58,72,61,.22)',.6+n()*1.5);
    }
    noise(950,'rgba(248,240,211,.24)','rgba(65,75,65,.21)');
  };
  if(key==='concrete'||key==='inspection'||key==='door'||key==='glass'){
    masonry(true);
    if(key==='concrete'){
      rect(18,22,72,30,'#53675b');word('04',24,45,23,'#e4e4d5');
      rect(W-40,76,7,55,'#b98d54');rect(W-29,76,3,55,'#b98d54');
    }else if(key==='inspection'||key==='glass'){
      windowFrame(12,27,W-24,72,key==='glass'?6:7);
      if(key==='inspection'){rect(25,113,114,20,'#4b6156');word('INSPECTION',31,128,13,'#e1e4d5');}
    }else{
      rect(14,19,112,136,'#66766a');rect(19,24,102,132,'#85988b');
      windowFrame(31,35,78,50,2);rect(95,99,16,4,'#d4d6c6');
      word('검수실',153,73,20,'#4f665a');word('INSPECTION',151,91,11,'#63766a');
    }
  }else if(key==='trailer'||key==='vehicleEnd'){
    const sheet=c.createLinearGradient(0,0,0,H);
    sheet.addColorStop(0,'#d7d7c8');sheet.addColorStop(.18,'#d3d2c3');sheet.addColorStop(.63,'#b9bdae');sheet.addColorStop(.89,'#a4ac9c');sheet.addColorStop(1,'#878f80');
    rect(0,0,W,H,sheet);
    for(let x=9;x<W;x+=19){
      rect(x,4,2.1,146,'#97a092');rect(x+2.1,4,1.1,146,'#e4e4d3');
      for(const y of [8,74,146])circle(x,y,1.05,'#889184');
      for(let j=0;j<3;j++){const xx=x+n()*14;rect(xx,134+n()*15,.8,5+n()*12,'rgba(93,86,66,.30)');}
    }
    rect(0,0,W,4,'#ced0bd');rect(0,149,W,4,'#777f72');rect(0,153,W,7,'#535b50');
    if(key==='trailer'){
      rect(8,19,15,34,'#596e5e');word('PORT SERVICE',30,40,16,'#54675a');
      word('CUSTOMS   /   04',30,55,8,'#7b8676');
      for(let x=8;x<W-6;x+=29)rect(x,143,12,3,'#c89750');
    }else{
      rect(W/2-2,6,4,141,'#80897c');
      for(const x of [W*.26,W*.74]){rect(x,12,4,121,'#778175');rect(x+1,12,1.2,121,'#d1d5c8');rect(x-5,104,14,5,'#687368');}
      for(const x of [7,W-19]){rect(x,141,12,5,'#aa5e4e');rect(x,147,12,4,'#c9aa69');}
    }
    noise(400,'rgba(246,241,218,.16)','rgba(41,54,41,.12)');
  }else if(key==='cab'||key==='windshield'){
    const front=key==='windshield';
    gloss(0,0,W,H,'#809383','#586f62');
    const gy=front?10:20,gh=front?134:68,rx=W*.08;
    polygon([[rx,gy],[W-rx,gy],[W-rx*.55,gy+gh],[rx*.55,gy+gh]],'#293c3b');
    c.save();c.beginPath();c.moveTo(rx+4,gy+4);c.lineTo(W-rx-4,gy+4);c.lineTo(W-rx*.55-3,gy+gh-5);c.lineTo(rx*.55+3,gy+gh-5);c.closePath();c.clip();
    const glass=c.createLinearGradient(0,gy,0,gy+gh);glass.addColorStop(0,'#a7b9b3');glass.addColorStop(.30,'#769196');glass.addColorStop(.52,'#4f6b70');glass.addColorStop(1,'#334e4d');rect(0,gy,W,gh,glass);
    const reflect=c.createLinearGradient(0,gy,0,gy+gh*.66);reflect.addColorStop(0,'rgba(224,229,202,.68)');reflect.addColorStop(1,'rgba(187,211,197,.05)');
    polygon([[-5,gy],[W*.84,gy],[W*.55,gy+gh*.40],[0,gy+gh*.60]],reflect);
    stroke(W*.09,gy+gh*.47,W*.64,gy+gh*.25,'rgba(210,225,209,.30)',2.4);
    rect(W*.62,gy+gh*.71,W*.13,gh*.32,'rgba(34,48,44,.55)');
    c.restore();stroke(rx*.65,gy+gh,W-rx*.65,gy+gh,'#a8b4a4',1.8);
    if(front){
      for(const x of [W*.24,W*.69]){stroke(x-15,gy+gh-2,x+16,gy+gh-17,'#344742',2);stroke(x+10,gy+gh-15,x+34,gy+gh-18,'#293b39',2.5);}
    }else{
      rect(W*.81,97,15,4,'#3f4c44');stroke(W*.90,90,W*.86,144,'#52695b',2);
      rect(5,143,W-10,12,'#414b44');
    }
  }else if(key==='wheel'){
    rect(0,0,W,H,'#252823');
    const disk=(r,c0,c1)=>{
      const g=c.createRadialGradient(73,67,4,80,80,r);g.addColorStop(0,c0);g.addColorStop(1,c1);circle(80,80,r,g);
    };
    disk(80,'#4f514a','#272923');disk(66,'#43443d','#393b35');
    for(const r of [64,60]){c.beginPath();c.arc(80,80,r,0,Math.PI*2);c.lineWidth=1.8;c.strokeStyle='#51524a';c.stroke();}
    disk(43,'#b2b3a1','#71776c');disk(34,'#666e64','#969c8e');disk(20,'#939a8b','#646e64');
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;circle(80+32*Math.cos(a),80+32*Math.sin(a),4.4,'#4e554c');
      circle(80+17*Math.cos(a),80+17*Math.sin(a),2.3,'#b7bbaa');
    }
  }else if(key==='hood'){
    gloss(0,0,W,H,'#9aa69a','#6b7f71');rect(0,111,W,45,'#4e5951');
    rect(8,67,46,19,'#d7cfb0');rect(W-54,67,46,19,'#d7cfb0');
    for(let y=54;y<99;y+=8)rect(68,y,W-136,3.2,'#505e55');
    rect(W/2-15,116,30,13,'#c7b898');rect(0,149,W,6,'#7c8579');
  }else if(key==='deck'){
    masonry();rect(0,0,W,8,'#c3a467');for(let x=14;x<W;x+=52){rect(x,36,16,104,'#535e56');rect(x+3,39,3,94,'#727d72');}
  }else if(key==='pallet'||key==='crate'||key==='sack'){
    const crate=key==='crate';
    gloss(0,0,W,137,crate?'#a79676':'#aaa895',crate?'#84775e':'#8b8f80');
    if(key==='sack'){
      for(let y=0;y<130;y+=39)for(let x=-60+(y%78?0:52);x<W;x+=98){
        gloss(x+3,y+3,93,34,'#bcbbaa','#8f9788');stroke(x+7,y+29,x+87,y+30,'#818b7b',1.5);
      }
    }else{
      for(let y=12;y<137;y+=21){
        rect(0,y,W,1.8,'rgba(68,71,55,.35)');
        for(let k=0;k<9;k++){const x=n()*W;stroke(x,y+n()*16,x+3+n()*17,y+n()*16,'rgba(222,214,180,.12)',1);}
      }
      for(const x of [W*.12,W*.85]){rect(x,0,W*.032,137,crate?'#725f46':'#617264');rect(x+1,0,1,137,'#b1b7a0');}
      rect(W*.24,38,W*.35,25,'#e0d8bd');word('C / 0418',W*.26,52,9,'#596057');
      for(let i=0;i<11;i++)rect(W*.27+i*2,55,1+n(),5,'#646658');
    }
    rect(0,137,W,23,'#706d59');rect(0,138,W,5,'#9f9678');
    for(const x of [W*.12,W*.58])rect(x,147,W*.29,9,'#4a5145');
    noise(380,'rgba(242,227,190,.18)','rgba(61,65,53,.14)');
  }else if(key==='shutter'||key==='metal'){
    gloss(0,0,W,H,key==='shutter'?'#cfcec1':'#aeb9af',key==='shutter'?'#b2b8ac':'#8b9b91');
    const pitch=key==='shutter'?7:22;
    for(let y=3;y<H;y+=pitch){rect(0,y,W,1.2,'#8f9a90');rect(0,y+1.5,W,1,'#d9dcd0');}
    for(let x=8;x<W;x+=38){rect(x,2,.85,H,'rgba(130,134,115,.3)');}
    noise(610,'rgba(247,244,217,.2)','rgba(76,84,68,.13)');
  }else if(key==='clerestory'){
    rect(0,0,W,H,'#81968b');
    for(let i=0;i<9;i++){
      const x=5+i*W/9;gloss(x,6,W/9-6,H-13,'#e1e9da','#bccfc3');
      rect(x,H*.49,W/9-6,3,'#94a89a');
    }
  }else if(key==='display'){
    gloss(0,0,W,H,'#e4a467','#c67e47');rect(9,8,W-18,H-18,'#d69455');
    rect(16,18,W-33,89,'#34443e');word('0 0 0 0',34,80,60,'#f3c985');
    word('kg',W-62,84,22,'#e4c99c');word('WEIGHBRIDGE   /   계근대',24,135,15,'#513f2b');
    for(const x of [4,W-8])for(const y of [5,149])rect(x,y,4,3,'#a17046');
  }else{
    rect(0,0,W,H,'#4e665b');rect(4,4,W-8,H-8,'#869589');rect(8,8,W-16,H-16,'#50685d');
    word('세관 4번 창고',22,80,56,'#e7e8d9');word('PORT CUSTOMS    /    WAREHOUSE 04',24,124,21,'#d0d9c8');
    rect(W-74,24,42,7,'#c7ad78');rect(W-74,39,42,5,'#c7ad78');
  }
  c.restore();
}

export function buildSwitchyard(map,face,{lite=false}={}){
  const wall=(x,y,z,w,h,side,mat,shade=2)=>{
    const a=x-side*w/2,b=x+side*w/2;
    face([[a,y,z],[b,y,z],[b,y+h,z],[a,y+h,z]],mat,shade);
  };
  const box=(x,y,z,w,h,d,side,top=side,end=side,bottom=false)=>{
    const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2,t=y+h;
    wall(x,y,f,w,h,1,end,1);wall(x,y,n,w,h,-1,end,1);
    face([[r,y,f],[r,y,n],[r,t,n],[r,t,f]],side,0);
    face([[l,y,n],[l,y,f],[l,t,f],[l,t,n]],side,0);
    face([[l,t,f],[r,t,f],[r,t,n],[l,t,n]],top,2);
    if(bottom)face([[l,y,n],[r,y,n],[r,y,f],[l,y,f]],steel,1);
  };
  const surface=(verts,mat,shade=2)=>face(verts,mat,shade);
  // The rubber tread, shoulder bevel and outward-facing rim stay inside the
  // vehicle footprint. Only the rim is textured. Lite uses an eight-sided tyre.
  const wheel=(b,z,radius)=>{
    const count=lite?8:12,flatRadius=radius*.91;
    for(const s of [-1,1]){
      const outside=b.x+s*(b.w/2-.012),bevel=outside-s*.066,inside=outside-s*.34;
      const point=(x,r,i)=>{const a=i*2*Math.PI/count;return [x,radius+Math.sin(a)*r,z+Math.cos(a)*r];};
      const uv=p=>[.5+(p[2]-z)/(flatRadius*2),.5-(p[1]-radius)/(flatRadius*2)].map(n=>Math.max(0,Math.min(1,n)));
      for(let i=0;i<count;i++){
        const j=i+1,shape=(vertices,material,shade)=>surface(s>0?vertices.reverse():vertices,material,shade);
        const shoulderI=point(bevel,radius,i),shoulderJ=point(bevel,radius,j),frontI=point(outside,flatRadius,i),frontJ=point(outside,flatRadius,j);
        shape([point(inside,radius,i),point(inside,radius,j),lite?frontJ:shoulderJ,lite?frontI:shoulderI],i%2?0x32352f:0x383b34,1);
        if(!lite)shape([shoulderI,shoulderJ,frontJ,frontI],0x454740,1);
        const center=[outside,radius,z],v=[center,frontJ,frontI,center];if(s<0)v.reverse();
        face(v,'wheel',2,v.map(uv));
      }
    }
  };
  const truck=(b)=>{
    const s=Math.sign(b.z);
    if(b.kind==='trailer'){
      box(b.x,.87,b.z,b.w,b.h-.87,b.d,'trailer',0xb0b4a6,'vehicleEnd',true);
      box(b.x,.51,b.z,b.w*.78,.37,b.d-.1,0x434a40,0x626b60);
      for(const offset of [-2.78,-1.60])wheel(b,b.z+s*offset,.52);
      box(b.x,.33,b.z+s*3.19,b.w*.83,.21,.36,0x4e584c);
      // Rolled aluminium roof has a shallow crown and sealed transverse joints.
      for(const side of [-1,1]){
        const edge=b.x+side*b.w/2,mid=b.x,half=b.d/2;
        const v=[[edge,b.h+.008,b.z+half],[mid,b.h+.054,b.z+half],[mid,b.h+.054,b.z-half],[edge,b.h+.008,b.z-half]];
        surface(side<0?v:v.reverse(),side<0?0xb2b6a9:0xbec0b2);
      }
      for(let z=b.z-b.d/2+1.1;z<b.z+b.d/2-.4;z+=1.6)box(b.x,b.h+.038,z,b.w*.73,.021,.025,0x969e91);
      for(const sign of [-1,1]){
        const x=b.x+sign*b.w*.49;
        box(x,1.02,b.z,.051,.085,b.d,0x707767,0xaeb5a5);
        box(x,b.h-.07,b.z,.060,.070,b.d,0xa9b1a0,0xd8dccc);
      }
    }else if(b.kind==='cab'){
      const l=b.x-b.w/2,r=b.x+b.w/2,front=b.z+s*b.d/2,rear=b.z-s*b.d/2;
      const belt=1.47,upper=front-s*.29,roofL=l+.072,roofR=r-.072;
      const cabFront=[[l,belt,front],[r,belt,front],[roofR,b.h,upper],[roofL,b.h,upper]];
      surface(s>0?cabFront:cabFront.reverse(),'windshield',1);
      wall(b.x,.55,front,b.w,belt-.55,s,0x657a66,1);wall(b.x,.47,rear,b.w,b.h-.47,-s,'metal',1);
      for(const side of [-1,1]){
        const x=side<0?l:r,xt=side<0?roofL:roofR;
        const sideFace=(v,mat)=>surface(side===s?v:[v[1],v[0],v[3],v[2]],mat,1);
        sideFace([[x,.47,front],[x,.47,rear],[x,belt,rear],[x,belt,front]],0x657a66);
        sideFace([[x,belt,front],[x,belt,rear],[xt,b.h,rear+s*.07],[xt,b.h,upper]],'cab');
      }
      const roof=[[roofL,b.h,upper],[roofR,b.h,upper],[roofR,b.h,rear+s*.07],[roofL,b.h,rear+s*.07]];
      surface(s>0?roof:roof.reverse(),0x8b9a87);
      box(b.x,.26,b.z,b.w*.79,.24,b.d,0x3e4a40);
      box(b.x,.59,b.z+s*.06,b.w+.04,.075,b.d*.56,0x51605a,0x899081);
      wheel(b,b.z+s*.44,.47);
    }else{
      const zRear=b.z-s*b.d/2,zFront=b.z+s*b.d/2,l=b.x-b.w/2,r=b.x+b.w/2;
      const rear=b.h,front=b.h-.15,low=.39;
      for(const x of [l,r]){
        const verts=[[x,low,zRear],[x,low,zFront],[x,front,zFront],[x,rear,zRear]];
        surface((x===l)===(s===1)?verts:verts.reverse(),0x688677,1);
      }
      wall(b.x,low,zFront,b.w,front-low,s,'hood');
      const hood=[[l,front,zFront],[r,front,zFront],[r,rear,zRear],[l,rear,zRear]];
      surface(s>0?hood:hood.reverse(),0x879c89);
      box(b.x,.29,b.z+s*.10,b.w,.20,b.d*.76,0x3b4540,0x637063);
    }
  };
  const walls={partition:['concrete',zinc,'concrete'],inspection:['inspection',zinc,'concrete'],
    officeDoor:['door',paint,'door'],officeWindow:['glass',paint,'concrete'],
    dock:['deck',0xafb2a5,'deck'],pallet:['pallet',0xaba995,'pallet'],
    sack:['sack',0xaab09c,'sack'],crate:['crate',0xb2a487,'crate'],
    display:[orange,0xa2724d,'display']};
  for(const b of map.boxes){
    if(['trailer','cab','hood'].includes(b.kind)){truck(b);continue;}
    const y=b.base||0,[side,top,end]=walls[b.kind];
    box(b.x,y,b.z,b.w,b.h-y,b.d,side,top,end,y>0);
    if(b.kind==='dock')for(const s of [-1,1]){
      const x=b.x+s*(b.w*.5-.11),h=b.h+.009;
      surface([[x-.045,h,b.z+b.d/2],[x+.045,h,b.z+b.d/2],[x+.045,h,b.z-b.d/2],[x-.045,h,b.z-b.d/2]],0xc6ae75);
    }
    if(b.kind==='inspection'||b.kind==='officeWindow'){
      const s=Math.sign(b.x),p=b.x+s*.7;
      box(p,b.h,b.z,1.86,.13,b.d+.18,steel,zinc,steel,true);
      // Proud profiles catch a thin highlight; glass is inset in its gasket.
      if(!lite)for(const side of [-1,1]){
        const x=b.x+side*(b.w/2+.022),wy=b.h*(1-101/160),top=b.h*(1-25/160),len=b.d*.958;
        box(x,wy-.02,b.z,.088,.059,len,0x56645b,0xb5b9a9);
        box(x,top-.03,b.z,.070,.045,len,0x5d6960,0x9da99a);
        const bays=b.kind==='inspection'?7:6;
        for(let j=0;j<=bays;j++){
          const z=b.z-len*.5+j*len/bays;box(x,wy,z,.062,top-wy,.040,0x526158,0x9eaa9a);
        }
      }
    }
  }
  for(const r of map.ramps){
    const l=r.x-r.w/2,rr=r.x+r.w/2,n=r.z-r.sign*r.d/2,f=r.z+r.sign*r.d/2;
    const top=(x0,x1,y,mat)=>{
      const v=[[x0,y,n],[x1,y,n],[x1,r.h+y,f],[x0,r.h+y,f]];surface(r.sign<0?v:v.reverse(),mat);
    };
    top(l,rr,0,0xa7aea3);top(l+.07,l+.16,.009,0xc6ae75);top(rr-.16,rr-.07,.009,0xc6ae75);
    for(const s of [-1,1]){const x=s<0?l:rr,v=[[x,0,n],[x,0,f],[x,r.h,f],[x,r.h,f]];surface(s*r.sign<0?v:v.reverse(),zinc,1);}
    wall(r.x,0,f,r.w,r.h,r.sign,'deck',1);
  }
  const w=map.width/2,d=map.depth/2,eave=6.65,ridge=9.10;
  surface([[-65,-.09,65],[65,-.09,65],[65,-.09,-65],[-65,-.09,-65]],0x9fa89c);
  // High windows and open loading doors provide bright, broad backgrounds at
  // head height. Matched ends give both teams the same visual adaptation.
  for(const s of [-1,1]){
    const z=s*(d+.17),x=s*(w+.18),inside=z-s*.18;
    box(x,0,0,.36,3.10,map.depth+.66,'concrete',zinc);
    box(x,3.10,0,.35,.72,map.depth+.66,'metal',zinc);
    for(let j=0;j<6;j++){
      const at=-d+(j+.5)*map.depth/6;
      box(x,3.82,at,.32,1.97,map.depth/6,'clerestory',zinc);
      box(x,5.79,at,.33,.86,map.depth/6,'metal',zinc);
    }
    for(const sx of [-1,1]){
      const wing=w-5.5;
      box(sx*(5.5+wing/2),0,z,wing,4.88,.34,'concrete',zinc,'concrete');
      box(sx*5.56,0,z,.38,5.12,.56,steel,zinc);
      box(sx*5.50,.2,inside-s*.13,.52,.78,.25,0xada68b,0xc2c0a4);
      // Apparent exterior starts beyond the physical arena boundary.
      box(sx*11,0,z+s*8,9.7,4.7,4.6,'metal',zinc,'metal');
      box(sx*11,4.7,z+s*8,10.1,.18,4.9,zinc);
    }
    box(0,4.86,z,2*w+.68,eave-4.86,.35,'metal',zinc,'metal');
    const gable=[[-w,eave,z],[w,eave,z],[0,ridge+.13,z],[0,ridge+.13,z]];
    surface(gable,0xafb9ad,1);surface(gable.slice().reverse(),0xb7c2b5,1);
    box(0,4.02,inside,10.85,.90,.36,'shutter',zinc,'shutter');
    box(0,3.91,inside,10.90,.11,.46,steel,zinc);
    box(0,4.93,inside-s*.14,4.80,1.20,.14,'customs',steel,'customs');
    for(const sx of [-1,1]){
      box(sx*4.75,0,inside-s*.4,.14,1.04,.18,0xc0a375);
      box(sx*4.75,.64,inside-s*.4,.155,.15,.19,0x716d59);
    }
    // Quiet backlit apron. Containers and mullions stay away from eye level.
    box(0,0,z+s*10.6,14.5,3.8,.3,0xdfdfcd,0xe2e1d0);
    for(let i=0;i<5;i++)box(-6.1+i*3.04,3.8,z+s*10.6,.10,1.03,.16,zinc);
    box(0,4.81,z+s*10.6,14.5,.07,.13,zinc);
    const a=s*(w+.25),g=s*1.9;
    const roof0=[[a,eave,-d-.75],[g,ridge,-d-.75],[g,ridge,d+.75],[a,eave,d+.75]];
    // The outer roof and interior liner are wound separately for both views.
    const roof=s>0?roof0.slice().reverse():roof0;
    surface(roof,0x9ba89e);surface(roof.slice().reverse().map(([x,y,z])=>[x,y-.07,z]),0xc9d0c2,2);
    const roofLight=[[g,ridge,-d-.75],[0,ridge+.13,-d-.75],[0,ridge+.13,d+.75],[g,ridge,d+.75]];
    const top=s>0?roofLight.slice().reverse():roofLight;
    surface(top,'clerestory');surface(top.slice().reverse().map(([x,y,z])=>[x,y-.07,z]),'clerestory',2);
  }
  for(const z of [-22,-15,-7.5,0,7.5,15,22]){
    for(const s of [-1,1]){
      box(s*(w+.05),.15,z,.24,eave-.1,.29,steel,zinc);
      box(s*(w+.02),1.1,z,.28,.40,.33,0x8a9b89,zinc);
      const ax=s*(w+.14),bx=s*.10,ya=eave-.30,yb=ridge-.20;
      for(const off of [-.12,.12]){
        const v=[[ax,ya,z+off],[bx,yb,z+off],[bx,yb+.28,z+off],[ax,ya+.28,z+off]];
        surface((s<0)===(off>0)?v:v.reverse(),paint,1);
      }
      box(s*(w*.50),eave-.39,z,w,.10,.13,steel);
      const tx=s*6.2;
      box(tx,6.13,z,.032,.60,.032,steel);
      box(tx,6.03,z,.37,.10,1.85,zinc,steel,zinc,true);
      surface([[tx-.12,6.02,z-.84],[tx+.12,6.02,z-.84],[tx+.12,6.02,z+.84],[tx-.12,6.02,z+.84]],0xe1e4ce);
    }
  }
  for(const s of [-1,1])box(s*.92,4.86,0,.049,1.71,.049,dark);
}

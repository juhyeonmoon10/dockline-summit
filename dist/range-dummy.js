import {circle, clippedRect, panel, shell, solid, surface} from './prop-panels.js';

const c = {
  rubber:0x22323d, navy:0x344a56, steel:0x789098, aluminum:0xb5c6c6,
  enamel:0xff8240, edge:0xffad66, rust:0xb94c2d, ivory:0xf5e7cd,
  glass:0x163441, lamp:0x84fff0, lampEdge:0x1d948e, yellow:0xffcb4d,
};

// The pedestal holds the moving bust at .63 m. The shoulder and head panels
// follow the separate scoring boxes in sim.js from both sides of the range.
function makeDummy(detail) {
  const stand=[], body=[];
  const segments=detail?24:10;
  const sides=[-1,1];
  const mark=(mesh,outline,z,color)=>sides.forEach(side=>surface(mesh,outline,z*side,color));
  const sideMark=(mesh,outline,x,color)=>{
    for(const side of sides){
      const face=outline.map(([z,y])=>[side*x,y,-side*z]);
      panel(mesh,face,color);
    }
  };
  const pad=(mesh,x,y,w,h,cut,d,color,side)=>{
    const outline=detail?clippedRect(x,y,w,h,cut):[
      [x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2],
    ];
    solid(mesh,outline,d,color,side);
  };
  const inset=(shape,factor,cx,cy)=>shape.map(([x,y])=>[cx+(x-cx)*factor,cy+(y-cy)*factor]);
  function armor(shape,cx,cy,depth,face,edge) {
    if(!detail){solid(body,shape,depth*2,face,c.navy);return;}
    const faceShape=inset(shape,.91,cx,cy);
    shell(body,[[faceShape,-depth],[shape,-depth+.031],[shape,depth-.031],[faceShape,depth]],
      face,[edge,c.navy,edge]);
  }
  const bar=(mesh,x1,y1,x2,y2,width,depth,color)=>{
    const length=Math.hypot(x2-x1,y2-y1);
    const dx=-(y2-y1)/length*width/2,dy=(x2-x1)/length*width/2;
    solid(mesh,[[x1+dx,y1+dy],[x1-dx,y1-dy],[x2-dx,y2-dy],[x2+dx,y2+dy]],depth,color);
  };

  // Stamped dock plate, split heel and telescoping fork supporting the torso.
  pad(stand,0,.054,.62,.108,.03,.43,c.rubber,c.navy);
  if(detail) {
    shell(stand,[[clippedRect(0,.119,.52,.094,.025),-.19],
      [clippedRect(0,.129,.58,.105,.03),-.15],[clippedRect(0,.129,.58,.105,.03),.15],
      [clippedRect(0,.119,.52,.094,.025),.19]],c.steel,[c.aluminum,c.steel,c.aluminum]);
  } else pad(stand,0,.13,.56,.10,.025,.37,c.steel,c.aluminum);
  for(const side of sides){
    const x=side*.20;
    if(detail) mark(stand,clippedRect(x,.121,.075,.022,.006),.191,c.yellow);
    bar(stand,side*.142,.188,side*.084,.365,.067,.118,c.navy);
    bar(stand,side*.084,.365,side*.102,.565,.032,.076,c.aluminum);
  }
  pad(stand,0,.29,.16,.26,.035,.132,c.enamel,c.rust);
  pad(stand,0,.452,.101,.18,.014,.092,c.rubber,c.steel);
  pad(stand,0,.563,.145,.091,.025,.138,c.steel,c.navy);
  pad(stand,0,.617,.23,.079,.023,.173,c.navy,c.rubber);
  if(detail) for(const y of [.431,.46,.489]) mark(stand,clippedRect(0,y,.11,.012,.003),.049,c.steel);

  // Both cap triangle fans start at the top seam. Its endpoints see the full
  // tapered waist without crossing the small cutouts at shoulder height.
  const torso=[[-.19,1.357],[-.271,1.281],[-.286,1.071],[-.24,.987],
    [-.226,.752],[-.146,.632],[.146,.632],[.226,.752],[.24,.987],
    [.286,1.071],[.271,1.281],[.19,1.357]];
  armor(torso,0,1,.106,c.navy,c.steel);
  const shellOutline=[[-.139,1.307],[-.204,1.257],[-.238,1.121],[-.207,.997],
    [-.194,.813],[-.097,.714],[.097,.714],[.194,.813],[.207,.997],[.238,1.121],
    [.204,1.257],[.139,1.307]];
  if(detail)armor(shellOutline,0,1.02,.125,c.enamel,c.edge);
  else mark(body,shellOutline,.111,c.enamel);

  // High pale shoulder guards divide the main silhouette from the target core.
  for(const side of sides){
    const guard=[[.104,1.264],[.172,1.219],[.281,1.184],[.318,1.218],
      [.318,1.318],[.257,1.391],[.179,1.391],[.125,1.359]];
    const outline=guard.map(([x,y])=>[x*side,y]);
    if(side<0) outline.reverse();
    armor(outline,.215*side,1.296,.139,c.ivory,c.aluminum);
    if(detail){
      mark(body,clippedRect(side*.253,1.327,.055,.016,.005),.141,c.rust);
      mark(body,clippedRect(side*.207,.845,.022,.065,.006),.109,c.steel);
    }
  }
  const y=1.087;
  if(detail){
    shell(body,[[circle(0,y,.146,segments),-.134],[circle(0,y,.175,segments),-.1265],
      [circle(0,y,.175,segments),.1265],[circle(0,y,.146,segments),.134]],c.steel,[c.steel,c.navy,c.steel]);
  }
  const bands=detail?[[.146,c.rubber],[.135,c.ivory],[.105,c.glass],[.077,c.lampEdge],[.057,c.lamp]]:
    [[.159,c.rubber],[.135,c.ivory],[.105,c.glass],[.058,c.lamp]];
  bands.forEach(([radius,color],i)=>mark(body,circle(0,y,radius,segments),(detail?.135:.127)+i*.001,color));
  // No narrow appendages: the front and rear optics align with the head box.
  pad(body,0,1.424,.106,.12,.014,.115,c.aluminum,c.navy);
  const head=clippedRect(0,1.626,.392,.352,.067);
  armor(head,0,1.626,.126,c.enamel,c.edge);
  const visor=[[-.116,1.549],[.116,1.549],[.162,1.581],[.162,1.653],
    [.108,1.703],[-.108,1.703],[-.162,1.653],[-.162,1.581]];
  mark(body,visor,.128,c.glass);
  mark(body,clippedRect(0,1.633,.224,.035,.013),.1295,c.lamp);
  if(detail){
    mark(body,clippedRect(0,1.757,.119,.017,.006),.129,c.ivory);
    mark(body,circle(.112,1.604,.009,8),.130,c.lampEdge);
    const cheek=clippedRect(0,1.507,.121,.027,.009);
    mark(body,cheek,.129,c.rust);
    for(const x of [-.044,0,.044]) mark(body,clippedRect(x,.803,.021,.054,.006),.127,c.rubber);
    for(const side of sides) mark(body,circle(side*.143,1.248,.013,8),.127,c.ivory);
    // Recessed service caps and slots keep the profile readable from the
    // flanks, while the head remains within its 40 cm scoring width.
    sideMark(body,circle(0,1.623,.076,16),.197,c.rubber);
    sideMark(body,circle(0,1.623,.059,12),.198,c.steel);
    sideMark(body,circle(0,1.623,.031,8),.199,c.navy);
    sideMark(body,clippedRect(0,1.623,.033,.009,.003),.1995,c.ivory);
    sideMark(body,clippedRect(0,1.265,.154,.048,.013),.319,c.steel);
    for(const z of [-.043,0,.043]) sideMark(body,clippedRect(z,1.266,.019,.023,.005),.32,c.navy);
  }
  return {stand,body};
}

const full=makeDummy(true),lite=makeDummy(false);
export const dummyBody=full.body, dummyStand=full.stand;
export const dummyBodyLite=lite.body, dummyStandLite=lite.stand;

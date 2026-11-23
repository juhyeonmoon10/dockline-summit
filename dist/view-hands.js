import * as T from './assets/three.module.min.js';

// Rounded cross-sections follow the hand last and glove pattern. Adjacent
// sections share vertices so stitched panels sit on a continuous silhouette.
const rounded=n=>Math.sign(n)*Math.abs(n)**.70;
const section=Array.from({length:20},(_,i)=>{
  const angle=(i+.75)*Math.PI/10;
  return [rounded(Math.cos(angle)),rounded(Math.sin(angle))];
});
// Woven fabric and pebbled leather keep their texture at close desktop FOV.
// One small shared tile also supplies the fine relief across collar folds.
const tile=96,texels=new Uint8Array(tile*tile*4);
let seed=181;
for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=(seed>>>24)/255,weft=Math.cos((x+2*y)*Math.PI/4),warp=Math.cos((2*x-y)*Math.PI/4);
  const shade=Math.round(219+weft*8+warp*5+noise*21);
  texels.set([shade,shade,shade,255],(y*tile+x)*4);
}
const weave=new T.DataTexture(texels,tile,tile);
weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.colorSpace=T.SRGBColorSpace;
weave.magFilter=T.LinearFilter;weave.minFilter=T.LinearMipmapLinearFilter;weave.generateMipmaps=true;weave.needsUpdate=true;
const cloth=new T.MeshStandardMaterial({vertexColors:true,roughness:.80,metalness:.045,map:weave,bumpMap:weave,bumpScale:.0005});
const fabric='#55605c',leather='#333b37',edge='#73796c',seam='#252b29',rubber='#292e2a';
function batch(){return {pos:[],color:[],indices:[]};}
const shade=new T.Color();
function loft(dst,rows,hues,axis) {
  const start=dst.pos.length/3,n=section.length;
  for(const [x,y,z,w,h] of rows){
    let i=0;
    for(const [u,v] of section){
      if(axis==='x')dst.pos.push(x,y+v*h,z+u*w);
      else if(axis==='z')dst.pos.push(x+u*w,y+v*h,z);
      else dst.pos.push(x+u*w,y,z+v*h);
      shade.set(hues[Math.floor(i*hues.length/n)]);dst.color.push(shade.r,shade.g,shade.b);i++;
    }
  }
  // Compute winding from the actual local section/longitudinal axes.
  const negative=rows.at(-1)[axis==='x'?0:axis==='y'?1:2]<rows[0][axis==='x'?0:axis==='y'?1:2];
  const reverse=(axis!=='z')!==negative;
  const tri=(a,b,c)=>dst.indices.push(a,reverse?c:b,reverse?b:c);
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<n;i++){
    const a=start+j*n+i,b=start+j*n+(i+1)%n;tri(a,b,b+n);tri(a,b+n,a+n);
  }
  for(let i=1;i<n-1;i++){
    tri(start,start+i+1,start+i);
    const end=start+(rows.length-1)*n;tri(end,end+i,end+i+1);
  }
}
function mesh(data,sleeve=false) {
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(data.pos,3));
  g.setAttribute('color',new T.Float32BufferAttribute(data.color,3));
  g.setIndex(data.indices);g.computeVertexNormals();
  const pos=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    uv[i*2]=(Math.abs(n.getX(i))>.6?z:x)*22;
    uv[i*2+1]=(Math.abs(n.getY(i))>.7?z*22:y*(sleeve?8:22));
  }
  g.setAttribute('uv',new T.BufferAttribute(uv,2));return new T.Mesh(g,cloth);
}
function fingerSegment(length,radius,tip) {
  const data=batch(),r=radius;
  loft(data,[[.004,0,0,r*.76,r*.84],[0,0,0,r,r],[-length*.24,0,0,r*1.03,r],
    [-length*.78,0,-.001,r*.93,r*.93],[-length,.001,-.001,r*(tip?.50:.80),r*(tip?.56:.83)]],
    [fabric,edge,fabric,leather,leather,seam,fabric,fabric],'x');
  loft(data,[[-.003,0,r*.60,.0028,r*.64],[-.006,0,r*.84,.0029,r*.74],
    [-length*.67,0,r*.78,.0028,r*.66],[-length*.73,0,r*.66,.0018,r*.56]],
    [edge,fabric,fabric,leather],'x');
  return mesh(data);
}
export function articulatedGlove(left=false) {
  const group=new T.Group(),skin=new T.Group(),palm=batch();
  if(left)skin.scale.x=-1;
  group.add(skin);
  // A broad knuckle line joins the narrower heel and cuff. A scalloped
  // backhand patch rises across the metacarpals as one piece of leather.
  loft(palm,[[.050,-.081,.055,.030,.026],[.048,-.076,.036,.036,.039],
    [.044,-.069,.010,.036,.051],[.047,-.064,-.010,.030,.050],[.049,-.061,-.029,.020,.043]],
    [fabric,fabric,leather,leather,seam,leather,fabric,edge],'z');
  loft(palm,[[.073,-.076,.027,.008,.025],[.078,-.066,.018,.008,.037],
    [.077,-.061,-.005,.007,.041],[.071,-.060,-.023,.006,.031]],
    [leather,fabric,seam,leather,leather,edge],'z');
  // The horseshoe seam follows the outside of the dorsal panel. Its raised
  // stitches remain distinct from the grooves dividing the four knuckle pads.
  for(let i=0;i<11;i++){
    const a=-1.15+i*.34,y=-.061+.035*Math.sin(a),z=.001+.020*Math.cos(a);
    const x=.080+.005*Math.cos(a);
    loft(palm,[[x,y,z,.0008,.0011],[x+.0009,y+.002,z+.001,.001,.0012]],
      ['#929384','#72796a'],'z');
  }
  for(let i=0;i<4;i++){
    const y=-.031-i*.021;
    loft(palm,[[.071,y,-.024,.006,.005],[.078,y,-.020,.010,.008],[.080,y,-.010,.010,.009],
      [.079,y,.002,.008,.007],[.075,y,.011,.004,.004]],[leather,'#626961',fabric,leather],'z');
    loft(palm,[[.086,y,-.017,.0015,.004],[.089,y,-.014,.0018,.005],[.089,y,-.008,.0015,.004]],
      [edge,fabric,leather],'z');
  }
  loft(palm,[[.048,-.082,.038,.032,.032],[.052,-.084,.043,.036,.036],[.056,-.087,.062,.037,.032],[.059,-.090,.070,.033,.028]],
    [leather,rubber,seam,rubber],'z');
  loft(palm,[[.071,-.080,.047,.012,.017],[.079,-.077,.051,.009,.019],[.081,-.076,.061,.007,.016]],
    [edge,fabric,leather],'z');
  skin.add(mesh(palm));
  const fingers=[];
  for(let i=0;i<4;i++){
    const a=new T.Group(),b=new T.Group(),base=[.040,.044,.041,.034][i],end=[.030,.035,.031,.026][i];
    a.position.set(.055-i*.001,-.026-i*.024,(left?-.026:.013)-i*.002);skin.add(a);
    a.add(fingerSegment(base,.0117-i*.00045,false));b.position.x=-base+.003;a.add(b);
    b.add(fingerSegment(end,.0109-i*.00040,true));fingers.push({a,b});
  }
  const thumb=new T.Group(),thumbTip=new T.Group();
  thumb.position.set(.039,left?-.029:-.045,left?.006:-.016);skin.add(thumb);thumb.rotation.set(-.26,-.55,.46);
  thumb.add(fingerSegment(.040,.013,false));thumbTip.position.x=-.036;
  thumbTip.add(fingerSegment(.028,.0118,true));thumb.add(thumbTip);
  group.userData={fingers,thumb,thumbTip,left,wrist:new T.Vector3(left?-.057:.057,-.088,.057),
    elbow:new T.Vector3(),sleeve:viewSleeve()};
  flexGlove(group,0);return group;
}

export function flexGlove(hand,release,indexFixed=false) {
  const {fingers,thumb,thumbTip,left}=hand.userData;
  fingers.forEach(({a,b},i)=>{
    const open=indexFixed&&i===0?0:release*(left?1-i*.16:1);
    a.rotation.y=.66-open*(left?2.13:1.02)+i*.045;
    a.rotation.z=-.035+(i-1.5)*.10*open;
    b.rotation.y=-1.22+.93*open-i*.045;
    b.rotation.z=.13-.12*open;
  });
  thumb.rotation.z=.46-release*(left?1.61:.75);thumb.rotation.y=-.55+release*(left?.29:-.38);
  thumbTip.rotation.y=-.74+release*.36;
  if(indexFixed){
    // The ring sits outside the closed fist. Hold it with the index only while
    // the other fingers extend; the thumb rests across the curled middle finger.
    fingers[0].a.rotation.set(0,-.96,.08);fingers[0].b.rotation.set(0,-1.55,.08);
    thumb.rotation.y=1.56-release*.53;thumb.rotation.z=-.88+release*.29;
    thumbTip.rotation.y=-1.70+release*.38;
  }
}

let sleeve;
export function viewSleeve() {
  if(sleeve)return sleeve.clone();
  const data=batch();
  const rows=[[0,0,0,.080,.069],[-.004,.25,.003,.072,.065],[.002,.43,-.002,.063,.058],
    [.004,.55,0,.067,.058],[-.001,.58,.003,.061,.054],[0,.65,0,.064,.052],
    [.002,.73,0,.054,.048],[-.001,.77,.002,.057,.047],[0,.81,0,.048,.043],[0,.95,0,.043,.036]];
  loft(data,rows,['#48504b','#424a45','#39433e','#414943','#39423d','#333c38','#444c46','#4c544d'],'y');
  // The forearm's asymmetric pleats compress into the closed wrist gaiter.
  for(const [y,w,h] of [[.57,.065,.056],[.69,.059,.051],[.775,.054,.047]]){
    const strip=[[-.004,y-.025,.002,w*.94,h*.96],[-.003,y,0,w*1.035,h*1.025],
      [.001,y+.012,.001,w*.96,h*.94]];
    loft(data,strip,['#556057','#49524a','#3f463e','#394039','#343d37','#434c44'],'y');
  }
  loft(data,[[0,.83,0,.048,.044],[0,.85,0,.050,.044],[0,.94,0,.044,.037],[0,.955,0,.041,.036]],
    [rubber,leather,seam,leather],'y');
  loft(data,[[0,.93,0,.044,.038],[0,.936,0,.0448,.039],[0,.948,0,.043,.038]], [edge,fabric,seam,fabric],'y');
  sleeve=mesh(data,true);return sleeve.clone();
}

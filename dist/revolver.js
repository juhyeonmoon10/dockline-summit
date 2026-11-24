import * as T from './assets/three.module.min.js';
import {Parts} from './arena-parts.js';
import {REVOLVER_RELOAD_CONTACT as marks,revolverCylinderSwing} from './revolver-timing.js';

const metal=new T.MeshStandardMaterial({vertexColors:true,metalness:.55,roughness:.43});
const wood=new T.MeshStandardMaterial({vertexColors:true,metalness:.05,roughness:.73});
const transform=new T.Matrix4(),angle=Math.PI/2;
const steel='#747e82',slate='#54616a',edge='#939b9a',dark='#343e45',brass='#c2965a';
const rear=-.020,front=-.146,hubY=.019,pivotY=-.042;

// Side-profile extrusions keep the openings between the grip, cylinder and top
// strap visible when the player turns this small silhouette in their hand.
function panel(parts,points,width,bevel,color,cx=0){
  const path=new T.Shape(points.map(([z,y])=>new T.Vector2(-z,y)));
  const g=new T.ExtrudeGeometry(path,{depth:width,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2});
  g.rotateY(angle);g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
  parts.append(g,transform.makeTranslation(cx-width/2,0,0),color);g.dispose();
}
function put(parent,parts,material,name){
  const result=parts.mesh(material);result.name=name;parent.add(result);return result;
}
// Six scallops taper out at each end of the drum. The same silhouette catches
// light from either side and visibly advances when the next shot is fired.
function drumShell(){
  const g=new T.BufferGeometry(),pos=[],colors=[],indices=[],n=72,c=new T.Color();
  const sections=[[front,.042,0,'#687276'],[front+.006,.049,0,'#829092'],
    [front+.012,.051,.0015,'#62717a'],[front+.023,.051,.008,'#68757b'],
    [rear-.040,.051,.008,'#647076'],[rear-.028,.051,.0028,'#606d74'],
    [rear-.021,.051,0,'#6c787c'],[rear-.012,.051,0,'#4e5a62'],
    [rear-.011,.050,0,'#384650'],[rear-.009,.051,0,'#748186'],[rear-.004,.051,0,'#59656a'],[rear,.048,0,'#929995']];
  for(const [i,[z,r,depth,hue]] of sections.entries())for(let j=0;j<n;j++){
    const a=Math.PI*2*j/n,flute=Math.max(0,Math.cos(6*a))**1.45;
    const radius=r-depth*flute;pos.push(radius*Math.cos(a),radius*Math.sin(a),z);
    const polishedLip=Math.max(0,Math.cos(6*a-1.32))**8;
    c.set(hue).multiplyScalar(1+(-.48*flute+.25*polishedLip)*depth/.008);colors.push(c.r,c.g,c.b);
    if(i){
      const a0=(i-1)*n+j,b0=(i-1)*n+(j+1)%n;
      indices.push(a0,b0,a0+n,b0,b0+n,a0+n);
    }
  }
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
function disc(parts,x,y,z,diameter,depth,hue){parts.tube(x,y,z,diameter,depth,diameter,hue,angle);}
export function makeRevolver(){
  const model=new T.Group();model.name='revolver';
  const frame=new Parts(),grip=new Parts(),trim=new Parts(),sights=new Parts();
  panel(frame,[[-.153,.075],[-.149,.082],[-.012,.083],[.014,.066],[.028,.035],
    [.022,.004],[-.007,-.008],[-.015,.016],[-.007,.039],[-.007,.064],[-.149,.066]],.045,.0035,steel);
  panel(frame,[[-.164,.058],[-.145,.069],[-.135,.060],[-.136,-.022],[-.105,-.031],
    [-.038,-.029],[-.015,-.020],[.020,-.001],[.031,-.025],[.004,-.045],
    [-.041,-.047],[-.108,-.044],[-.154,-.031]],.042,.0035,slate);
  panel(frame,[[.024,.007],[.043,-.009],[.054,-.052],[.073,-.116],[.068,-.137],
    [.010,-.147],[-.008,-.125],[-.028,-.065],[-.023,-.029]],.042,.004,slate);
  const gripOutline=[[.023,-.028],[.039,-.033],[.048,-.065],[.065,-.116],[.061,-.130],
    [.016,-.138],[.004,-.124],[-.013,-.070],[-.019,-.046],[-.008,-.032]];
  for(const side of [-1,1]){
    panel(grip,gripOutline,.008,.004,'#704936',side*.024);
    for(let i=0;i<5;i++)grip.beam([side*.033,-.057-i*.011,.001+i*.002],
      [side*.033,-.069-i*.011,.034+i*.002],.0015,.0022,'#805640');
    trim.six(side*.033,-.078,.019,.013,.003,.013,brass,0,0,angle);
    trim.six(side*.035,-.078,.019,.007,.002,.007,slate,0,0,angle);
    for(const [z,y] of [[.002,.007],[-.055,-.033],[-.129,-.025]])trim.six(side*.025,y,z,.009,.003,.009,edge,0,0,angle);
  }
  // Narrow bridge and chamfered shroud carry a continuous highlight past the cylinder.
  panel(frame,[[-.379,.061],[-.371,.072],[-.172,.074],[-.151,.067],[-.151,.029],
    [-.184,.015],[-.334,.018],[-.373,.028]],.039,.0035,steel);
  for(const side of [-1,1]){
    trim.beam([side*.023,.053,-.361],[side*.023,.054,-.174],.0016,.004,edge);
    trim.beam([side*.023,.035,-.350],[side*.023,.036,-.223],.0016,.003,'#4d5a60');
    for(let i=0;i<3;i++)trim.cube(side*.023,.027,-.213+i*.015,.002,.005,.008,dark,-.25);
  }
  disc(trim,0,.053,-.375,.049,.012,slate);disc(trim,0,.053,-.381,.042,.002,edge);
  disc(trim,0,.053,-.3815,.030,.001,'#303b43');
  panel(sights,[[-.366,.073],[-.348,.091],[-.338,.091],[-.338,.073]],.007,.0017,dark);
  sights.cube(0,.088,-.3365,.0045,.006,.002,brass);
  for(const side of [-1,1])sights.cube(side*.015,.087,-.002,.011,.013,.018,dark);
  panel(frame,[[-.103,-.038],[-.096,-.064],[-.078,-.077],[-.051,-.082],[-.027,-.073],
    [-.010,-.052],[-.018,-.052],[-.033,-.068],[-.052,-.075],[-.077,-.071],[-.088,-.060],[-.094,-.038]],.012,.0021,slate);
  panel(trim,[[-.062,-.040],[-.058,-.047],[-.059,-.056],[-.068,-.062],[-.073,-.062],
    [-.065,-.054],[-.066,-.043]],.010,.0014,'#575651');
  panel(frame,[[-.014,.030],[.000,.034],[.003,.028],[-.005,.016],[-.018,.016]],.004,.0018,dark,-.028);
  put(model,frame,metal,'frame');put(model,grip,wood,'walnut-grip');put(model,trim,metal,'inlays-and-sights');
  put(model,sights,metal,'iron-sights');

  const hinge=new T.Group(),rotor=new T.Group();
  hinge.name='cylinder-hinge';hinge.position.set(-.022,pivotY,0);model.add(hinge);
  rotor.name='cylinder';rotor.position.set(.022,hubY-pivotY,0);hinge.add(rotor);
  const arm=new Parts();
  arm.beam([0,.001,-.142],[.022,hubY-pivotY,-.150],.023,.009,slate);
  disc(arm,0,.004,-.140,.014,.023,edge);
  put(hinge,arm,metal,'swing-arm');
  const flutes=new T.Mesh(drumShell(),metal);flutes.name='flutes';rotor.add(flutes);
  const faces=new Parts(),rounds=new Parts();
  disc(faces,0,0,front+.001,.084,.002,slate);disc(faces,0,0,rear-.001,.096,.002,'#58626a');
  disc(faces,0,0,rear+.001,.021,.003,steel);
  for(let i=0;i<6;i++){
    const a=Math.PI/2+i*Math.PI/3,x=Math.cos(a)*.032,y=Math.sin(a)*.032;
    disc(faces,x,y,rear+.0004,.023,.0017,dark);
    disc(faces,x,y,front-.0004,.019,.0017,dark);
    disc(rounds,x,y,rear+.0018,.018,.0015,brass);disc(rounds,x,y,rear+.0028,.007,.001,'#988164');
  }
  put(rotor,faces,metal,'cylinder-faces');put(rotor,rounds,metal,'cylinder-inserts');
  const hammer=new Parts();
  panel(hammer,[[-.012,.004],[-.005,.028],[.011,.045],[.021,.040],[.009,.031],[.002,.010]],.016,.002,slate);
  for(let i=0;i<3;i++)hammer.cube(0,.041-i*.002,.013+i*.003,.019,.002,.002,edge);
  put(model,hammer,metal,'hammer').position.set(0,.036,.008);
  return model;
}

let loader;
export function revolverLoader(){
  if(!loader){
    const parts=new Parts();disc(parts,0,0,0,.082,.019,'#49535a');disc(parts,0,0,.012,.048,.009,steel);
    disc(parts,0,0,.022,.027,.018,dark);
    for(let i=0;i<6;i++){
      const a=Math.PI/2+i*Math.PI/3,x=Math.cos(a)*.032,y=Math.sin(a)*.032;
      disc(parts,x,y,-.017,.016,.023,brass);
    }
    loader=parts.mesh(metal);loader.name='loader';
  }
  return loader.clone();
}

export function revolverAction(model){
  return {hinge:model.getObjectByName('cylinder-hinge'),drum:model.getObjectByName('cylinder'),
    hammer:model.getObjectByName('hammer'),inserts:model.getObjectByName('cylinder-inserts')};
}
export function poseRevolver(action,player,cycle){
  const t=player.reload>0&&player.reloadDuration>0?1-player.reload/player.reloadDuration:0;
  action.hinge.rotation.z=revolverCylinderSwing(t);
  action.hammer.rotation.x=-.40*(cycle?.stroke??0);
  action.drum.rotation.z=((6-(player.ammo??6))%6-(cycle?.indexLag??0))*Math.PI/3;
  action.inserts.visible=t<marks.eject||t>=marks.seat;
  return t;
}

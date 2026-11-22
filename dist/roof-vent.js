import {circle,clippedRect,panel,shell,solid,surface} from './prop-panels.js';

// A service-deck ventilation skid with an axial turbine, a perforated rear
// grille and a switch box. All coordinates are local to its mounting rails.
function buildVent() {
  const faces=[];
  const c={body:0xecb33b, lip:0xffd56c, deep:0xb47727, graphite:0x283e4a,
    rubber:0x172e39, steel:0x728c95, silver:0xb6ccd0, light:0xdce6de,
    teal:0x3dc4b4, darkTeal:0x326a76, warning:0xee733c};
  const box=(x,y,w,h,cut,depth,front,side)=>solid(faces,clippedRect(x,y,w,h,cut),depth,front,side);
  const disk=(x,y,r,z,color,n=32)=>surface(faces,circle(x,y,r,n),z,color);
  const flank=(outline,x,color)=> {
    for(const side of [-1,1]) panel(faces,outline.map(([z,y])=>[side*x,y,-side*z]),color);
  };
  const ring=(x,y,outer,inner,zo,zi,front,color,segments=32)=>{
    const outside=circle(x,y,outer,segments), inside=circle(x,y,inner,segments);
    for(let i=0;i<segments;i++){
      const j=(i+1)%segments;
      const quad=[[...outside[i],zo],[...outside[j],zo],[...inside[j],zi],[...inside[i],zi]];
      panel(faces,front?quad.reverse():quad,color);
    }
  };
  for(const x of [-.75,.75]){
    box(x,.068,.32,.136,.027,1.10,c.graphite,c.rubber);
    box(x,.177,.234,.107,.024,.84,c.steel,c.graphite);
  }
  box(0,.32,2.13,.25,.065,1.09,c.graphite,c.steel);
  const housing=clippedRect(0,1.30,2.10,1.97,.31);
  shell(faces,[
    [clippedRect(0,1.30,1.96,1.84,.30),-.48],[housing,-.40],
    [housing,.40],[clippedRect(0,1.30,1.96,1.84,.30),.50],
  ],c.body,[c.lip,c.body,c.deep]);
  const y=1.34;
  // Front inlet rolls back into a shaded interior behind the seven vanes.
  for(const [outer,inner,z0,z1,paint] of [
    [.863,.822,-.49,-.559,c.deep],[.822,.77,-.559,-.565,c.lip],
    [.77,.71,-.565,-.495,c.steel],[.71,.684,-.495,-.487,c.graphite],
  ])ring(0,y,outer,inner,z0,z1,true,paint);
  disk(0,y,.688,-.486,c.rubber);
  const at=(r,angle,z)=>[Math.cos(angle)*r,y+Math.sin(angle)*r,z];
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;
    const root=[at(.095,a-.20,-.57),at(.095,a+.25,-.58),at(.095,a+.69,-.56)];
    const mid=[at(.38,a+.04,-.528),at(.405,a+.24,-.563),at(.39,a+.57,-.525)];
    const tip=[at(.64,a+.31,-.503),at(.664,a+.49,-.529),at(.61,a+.76,-.503)];
    for(const [inner,outer] of [[root,mid],[mid,tip]]){
      panel(faces,[inner[0],inner[1],outer[1],outer[0]],c.teal);
      panel(faces,[inner[1],inner[2],outer[2],outer[1]],c.darkTeal);
    }
  }
  ring(0,y,.159,.118,-.575,-.598,true,c.silver,16);disk(0,y,.119,-.599,c.graphite,16);
  disk(0,y,.044,-.602,c.teal,12);
  for(const i of [0,1,2,3,4,5,6,7]){
    const a=(i+.5)*Math.PI/4;
    disk(.895*Math.cos(a),y+.895*Math.sin(a),.029,-.485,c.graphite,8);
  }
  // Rear grille has broad horizontal slats; its negative space remains visible
  // at normal play distance, even without using an alpha texture.
  surface(faces,clippedRect(0,y,1.67,1.53,.21),.505,c.graphite);
  for(let i=-3;i<=3;i++){
    const w=1.48-Math.abs(i)*.087;
    const strip=clippedRect(0,y+i*.177,w,.103,.035);
    surface(faces,strip,.518,c.steel);
    surface(faces,clippedRect(0,y+i*.177+.028,w-.07,.027,.010),.520,c.silver);
  }
  flank(clippedRect(0,1.52,.65,.53,.064),1.052,c.deep);
  flank(clippedRect(0,1.52,.59,.47,.053),1.055,c.body);
  for(const y of [1.403,1.48,1.557,1.634]){
    flank(clippedRect(0,y,.42,.037,.014),1.058,c.graphite);
    flank(clippedRect(0,y+.017,.39,.012,.003),1.059,c.lip);
  }
  // A raised handle is part of the unit, not a separate prop.
  for(const x of [-.478,.478]) box(x,2.333,.135,.178,.025,.262,c.steel,c.graphite);
  box(0,2.43,1.09,.125,.043,.243,c.graphite,c.steel);
  // Separate switch box and wiring duct on one side break the mirrored outline.
  box(.992,.78,.20,.68,.06,.68,c.steel,c.graphite);
  box(1.145,.822,.32,.535,.046,.645,c.light,c.steel);
  surface(faces,clippedRect(1.145,.879,.213,.196,.021),-.326,c.graphite);
  surface(faces,clippedRect(1.145,.925,.149,.037,.01),-.328,c.teal);
  surface(faces,clippedRect(1.146,.834,.088,.049,.01),-.328,c.warning);
  for(const x of [-.72,-.60,-.48]) {
    for(const z of [-.482,.502]) surface(faces,clippedRect(x,.459,.069,.031,.006),z,c.graphite);
  }
  return faces;
}

export const roofVentFaces=buildVent();

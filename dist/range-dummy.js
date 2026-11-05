// Shared flat metalwork for the WebGL scene and the software rasterizer.
// Local y=0 is the floor. Both faces carry the same strike markings.
export const dummyStand = [];
export const dummyBody = [];

const steel = 0x293c48, zinc = 0x82959b, amber = 0xffab2f;
const bodyShade = 0xaa481f, enamel = 0xf18331, ivory = 0xfff3c7;
const rect = (x,y,w,h) => [[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
const octagon = (x,y,w,h,bevel) => [
  [x-w/2+bevel,y-h/2],[x+w/2-bevel,y-h/2],[x+w/2,y-h/2+bevel],[x+w/2,y+h/2-bevel],
  [x+w/2-bevel,y+h/2],[x-w/2+bevel,y+h/2],[x-w/2,y+h/2-bevel],[x-w/2,y-h/2+bevel]
];

function facesAt(mesh,outline,z,color) {
  mesh.push({points:outline.map(([x,y])=>[x,y,z]),color,shade:2});
  mesh.push({points:outline.map(([x,y])=>[x,y,-z]).reverse(),color,shade:1});
}
function plate(mesh,outline,depth,face,rim) {
  const z=depth/2;
  facesAt(mesh,outline,z,face);
  for(let i=0;i<outline.length;i++){
    const [x,y]=outline[i], [nx,ny]=outline[(i+1)%outline.length];
    mesh.push({points:[[x,y,-z],[nx,ny,-z],[nx,ny,z],[x,y,z]],color:rim,shade:x>nx?2:0});
  }
}
function rings(x,y,z,bands){
  for(const [r,color] of bands){
    const disk=Array.from({length:16},(_,i)=>{
      const a=i*Math.PI/8;
      return [x+r*Math.cos(a),y+r*Math.sin(a)];
    });
    facesAt(dummyBody,disk,z,color);
    z+=.002;
  }
}

plate(dummyStand,octagon(0,.065,.61,.13,.035),.47,steel,0x435665);
plate(dummyStand,rect(0,.205,.25,.16),.24,zinc,steel);
plate(dummyStand,rect(0,.45,.13,.48),.12,steel,0x536a74);
plate(dummyStand,rect(0,.33,.18,.09),.16,amber,bodyShade);
plate(dummyStand,octagon(0,.615,.26,.13,.035),.20,steel,zinc);

const bust=[[-.15,.63],[.15,.63],[.225,.75],[.255,.99],[.32,1.05],[.32,1.26],
  [.25,1.36],[.16,1.395],[-.16,1.395],[-.25,1.36],[-.32,1.26],[-.32,1.05],
  [-.255,.99],[-.225,.75]];
plate(dummyBody,bust,.275,bodyShade,steel);
const insert=bust.map(([x,y])=>[x*.91,1.02+(y-1.02)*.93]);
facesAt(dummyBody,insert,.141,enamel);
for(const side of [-1,1]){
  facesAt(dummyBody,rect(side*.234,1.26,.064,.045),.145,ivory);
  facesAt(dummyBody,rect(side*.18,.78,.037,.055),.145,steel);
}
rings(0,1.075,.146,[[.19,steel],[.147,ivory],[.107,steel],[.051,amber]]);
plate(dummyBody,rect(0,1.43,.135,.12),.14,zinc,steel);
plate(dummyBody,octagon(0,1.626,.396,.355,.076),.28,amber,bodyShade);
facesAt(dummyBody,octagon(0,1.626,.34,.293,.062),.142,ivory);
rings(0,1.635,.146,[[.081,steel],[.043,enamel]]);

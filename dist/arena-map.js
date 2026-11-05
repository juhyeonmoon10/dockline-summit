// Dimensions in metres. Team one mirrors team zero through the centre of the court.
const pair = ({x,z,...rest}) => [{x,z,...rest},{x:-x,z:-z,...rest}];
const pairedRamp = r => [r,{...r,x:-r.x,z:-r.z,sign:-r.sign}];
const start = [
  {x:1.8,z:18.25,yaw:.25}, {x:-2.8,z:18.4,yaw:-.33}, {x:.1,z:19.4,yaw:-.08}
];
export const MAP = {
  name:'서밋 아레나', width:35, depth:42,
  zone:{x:0,y:2.58,z:0,r:2.24},
  spawns:[start,start.map(p=>({x:-p.x,z:-p.z,yaw:p.yaw+Math.PI}))],
  plates:[{x:1.8,y:1.65,z:13.5},{x:-1.8,y:1.65,z:-13.5}],
  boxes:[
    {x:0,z:0,w:8.1,d:7.2,base:2.25,h:2.58,kind:'summit'},
    ...[-1,1].flatMap(sx=>[-1,1].map(sz=>({x:3.46*sx,z:2.85*sz,w:.8,d:1,h:2.25,kind:'pier'}))),
    ...pair({x:10.85,z:-.7,w:4.15,d:7.0,h:1.64,kind:'terrace'}),
    ...pair({x:-6.9,z:9.9,w:3.5,d:2.55,h:2.65,kind:'block'}),
    ...pair({x:7.2,z:10.05,w:3.35,d:1.75,h:1.16,kind:'pod'}),
    ...pair({x:5.15,z:15.3,w:2.4,d:1.35,h:1.02,kind:'pod'}),
    ...pair({x:-14.25,z:7.2,w:2.1,d:3.0,h:2.15,kind:'block'}),
    ...pair({x:5.85,z:2.45,w:1.65,d:2.65,h:1.1,kind:'pod'}),
    ...pair({x:14.45,z:12,w:2.4,d:1.8,h:1.13,kind:'pod'}),
  ],
  ramps:[
    ...pairedRamp({x:0,z:6.75,w:4.8,d:6.3,h:2.58,axis:'z',sign:-1,kind:'summit'}),
    ...pairedRamp({x:10.85,z:5.15,w:4.15,d:4.7,h:1.64,axis:'z',sign:-1,kind:'terrace'}),
  ],
};

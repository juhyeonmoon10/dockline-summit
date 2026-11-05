import { MAP } from './arena-map.js';
import { surfacesAt, clearPosition, support, walkHeight } from './arena-world.js';

const columns=MAP.width, rows=MAP.depth, pad=.43, nodes=[], cells=Array.from({length:columns*rows},()=>[]);
const cell=(x,z)=>Math.max(0,Math.min(columns-1,Math.floor(x+columns/2)))+columns*Math.max(0,Math.min(rows-1,Math.floor(z+rows/2)));
for(let i=0;i<cells.length;i++){
  const x=i%columns-columns/2+.5,z=Math.floor(i/columns)-rows/2+.5;
  for(const y of new Set(surfacesAt(x,z,pad))){
    if(clearPosition(x,z,y,pad)){const id=nodes.length;nodes.push({id,x,y,z,next:[],from:[]});cells[i].push(id);}
  }
}
// Follow a path on its actual floor, never jumping from the underpass onto its roof.
function straight(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.38));let y=a.y;
  for(let i=1;i<=n;i++){
    const x=a.x+dx*i/n,z=a.z+dz*i/n,top=walkHeight(x,z,y,.27,pad);
    if(top==null)return false;
    y=support(x,z,top+.01,pad);
    if(!clearPosition(x,z,y,pad))return false;
  }
  return Math.abs(y-b.y)<.3;
}
for(const a of nodes){
  for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){
    for(const id of cells[cell(a.x+dx,a.z+dz)]){
      const b=nodes[id];if(id===a.id||b.y-a.y>.65)continue;
      if(straight(a,b)){a.next.push(id);b.from.push(a.id);}
    }
  }
}
function nearest(x,z,desired){
  let best=-1,score=Infinity;
  const ci=cell(x,z),cx=ci%columns,cz=Math.floor(ci/columns);
  for(let r=0;r<=3;r++){
    for(let j=Math.max(0,cz-r);j<=Math.min(rows-1,cz+r);j++)for(let i=Math.max(0,cx-r);i<=Math.min(columns-1,cx+r);i++){
      if(r&&Math.max(Math.abs(j-cz),Math.abs(i-cx))!==r)continue;
      for(const id of cells[j*columns+i]){
        const n=nodes[id],cost=(n.x-x)**2+(n.z-z)**2+3*(n.y-desired)**2;
        if(cost<score){score=cost;best=id;}
      }
    }
    if(score<(r+.5)**2)break;
  }
  return best;
}
const fields=new Map();
function distances(goal){
  if(fields.has(goal))return fields.get(goal);
  const field=new Int16Array(nodes.length).fill(-1),queue=new Int16Array(nodes.length);
  let read=0,write=1;field[goal]=0;queue[0]=goal;
  while(read<write){const n=nodes[queue[read++]];for(const id of n.from)if(field[id]<0){field[id]=field[n.id]+1;queue[write++]=id;}}
  if(fields.size>=40)fields.delete(fields.keys().next().value);
  fields.set(goal,field);return field;
}
export function nextWaypoint(p,x,z,height=0){
  const goal=nearest(x,z,height),here=nearest(p.x,p.z,p.y);
  if(goal<0||here<0)return p;
  const target={x,y:height,z};if(straight(p,target))return target;
  const field=distances(goal);
  let current=nodes[here],visible=current;
  for(let i=0;i<16&&field[current.id]>0;i++){
    const options=current.next.filter(n=>field[n]===field[current.id]-1);
    if(!options.length)break;
    const score=id=>(nodes[id].x-x)**2+(nodes[id].z-z)**2;
    const best=nodes[options.reduce((a,b)=>score(a)<score(b)?a:b)];
    if(!straight(p,best))break;
    current=visible=best;
  }
  return visible;
}


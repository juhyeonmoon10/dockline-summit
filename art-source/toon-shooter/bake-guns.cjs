// Converts Quaternius CC0 OBJ sources to compact, synchronous browser geometry.
const fs=require('node:fs'),path=require('node:path');
const specs={rifle:{file:'AK',scale:.60,y:.12,mag:[285,314,414]},shotgun:{file:'Shotgun',scale:.59,y:.06,mag:[]},sniper:{file:'Sniper',scale:.59,y:.12,mag:[31,18,54]},pistol:{file:'Pistol',scale:.48,y:.14,mag:[4]}};
const packed={};
const srgb=v=>Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055));
for(const [kind,s] of Object.entries(specs)){
 const p=[],n=[],faces=[],materials={};let material;
 for(const line of fs.readFileSync(path.join(__dirname,s.file+'.mtl'),'utf8').split(/\r?\n/)){
  const [op,...args]=line.split(/\s+/);if(op==='newmtl')material=args[0];if(op==='Kd')materials[material]=args.map(Number).map(srgb);
 }
 for(const line of fs.readFileSync(path.join(__dirname,s.file+'.obj'),'utf8').split(/\r?\n/)){
  const [op,...args]=line.split(/\s+/);if(op==='v')p.push(args.map(Number));if(op==='vn')n.push(args.map(Number));if(op==='usemtl')material=args[0];
  if(op==='f')faces.push({material,points:args.map(x=>x.split('/').map(Number))});
 }
 const roots=p.map((_,i)=>i),find=i=>roots[i]===i?i:roots[i]=find(roots[i]);
 for(const f of faces)for(const point of f.points)roots[find(point[0]-1)]=find(f.points[0][0]-1);
 const magazine=new Set(s.mag.map(find)),parts={body:[],magazine:[]};
 for(const f of faces){const target=parts[magazine.has(find(f.points[0][0]-1))?'magazine':'body'];for(let j=1;j<f.points.length-1;j++)for(const point of [f.points[0],f.points[j],f.points[j+1]])target.push({point,material:f.material});}
 packed[kind]={};
 for(const [name,vertices] of Object.entries(parts)){
  if(!vertices.length)continue;
  const known=new Map(),data=[],indices=[];
  for(const v of vertices){const key=v.point.join('/')+'/'+v.material;if(!known.has(key)){
   const [x,y,z]=p[v.point[0]-1],[nx,ny,nz]=n[v.point[2]-1],buf=Buffer.alloc(12);let rgb=materials[v.material];
   if(v.material==='Grey')rgb=kind==='rifle'?[113,141,157]:kind==='sniper'?[112,136,132]:[151,162,172];
   const pos=[-z*s.scale,(y-s.y)*s.scale,x*s.scale],norm=[-nz,ny,nx];
   pos.forEach((x,i)=>buf.writeInt16LE(Math.round(x*10000),i*2));norm.forEach((x,i)=>buf.writeInt8(Math.round(x*127),6+i));rgb.forEach((x,i)=>buf.writeUInt8(x,9+i));
   known.set(key,data.length);data.push(buf);
  }indices.push(known.get(key));}
  const indexBuffer=Buffer.alloc(indices.length*2);indices.forEach((x,i)=>indexBuffer.writeUInt16LE(x,2*i));
  packed[kind][name]=[Buffer.concat(data).toString('base64'),indexBuffer.toString('base64')];
 }
 console.log(kind,faces.reduce((s,f)=>s+f.points.length-2,0),'triangles');
}
fs.writeFileSync(path.join(__dirname,'../../dist/assets/toon-guns.js'),'// Generated from Quaternius Toon Shooter Game Kit (CC0). See art-source/toon-shooter.\nexport const guns='+JSON.stringify(packed)+';\n');

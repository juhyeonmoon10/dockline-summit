// Convex, flat-shaded panels. The same face lists drive the GPU and CPU
// renderers; model coordinates use metres, Y up, and a front facing -Z.
export function panel(mesh, points, color) {
  const [a,b,c] = points;
  const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2];
  const vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
  const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
  const light=(-nx*.30+ny*.70-nz*.42)/Math.hypot(nx,ny,nz);
  mesh.push({points, color, shade:light>0?2:light>-.55?1:0});
}

export function clippedRect(x,y,w,h,cut) {
  const l=x-w/2, r=x+w/2, b=y-h/2, t=y+h/2;
  return [[l+cut,b],[r-cut,b],[r,b+cut],[r,t-cut],
    [r-cut,t],[l+cut,t],[l,t-cut],[l,b+cut]];
}

export function circle(x,y,r,segments) {
  return Array.from({length:segments},(_,i)=>{
    const a=i*2*Math.PI/segments;
    return [x+Math.cos(a)*r,y+Math.sin(a)*r];
  });
}

export function surface(mesh,outline,z,color) {
  const face=outline.map(([x,y])=>[x,y,z]);
  panel(mesh,z<0?face.reverse():face,color);
}

// Bevel and taper are explicit cross-sections, keeping silhouettes stable at
// all camera angles. Outlines are counter-clockwise when viewed from +Z.
export function shell(mesh,sections,capColor,sideColors) {
  const loops=sections.map(([outline,z])=>outline.map(([x,y])=>[x,y,z]));
  panel(mesh,[...loops[0]].reverse(),capColor);
  for(let k=1;k<loops.length;k++){
    const a=loops[k-1], b=loops[k];
    for(let i=0;i<a.length;i++){
      const j=(i+1)%a.length;
      panel(mesh,[a[i],a[j],b[j],b[i]],sideColors[k-1]);
    }
  }
  panel(mesh,loops.at(-1),capColor);
}

export function solid(mesh,outline,depth,color,side=color) {
  shell(mesh,[[outline,-depth/2],[outline,depth/2]],color,[side]);
}

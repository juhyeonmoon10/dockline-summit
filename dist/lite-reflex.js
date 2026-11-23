import {REFLEX_APERTURE} from './optic-fit.js';

function fallbackContour(c,glass,scale=1){
  REFLEX_APERTURE.forEach(([x,y],i)=>{
    const px=glass.x+x*glass.scale*scale,py=glass.y-y*glass.scale*scale;
    if(i)c.lineTo(px,py);else c.moveTo(px,py);
  });
  c.closePath();
}

// An attached open sight is available even on the first frame of a cold load.
export function drawFallbackSight(c,g){
  c.save();
  c.fillStyle='#414b49';c.fillRect(g.x-.026*g.scale,g.y+.028*g.scale,.052*g.scale,.020*g.scale);
  c.fillStyle='#525e5b';c.beginPath();fallbackContour(c,g,1.19);fallbackContour(c,g);c.fill('evenodd');
  c.fillStyle='rgba(89,171,159,.14)';c.beginPath();fallbackContour(c,g);c.fill();
  c.restore();
}

export function drawReflexDot(c,pose,heightCSS){
  if(!pose?.glass&&!pose?.fallbackGlass)return;
  const {width,height}=c.canvas;
  c.save();
  if(pose.fallbackGlass){c.beginPath();fallbackContour(c,pose.fallbackGlass);}
  else{
    const {glass,uv,gunWidth,reloadPose,kick}=pose;
    // Use precisely the same draw transform as the photographed weapon tile.
    c.translate(pose.x,pose.y);c.rotate(reloadPose*.28+kick*.014);c.scale(1+kick*.035,1+kick*.035);
    c.beginPath();
    for(let i=0;i<glass.length;i+=2){
      const x=(glass[i]-uv[0])*gunWidth,y=(glass[i+1]-uv[1])*height;
      if(i)c.lineTo(x,y);else c.moveTo(x,y);
    }
    c.closePath();
  }
  c.clip();c.setTransform(1,0,0,1,0,0);
  const x=width*.5,y=height*.5,core=Math.max(.59,1.5*height/(heightCSS||height)),halo=core*2.32;
  const glow=c.createRadialGradient(x,y,0,x,y,halo);
  glow.addColorStop(0,'#ff3536');glow.addColorStop(.34,'#ff1420');glow.addColorStop(.46,'#ce131e');
  glow.addColorStop(.54,'rgba(101,3,10,.45)');glow.addColorStop(1,'rgba(207,27,27,0)');
  c.fillStyle=glow;c.fillRect(x-halo,y-halo,2*halo,2*halo);c.restore();
}

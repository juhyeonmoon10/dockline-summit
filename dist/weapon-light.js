import * as T from './assets/three.module.min.js';

// Two studio panels form long moving highlights on bevels. A tiny local
// panorama is sufficient, and never needs to be downloaded or shown behind the prop.
export function studioReflection(){
  const w=128,h=64,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const lon=(x+.5)/w*Math.PI*2-Math.PI,lat=(y+.5)/h*Math.PI-Math.PI/2;
    const panel=(u,v,du,dv)=>Math.exp(-Math.pow((lon-u)/du,8)-Math.pow((lat-v)/dv,8));
    const overhead=panel(1.2,.82,1.32,.19),side=panel(-1.74,.21,.18,.78),rim=panel(-.25,-.06,.56,.10);
    const sky=.032+.031*(1+Math.sin(lat)),i=4*(y*w+x);
    pixels[i]=255*Math.min(1,sky+overhead+.75*side+.42*rim);
    pixels[i+1]=255*Math.min(1,sky+.96*overhead+.90*side+.45*rim);
    pixels[i+2]=255*Math.min(1,sky+.86*overhead+side+.47*rim);pixels[i+3]=255;
  }
  const env=new T.DataTexture(pixels,w,h);env.mapping=T.EquirectangularReflectionMapping;
  env.magFilter=T.LinearFilter;env.minFilter=T.LinearFilter;env.needsUpdate=true;
  return env;
}

import * as T from './assets/three.module.min.js';

const v = new T.Vector3();
const n = new T.Vector3();
const m = new T.Matrix4();
const q = new T.Quaternion();
const scale = new T.Vector3();
const normal = new T.Matrix3();
const tint = new T.Color();
const white = new T.Color(0xffffff);
const box = new T.BoxGeometry();
const cylinder = new T.CylinderGeometry(0.5, 0.5, 1, 10);
const bevel = new T.CylinderGeometry(0.5, 0.5, 1, 6);
const up = new T.Vector3(0, 1, 0);
export const solidMaterial = new T.MeshLambertMaterial({ vertexColors: true });
export const glowMaterial = new T.MeshBasicMaterial({ vertexColors: true });

// Bake repeated geometry into a single indexed buffer per material.
export class Parts {
  constructor() {
    this.points = []; this.normals = []; this.colors = []; this.indices = [];
  }
  append(shape, matrix, color) {
    const p = shape.attributes.position, ns = shape.attributes.normal;
    const start = this.points.length / 3;
    tint.set(color);
    normal.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      n.fromBufferAttribute(ns, i).applyMatrix3(normal).normalize();
      this.points.push(v.x,v.y,v.z); this.normals.push(n.x,n.y,n.z);
      this.colors.push(tint.r,tint.g,tint.b);
    }
    for (const ix of shape.index.array) this.indices.push(start + ix);
  }
  piece(shape,x,y,z,w,h,d,color,rx=0,ry=0,rz=0) {
    q.setFromEuler(new T.Euler(rx,ry,rz));
    m.compose(v.set(x,y,z),q,scale.set(w,h,d));
    this.append(shape,m,color);
  }
  cube(x,y,z,w,h,d,color,rx=0,ry=0,rz=0) { this.piece(box,x,y,z,w,h,d,color,rx,ry,rz); }
  tube(x,y,z,w,h,d,color,rx=0,ry=0,rz=0) { this.piece(cylinder,x,y,z,w,h,d,color,rx,ry,rz); }
  six(x,y,z,w,h,d,color,rx=0,ry=0,rz=0) { this.piece(bevel,x,y,z,w,h,d,color,rx,ry,rz); }
  beam(a,b,width,depth,color) {
    const direction = new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const len = direction.length();
    q.setFromUnitVectors(up,direction.normalize());
    m.compose(v.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2),q,scale.set(width,len,depth));
    this.append(box,m,color);
  }
  mesh(material=solidMaterial) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(this.points,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(this.normals,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(this.colors,3));
    geo.setIndex(this.indices); geo.computeBoundingSphere();
    return new T.Mesh(geo,material);
  }
}


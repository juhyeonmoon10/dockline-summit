"""Fit connected bevel strips to the projected Tripo blade; preserve the scanned handles."""
import numpy as np
from PIL import Image


def fit_sections(guides, pivot, pos, faces):
    """Intersect each guide with the source silhouette, in the registered blade frame."""
    rows = np.array([row[:5] for row in guides], dtype=float)
    points = pos - pivot
    triangles = points[faces, :2]
    edges = triangles[:, [1, 2, 0]] - triangles
    offsets = np.zeros((len(rows), 2))
    for i, row in enumerate(rows[:-1]):
        a, b = row[:2], row[2:4]
        delta = b-a
        across = delta / np.linalg.norm(delta)
        along = across[[1, 0]] * [-1, 1]
        dist = (triangles-a) @ along
        next_dist = dist[:, [1, 2, 0]]
        cross = (dist > 0) != (next_dist > 0)
        if not cross.any():
            continue
        hits = triangles[cross] + (dist[cross]/(dist[cross]-next_dist[cross]))[:, None] * edges[cross]
        ratios = ((hits-a) @ delta) / (delta @ delta)
        ratios = ratios[(ratios > -.22) & (ratios < 1.22)]
        if len(ratios) > 2:
            offsets[i] = np.clip([ratios.min(), ratios.max()-1], -.15, .15)
    offsets = (np.pad(offsets, ((1, 1), (0, 0)), mode='edge')[:-2]+2*offsets+
               np.pad(offsets, ((1, 1), (0, 0)), mode='edge')[2:])/4
    delta = rows[:, 2:4] - rows[:, :2]
    rows[:, :2] += offsets[:, :1] * delta
    rows[:, 2:4] += offsets[:, 1:] * delta
    return rows


def blade_mesh(rows, level):
    """Build each continuous bevel with its own normals; share the exact boundary positions."""
    subdiv = {'held':4, 'preview':2, 'carried':1}[level]
    sections = []
    for i in range(len(rows)-1):
        a, b, c, d = rows[max(0,i-1)], rows[i], rows[i+1], rows[min(i+2,len(rows)-1)]
        for t in np.arange(subdiv)/subdiv:
            sections.append(.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t**3))
    # Two close endpoints avoid degenerate faces at the extreme tip after game quantization.
    tip = rows[-1].copy()
    tip[:2] += (rows[-2,:2]-rows[-2,2:4])*.02
    tip[2:4] -= (rows[-2,:2]-rows[-2,2:4])*.02
    tip[4] = .00014
    sections = np.array([*sections,tip])
    a, b, h = sections[:,:2], sections[:,2:4], sections[:,4]
    a_to_b = b-a
    distances = np.r_[0, np.cumsum(np.linalg.norm(np.diff((a+b)/2,axis=0),axis=1))]
    v = distances/distances[-1]
    front = np.array([[0,.23],[.055,.71],[.085,.78],[.35,1],[.86,.205],[.963,.07],[1,0]])
    # Wrap from one side around the back. Keeping the bevels split avoids interpolation
    # through the ridge while the long curved silhouette still shades smoothly.
    cross_section = np.concatenate((front, front[-2::-1]*[1,-1], front[:1]),axis=0)
    pos, normals, uv, faces = [], [], [], []
    def point(edge):
        return np.column_stack((a+a_to_b*edge[0], h*edge[1]))
    for i in range(len(cross_section)-1):
        e, f = cross_section[i:i+2]
        left, right = point(e), point(f)
        center = (left+right)/2
        n = np.cross(np.gradient(center,axis=0),right-left)
        forward = (e[1]+f[1])/2
        if i == len(cross_section)-2:
            flip = np.sum(n[:,:2]*a_to_b)>0
        else:
            flip = np.sum(n[:,2])*forward<0
        if flip:n = -n
        n /= np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
        first = len(pos)
        for j in range(len(v)):
            pos.extend((left[j],right[j]))
            normals.extend((n[j],n[j]))
            uv.extend(((.012+.976*v[j],.78+.20*e[0]),(.012+.976*v[j],.78+.20*f[0])))
        for j in range(len(v)-1):
            k = first+2*j
            faces.extend(((k,k+2,k+1),(k+1,k+2,k+3)) if not flip else ((k,k+1,k+2),(k+1,k+3,k+2)))
    return tuple(np.asarray(field) for field in (pos,normals,faces,uv))


def fit_ring(pos, faces):
    center=np.array([.018,-.210])
    points=pos[np.unique(faces)]
    xy=points[:,:2]-center
    angles=np.arctan2(xy[:,1],xy[:,0])
    radii=np.linalg.norm(xy,axis=1)
    theta=np.arange(96)*2*np.pi/96
    outer=[]
    for angle in theta:
        arc=(np.cos(angles-angle)>.988)&(radii<.068)
        outer.append(np.quantile(radii[arc],.96) if arc.any() else .042)
    smooth=np.asarray(outer)
    for _ in range(3):
        smooth=(np.roll(smooth,1)+2*smooth+np.roll(smooth,-1))*.25
    return center,smooth,np.median(points[:,2])


def ring_mesh(profile,level):
    center,outer,center_z=profile
    theta=np.linspace(0,2*np.pi,{'held':97,'preview':49,'carried':25}[level])
    rim=np.interp(theta,np.linspace(0,2*np.pi,len(outer)+1),np.r_[outer,outer[0]])
    xy=np.array([np.cos(theta),np.sin(theta)]).T
    points=[];normals=[];uv=[];faces=[]
    # The Tripo outer silhouette includes the pointed end lug. The inside is kept
    # circular around the existing spin pivot, with one continuous rounded bevel.
    edge=np.array([[0,-.62],[0,.62],[.058,.90],[.17,1.],[.79,1.],
                   [.94,.88],[1,.58],[1,-.58],[.94,-.88],[.79,-1],
                   [.17,-1],[.058,-.90],[0,-.62]])
    for i,(l,r) in enumerate(zip(edge,edge[1:])):
        strips=[]
        for width,z in (l,r):
            rad=.0314+width*(rim-.0314)
            strips.append(np.column_stack((center+xy*rad[:,None],np.full_like(theta,center_z+.0078*z))))
        a,b=strips
        first=len(points)
        n=np.cross(np.gradient((a+b)/2,axis=0),b-a)
        # Travelling around the hole and up its inner wall gives the inward normal.
        n=-n/np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
        n[0]=n[-1]=(n[0]+n[-1])/2
        for j in range(len(theta)):
            points.extend((a[j],b[j]));normals.extend((n[j],n[j]))
            uv.extend(((.015+.970*theta[j]/(2*np.pi),.93+.045*l[0]),
                       (.015+.970*theta[j]/(2*np.pi),.93+.045*r[0])))
        for j in range(len(theta)-1):
            k=first+2*j
            faces.extend(((k,k+1,k+2),(k+1,k+3,k+2)))
    return tuple(np.asarray(v) for v in (points,normals,faces,uv))


def handle_normals(pos,faces,normal):
    # UV islands in the generated handles often duplicate the same geometric vertex.
    # Smooth within each facing group across the duplicates, retaining the hard rim of holes.
    _,inverse=np.unique(np.rint(pos*80000).astype(int),axis=0,return_inverse=True)
    near=np.concatenate([inverse[faces[:,[0,1]]],inverse[faces[:,[1,2]]],inverse[faces[:,[2,0]]]])
    near=np.unique(np.concatenate([near,near[:,::-1]]),axis=0)
    total=inverse.max()+1
    for sign in (-1,1):
        w=np.clip((normal[:,2]*sign-.2)*1.45,0,1)
        data=np.zeros((total,4))
        np.add.at(data,inverse,np.column_stack((normal,np.ones(len(pos))))*w[:,None])
        for _ in range(3):
            up=np.zeros_like(data)
            np.add.at(up,near[:,0],data[near[:,1]])
            data=data+up
            data/=np.maximum(data[:,3:4],1)
        mean=data[inverse,:3]
        weight=.82*w[:,None]
        normal=normal*(1-weight)+mean*weight
    return normal/np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-10)


def knife_atlas(tex, suffix):
    # The original UVs still cover every grip and pin. Give the rebuilt blade a
    # reserved strip with brushed grain, free of the source's baked foil reflections.
    width, height = tex.size
    data = np.empty((height,width,3),'u1')
    grip_height = height*3//4
    data[:grip_height] = np.asarray(tex.resize((width,grip_height),Image.Resampling.LANCZOS))
    rng = np.random.default_rng(7651)
    shape = (height-grip_height,width)
    y,x = np.indices(shape)
    grain = rng.normal(0,.8,shape) + rng.normal(0,1.8,(shape[0],1)) + .7*np.sin(y*1.7+x/110)
    if suffix=='-normal':
        data[:grip_height] = np.rint([128,128,255]+(data[:grip_height].astype(float)-[128,128,255])*.5)
        data[grip_height:] = [128,128,255]
    elif suffix=='-orm':
        data[grip_height:,:,0] = 255
        data[grip_height:,:,1] = np.clip(115+2.1*grain,0,255)
        data[grip_height:,:,2] = 211
    else:
        # Bright cutting edge and the contrasting brushed flat are visible to the software renderer.
        band = np.interp(y[:,0]/height+.75,[.77,.78,.791,.797,.85,.952,.972,.978,.99],
                         [.87,.87,.90,.76,.78,.965,.97,1.0,1.0])
        data[grip_height:] = np.clip(np.array([189,198,199])*band[:,None,None]+grain[:,:,None],0,255)
    return Image.fromarray(data)

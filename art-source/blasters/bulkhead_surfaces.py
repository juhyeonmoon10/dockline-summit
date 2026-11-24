"""Resurface Bulkhead's broad panels using sections measured on the registered Tripo prop."""
import numpy as np
from PIL import Image


def smoothstep(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)


# Longitudinal coordinate, lower contour, upper contour, side extent. The
# small fore-end and slanted butt each have their own continuous cross sections.
profiles={
    'receiver':[
        [-.419,-.074,.035,.038],[-.415,-.080,.039,.043],[-.400,-.080,.040,.044],
        [-.270,-.080,.040,.044],[-.254,-.079,.040,.044],[-.237,-.071,.040,.044],
        [-.216,-.069,.040,.044],[-.157,-.075,.039,.044],[-.139,-.078,.033,.044],
        [-.123,-.080,.023,.044],[-.105,-.082,.015,.044],[-.091,-.083,.005,.041],
        [-.084,-.080,.002,.038]],
    'stock':[
        [-.108,-.067,.006,.027],[-.088,-.081,.002,.029],[-.069,-.091,.002,.0295],
        [-.054,-.100,.008,.0295],[-.043,-.100,.013,.0295],[-.019,-.097,.016,.0295],
        [-.011,-.097,.016,.030],[-.007,-.090,.016,.030],[-.001,-.090,.016,.031],
        [.018,-.098,.016,.032],[.044,-.109,.016,.033],[.085,-.128,.017,.034],
        [.117,-.142,.017,.0345],[.137,-.150,.017,.0345],[.142,-.151,.017,.0345]],
    'pad':[[.138,-.149,.016,.034],[.141,-.153,.019,.0365],[.144,-.155,.020,.037],
           [.150,-.155,.020,.037],[.154,-.152,.017,.035]],
    'sight':[[-.731,.039,.041,.011],[-.729,.039,.060,.013],
             [-.727,.039,.062,.0135],[-.713,.039,.062,.0135],[-.709,.039,.051,.011]],
}
regions={'receiver':(.255,.48),'stock':(.49,.735),'pump':(.745,.885),'pad':(.896,.985)}


def sheet(row,size):
    y,x=np.mgrid[0:size,0:size]
    u=(x+.5)/size
    v=(y+.5)/size
    rng=np.random.default_rng(491)
    noise=rng.normal(0,1,(size,size))
    base=np.zeros((size,size,3),'u1')
    normal=np.full_like(base,[128,128,255])
    orm=np.full_like(base,[255,178,50])
    for name,(v0,v1) in regions.items():
        t=(v-v0)/(v1-v0)
        mask=(v>=v0-.004)&(v<=v1+.004)
        if name=='stock':
            # Curved growth rings follow the cheek of the stock, in island-independent space.
            phase=49*t + 2.3*np.sin(u*7+t*3) + 1.3*np.sin(u*14+t*4)+.7*np.sin(u*26+t*9)
            grain=3.6*np.sin(phase)+2.1*np.cos(phase*2.05+.7)+1.5*np.sin(t*216+u*9)
            pores=np.maximum(0,np.cos(phase*3+np.sin(9*u+t*32)))**12
            patina=3.4*np.cos(12*u+4*t)+2.1*np.sin(29*u-13*t)
            value=grain+patina-8*pores+noise*.55
            color=[111,76,53]+value[:,:,None]*[1,.83,.63]
            rough=155+3*np.sin(phase)+11*pores+noise
            metal=3
        elif name=='receiver':
            # The recessed side panel and two circular pins follow the details of the Tripo reference.
            def rounded_box(cx,cy,hx,hy,r):
                a=np.abs(u-cx)-hx+r
                b=np.abs((t-cy)*.38)-hy+r
                return np.hypot(np.maximum(a,0),np.maximum(b,0))+np.minimum(np.maximum(a,b),0)-r
            panel=rounded_box(.245,.52,.195,.030,.012)
            slot=rounded_box(.478,.52,.28,.004,.003)
            gran=.7*noise+.8*np.sin(t*370+u*3)
            etched=7*np.exp(-(panel/.004)**2)
            value=gran-etched-12*(1-smoothstep(-.002,.006,panel))-34*(1-smoothstep(-.001,.003,slot))
            for px,py in ((.135,.22),(.738,.24)):
                radius=np.hypot(u-px,(t-py)*.38)
                value+=9*np.exp(-((radius-.008)/.0019)**2)-15*(1-smoothstep(.002,.006,radius))
            color=[74,83,86]+value[:,:,None]
            rough=146+3*gran
            metal=137
        elif name=='pump':
            pebble=np.sin(u*640+2*np.sin(t*90)) * np.cos(t*240-.7*np.cos(u*82))
            value=2.2*pebble+.85*noise
            color=[55,59,58]+value[:,:,None]
            rough=208+value*1.8
            metal=3
        else:
            value=1.4*noise+.9*np.sin(t*280)
            color=[41,45,44]+value[:,:,None]
            rough=215+noise*2
            metal=3
        base[mask]=np.rint(np.clip(color[mask],0,255)).astype('u1')
        orm[mask,1]=np.rint(np.clip(rough[mask],0,255)).astype('u1')
        orm[mask,2]=metal
    return {'base':base,'normal':normal,'orm':orm}[row]


def atlas(original,surface,output):
    import io
    size=1024
    def source_image(ref):
        image=surface.doc['images'][surface.doc['textures'][ref['index']]['source']]
        return Image.open(io.BytesIO(surface.view(image['bufferView']))).convert('RGB')
    material=surface.doc['materials'][0]
    inputs={'base':(original,'dockline-shotgun.webp'),
            'normal':(source_image(material['normalTexture']),'dockline-shotgun-normal.webp'),
            'orm':(source_image(material['pbrMetallicRoughness']['metallicRoughnessTexture']),'dockline-shotgun-finish.webp')}
    result=None
    for name,(src,file) in inputs.items():
        data=sheet(name,size)
        old=np.asarray(src.resize((size,size//4),Image.Resampling.LANCZOS))
        if name=='base':
            rgb=old.astype(float)
            gray=np.mean(rgb,axis=2)
            # The small retained sight and guard were painted with an overhead
            # highlight in their color image. Keep the warm sight dot and give the
            # surrounding steel a stable blued finish under the game's moving lights.
            neutral=1-smoothstep(15,38,np.ptp(rgb,axis=2))
            steel=np.array([64,69,71])+((gray-95)*.22)[:,:,None]
            old=np.clip(rgb*(1-neutral[:,:,None])+steel*neutral[:,:,None],0,255)
        if name=='normal':
            old=np.clip(np.array([128,128,255])+(old.astype(float)-[128,128,255])*.35,0,255)
        data[:size//4]=old
        image=Image.fromarray(data)
        if name=='orm':image=image.resize((512,512),Image.Resampling.LANCZOS)
        image.save(output/file,quality=93,method=5)
        if name=='base':result=np.asarray(image)
    return result


def surface(name,level):
    if name=='pump':
        zs=np.linspace(-.692,-.544,77 if level=='held' else 29)
        rib=.5+.5*np.cos((zs+.674)*2*np.pi/.0215)
        mid=smoothstep(-.691,-.678,zs)*(1-smoothstep(-.56,-.545,zs))
        rounded=smoothstep(-.692,-.688,zs)*(1-smoothstep(-.548,-.544,zs))
        widths=.034+.0015*rounded+.0048*mid*rib
        low=-.077-.0035*rounded-.004*mid*rib
        rows=np.column_stack((zs,low,np.full_like(zs,-.0085),widths))
    else:
        data=np.array(profiles[name])
        # More stations through long flats accurately interpolate both the grain and normal field.
        z=np.unique(np.r_[data[:,0],np.linspace(data[0,0],data[-1,0],41 if level=='held' else 8)])
        rows=np.column_stack((z,*[np.interp(z,data[:,0],data[:,col]) for col in (1,2,3)]))
    start,end=rows[0,0],rows[-1,0]
    count=36 if level=='held' else 16
    theta=np.linspace(0,2*np.pi,count+1)
    cs,sn=np.cos(theta),np.sin(theta)
    # A superellipse gives broad faces with a soft corner on stock and fore-end.
    # Beveled steel has a much tighter radius than wood or textured rubber.
    exponent={'receiver':.20,'stock':.53,'pad':.46,'pump':.71,'sight':.32}[name]
    cx=np.sign(cs)*np.abs(cs)**exponent
    cy=np.sign(sn)*np.abs(sn)**exponent
    cx[np.abs(cs)<1e-12]=0;cy[np.abs(sn)<1e-12]=0
    # Extra points near each side's broad center let an inset cast a subtle real highlight.
    if name in ('stock','receiver'):
        fractions=np.linspace(-.77,.77,15 if level=='held' else 3)
        extra=np.arcsin(np.sign(fractions)*np.abs(fractions)**(1/exponent))
        theta=np.sort(np.unique(np.r_[theta,np.mod(extra,2*np.pi),np.pi-extra]))
        cs,sn=np.cos(theta),np.sin(theta)
        cx=np.sign(cs)*np.abs(cs)**exponent;cy=np.sign(sn)*np.abs(sn)**exponent
        cx[np.abs(cs)<1e-12]=0;cy[np.abs(sn)<1e-12]=0
    z,low,high,w=rows.T
    h=((high+low)[:,None]+cy*(high-low)[:,None])/2
    x=w[:,None]*cx
    longitudinal=np.broadcast_to(z[:,None],h.shape).copy()
    if name in ('stock','pad'):longitudinal+=(h+.05)*.28
    u=(z-start)/(end-start)
    lat=(cy+1)/2
    side=smoothstep(.78,.98,np.abs(cx))
    if name=='stock':
        motif=(lat[None,:]-(.36+.31*smoothstep(.35,.85,u[:,None])))
        raised=smoothstep(0,.14,motif)*(1-smoothstep(.83,.99,lat))
        x+=np.sign(cx)*.0058*raised*side*smoothstep(.32,.64,u[:,None])*(1-smoothstep(.94,1,u[:,None]))
    elif name=='receiver':
        lat=(h+.084)/.126
        raised=smoothstep(.052,.069,u[:,None])*(1-smoothstep(.417,.435,u[:,None]))
        inset=raised*smoothstep(.419,.451,lat)*(1-smoothstep(.589,.619,lat))
        x-=np.sign(cx)*.0026*side*inset
    v0,v1=regions.get(name,(.448,.468))
    # The top and bottom faces clamp to continuous material at the ends of the latitude range.
    tex=np.stack(np.broadcast_arrays(.01+.98*u[:,None],v0+(v1-v0)*lat),axis=-1)
    pos=np.stack((x,h,longitudinal),axis=-1)
    # Analytical sampling from neighboring rings produces continuous tangents through the seam.
    tangent=np.roll(pos[:,:-1],-1,axis=1)-np.roll(pos[:,:-1],1,axis=1)
    tangent=np.concatenate((tangent,tangent[:,:1]),axis=1)
    normals=np.cross(tangent,np.gradient(pos,axis=0))
    normals/=np.maximum(np.linalg.norm(normals,axis=-1,keepdims=True),1e-12)
    stride=pos.shape[1]
    faces=[]
    for i in range(len(rows)-1):
        for j in range(stride-1):
            k=i*stride+j
            faces.extend(((k,k+1,k+stride),(k+1,k+stride+1,k+stride)))
    points=list(pos.reshape(-1,3));norm=list(normals.reshape(-1,3));coords=list(tex.reshape(-1,2))
    for i,sign in ((0,-1),(-1,1)):
        center=len(points)
        points.append(pos[i,:-1].mean(0));coords.append(tex[i,:-1].mean(0))
        n=np.array([0,-.28 if name in ('stock','pad') else 0,1])*sign
        n=n/np.linalg.norm(n)
        norm.append(n)
        points.extend(pos[i]);norm.extend([n]*stride);coords.extend(tex[i])
        for j in range(stride-1):
            a=center+1+j
            faces.append((center,a,a+1) if sign>0 else (center,a+1,a))
    return tuple(np.asarray(f) for f in (points,norm,faces,coords))


def guard(level):
    # Traced outer and inner attachment points from the original broadside render.
    # Along the open U the old faceted faces become a single rounded flat-sided strap.
    contours=np.array([
        [83,74,125,74],[84,99,126,99],[84,157,129,155],[88,207,129,184],
        [94,229,146,215],[112,243,163,229],[146,268,181,236],
        [159,274,195,238],[189,275,211,239],[382,275,376,240],
        [430,274,403,237],[443,263,416,230],[483,225,446,197],
        [490,211,449,182],[496,158,454,151],[504,99,458,99],[505,73,461,73]],
        dtype=float)
    rows=[]
    for i in range(len(contours)-1):
        a,b,c,d=contours[max(0,i-1)],contours[i],contours[i+1],contours[min(len(contours)-1,i+2)]
        for t in np.arange(3 if level=='held' else 1)/(3 if level=='held' else 1):
            rows.append(.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t**3))
    rows=np.array([*rows,contours[-1]])
    outer=rows[:,:2]/2700;inner=rows[:,2:]/2700
    # A rounded rectangular section follows the guard; it is open into the receiver at each end.
    section=np.array([[0,-.75],[.035,-.94],[.13,-1],[.87,-1],[.965,-.94],[1,-.75],
                      [1,.75],[.965,.94],[.87,1],[.13,1],[.035,.94],[0,.75],[0,-.75]])
    surface=[]
    for width,side in section:
        zy=outer+(inner-outer)*width
        surface.append(np.column_stack((np.full(len(rows),side*.020),-.045-zy[:,1],zy[:,0]-.30)))
    grid=np.stack(surface,axis=1)
    near=grid[:,:-1]
    tangent=np.roll(near,-1,axis=1)-np.roll(near,1,axis=1)
    tangent=np.concatenate((tangent,tangent[:,:1]),axis=1)
    n=np.cross(np.gradient(grid,axis=0),tangent)
    n/=np.maximum(np.linalg.norm(n,axis=-1,keepdims=True),1e-12)
    if np.mean(n[:,2,0])>0:
        n=-n;flip=True
    else:flip=False
    indices=[]
    for i in range(len(rows)-1):
        for j in range(len(section)-1):
            k=i*len(section)+j
            a,b,c,d=k,k+len(section),k+1,k+len(section)+1
            indices.extend(((a,c,b),(c,d,b)) if flip else ((a,b,c),(c,b,d)))
    uv=np.empty((len(rows),len(section),2))
    uv[:,:,0]=np.linspace(.55,.80,len(rows))[:,None]
    uv[:,:,1]=.446+.013*section[:,0]
    return grid.reshape(-1,3),n.reshape(-1,3),np.array(indices),uv.reshape(-1,2)

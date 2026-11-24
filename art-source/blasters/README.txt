Kenney Blaster Kit 2.1
https://kenney.nl/assets/blaster-kit
https://opengameart.org/content/blaster-kit
Creative Commons Zero 1.0 Universal (see License.txt).
Source archive SHA-256: 91e3093e95427d59625e7e2ce2d0399b861600160fd0b4ada7714796b67cea8c

blaster-d.obj = rifle, blaster-j.obj = shotgun, blaster-e.obj = sniper, blaster-c.obj = pistol.
Open the included OBJ files in a model editor such as Blender. Keep group names
body, magazine and scope (the original blaster-* groups map to body). Keep the
barrel facing -Z, Y up. To rebuild the offline browser geometry, run bake.py with
Python 3 and Pillow. The game adds local palette adjustments, sights, handling,
hand poses and animation in dist/blaster.js and dist/render.js.

Dockline generated game props

The two knives and the Bulkhead shotgun use separate Tripo image-to-3D exports.
The SHA-256 hashes below identify the original local GLBs used by the bakers.

Karambit   058b6cec11804c40e4bad7f9f4c83b8d475c06e3cdd56b722b44da4fe314f140
Balisong   bff3717e746d28359db4ba0431e124b3b8a0e326b8c14bb8cdd0b8f4c32bfd88
Bulkhead   b0bd6f600493d28f9a545c72fe2fd8072701ab41ae9bdb28d82da48e7966b0ea

bake-knife.py transfers the scanned handles and surface detail. knife_surfaces.py
fits continuous bevel strips to each registered blade silhouette and fits the
karambit ring to its source outline. The output shares the game's original pivots.

bake-bulkhead.py retains the generated sight dot, inner trigger and side fitting.
bulkhead_surfaces.py rebuilds the surrounding steel, wooden stock, guard, sight
support and moving fore-end from cross sections and outlines of the registered
export. Their wood grain and metal finishes are authored for the game's lighting.

DOCKLINE environment model sources

Artist: Kenney (https://kenney.nl)
License: Creative Commons Zero 1.0 Universal (CC0).
https://creativecommons.org/publicdomain/zero/1.0/

Factory Kit 3.0 (official): https://kenney.nl/assets/factory-kit
Selected source meshes: machine-fortified, pipe-large-valve.
City Kit Industrial 2.0 (official): https://kenney.nl/assets/city-kit-industrial
Selected source meshes: shipping-container-a, building-g, water-tower, detail-tank.
Blaster Kit 2.1 (official): https://kenney.nl/assets/blaster-kit
Selected source mesh: crate-wide, with slate panels and original amber corner guards.
Each subfolder includes the original OBJ/MTL, colour palette and supplied license.

Run from the repository root:
  node art-source/environment/bake-environment.cjs

The baker decodes each source palette and bakes its colours into the vertices.
All props are centred in X/Z and start at Y=0. Positions are quantized to 1mm.
No runtime external downloads, OBJ parser or texture fetch is required.
The shipping container and cargo case are rotated so their long sides follow X.
Game team variants recolour its baked palette, preserving shading variation.
Meshes reuse cached geometry and one vertex-colour Lambert material.

Runtime API: dist/arena-props.js
  propMesh(kind, variant='source') => independent Mesh transform
  propGeometry(kind, variant='source') => shared BufferGeometry for batching
  propKinds => available identifiers
  propBounds => {w,h,d} in default model units
Variants 'blue' and 'orange' affect the container. Other models retain source colours.
For solid cover, scale container/crate to the exact collider bounds. Industrial
buildings, tanks and equipment without colliders belong outside playable space.

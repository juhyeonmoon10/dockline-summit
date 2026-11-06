DOCKLINE character and weapon source models

Artist: Quaternius
Pack: Toon Shooter Game Kit, December 2022
License: Creative Commons Zero 1.0 Universal (CC0)
Official pack: https://quaternius.com/packs/toonshootergamekit.html
Official download folder: https://drive.google.com/drive/folders/1-BDs_EIyd6uiF2XuoyiZEcqnMQIJrE0C
License deed: https://creativecommons.org/publicdomain/zero/1.0/

AK.obj, Shotgun.obj, Sniper.obj and Pistol.obj (and matching MTLs) are the original
artist files. Run node art-source/toon-shooter/bake-guns.cjs from the repository
root after editing them. The tool rotates the muzzle toward -Z, scales to meters,
changes the receiver finish, separates magazines, and packs vertex data.
The build contains 1,128 / 1,264 / 1,441 / 990 triangles respectively.

Soldier.gltf is the editable artist character, trimmed to Idle_Shoot, Run_Gun,
Duck, Jump_Idle and Punch. Unused weapons and clips are removed. Skinning and authored
animation are preserved. Open it with Blender's glTF importer. After editing,
export a self-contained glTF and run node art-source/toon-shooter/bake-character.cjs.
The game changes helmet/uniform colors per team and scales the weapons.

The application has no remote model requests. Geometry is bundled locally.
Three.js GLTFLoader, SkeletonUtils and BufferGeometryUtils are from r160 under
the MIT license in dist/assets/three-LICENSE.txt.

The previous Kenney source files remain in art-source/blasters as an editable
legacy alternative; the active model is now this Quaternius pack.

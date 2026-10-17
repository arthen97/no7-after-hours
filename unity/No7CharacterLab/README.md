# No. 7 / Mira Unity character lab

Status: **source assets exported; editor import, compilation, animation playback and Web build have not run.** The public game still uses Three.js. This project is not evidence that clipping has been repaired.

## Prepared locally

- Original game Mira mesh, bind pose and weights exported with Blender to `Assets/Characters/Mira.fbx`; extracted textures beside it.
- Seven original donor motions: stand, sit, rise, wave, pour, sing and walk. Donor character meshes are not used as Mira.
- Explicit semantic Humanoid mapping: Meshy spine hierarchy `Spine02 → Spine01 → Spine` versus Mixamo `Spine → Spine1 → Spine2`. Walk also uses the Meshy mapping.
- Animator with crossfades, no arm/leg stretching, single CharacterController translation source and optional floor-contact IK.
- Orbit/zoom/focus-height camera and clip selection panel.

FBX, textures, Blender archives and editor caches stay local and are ignored by Git. This avoids adding experimental binary assets to the deployed game. Export provenance is in `production/unity-pilot/stages/*.json` at the repository root. Blender conversion scripts are in `production/unity-pilot/scripts/`; their source paths refer to the original local asset library.

## Run when an editor is available

1. Install Unity 6000.3.12f1 Apple Silicon and its Web Build Support module. Open this directory through Unity Hub.
2. Allow script compilation and asset imports to finish. Use **No7 → 1. Prepare Mira motion lab**. Invalid Humanoid mapping stops preparation with the source path.
3. Open the generated scene and enter Play mode. Review all seven motions from the front, side and back at normal speed, including their full transitions. Review joint shapes, wrists through dress, feet, root drift and seated contact. Compare foot IK on/off.
4. Repair source weights/rest poses or garment geometry where needed. Humanoid retargeting does not automatically fix combined body/garment self-intersections. The walking translation speed is a provisional 0.42 m/s and must be matched to the actual clip after playback review.
5. Only after that review use **No7 → 2. Build Web pilot**. Output is `Builds/WebPilot`; it is not yet integrated with the public game's UI, dialogue or audio.

## Storage limit

No editor downloaded. Official 6000.3.12f1 package response sizes: editor 5,096,613,414 bytes; Web module 1,610,619,494 bytes. Combined downloads alone: **6.71 GB**, excluding extraction, installed files and Library cache. A 5 GB additional-use budget cannot accommodate this route. The earlier 25 GB suggestion was working headroom, not a measured minimum.

Official release: https://unity.com/releases/editor/whats-new/6000.3.12f1

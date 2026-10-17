# S01 — preserved Mira interchange checkpoint

Status: export complete; no deformation repair, Unity import or playback performed.

The independent `.blend` checkpoint preserves the source Mira rig, mesh weights and material data; its `UNITY_STAGE_NOTES` text block records this purpose. FBX conversion preserves the existing bind rather than layering the browser's procedural rotations over it. Sidecar JSON records source SHA-256, hierarchy and output.

Observed hierarchy difference: Mira's lower-to-upper spine is Spine02 → Spine01 → Spine; six Mixamo donors use Spine → Spine1 → Spine2. The original walking donor uses the Mira convention. Unity source maps semantic bone roles explicitly for each hierarchy.

No geometry, weights or animation range was reduced to hide a failure. Body and dress remain combined; clothing collision is unresolved. Next stage must be an actual Unity Humanoid import and complete motion review, then source repairs based on observed artifacts. A 5 GB installation budget currently prevents the editor/Web installation.

"""Add the original Meshy walk donor without overwriting the Mira checkpoint."""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[3]
source=Path('/Users/arthen01/worlds-slg-demo/public/assets/mira-walk.glb')
dest=ROOT/'unity/No7CharacterLab/Assets/Motions/walk.fbx'
if dest.exists():raise RuntimeError('Refusing to overwrite walk export')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
frames=[a.frame_range for a in bpy.data.actions]
bpy.context.scene.frame_start=int(min(x[0] for x in frames))
bpy.context.scene.frame_end=int(max(x[1] for x in frames))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(dest),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,use_armature_deform_only=True,bake_anim=True,bake_anim_use_all_actions=True,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0.0,path_mode='AUTO',axis_forward='-Z',axis_up='Y')
report={'source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':str(dest.relative_to(ROOT)),'skeleton':'Meshy: Hips > Spine02 > Spine01 > Spine','use':'Animation donor only, retarget to Mira Avatar','status':'exported_not_engine_validated'}
(ROOT/'production/unity-pilot/stages/S01_walk_interchange_v001.json').write_text(json.dumps(report,indent=2))

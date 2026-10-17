"""Export preserved source rigs through Blender's FBX exporter; no runtime retarget math."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/arthen01/no7-after-hours')
OUT=ROOT/'unity/No7CharacterLab/Assets'
SOURCE=Path('/Users/arthen01/worlds-slg-demo/production/host-v41/library')
REPORT={'stage':'S01_unity_interchange','status':'exported_not_engine_validated','changes':['Export source skeleton and bind weights to FBX. Preserve textures and source proportions.','No Three.js retargeted rotation tracks are imported into this experiment.'],'assets':[],'unity_import':'not_run','deformation_repair':'not_run','unresolved':['Combined body/garment mesh; no separate cloth surface.','Unity Humanoid mapping and T-pose need editor import.','Full motion and collision review not run.']}

def export(src,dest,animated):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(src))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
 for rig in rigs:
  if not animated:rig.animation_data_clear()
 if not animated:
  for action in list(bpy.data.actions):bpy.data.actions.remove(action)
 # Keep the existing bind; normalizing or posing bones here would change skinning.
 points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 report={'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'fbx':str(dest.relative_to(ROOT)),'meshes':len(meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes),'bones':[b.name for a in rigs for b in a.data.bones],'scale':[list(a.scale) for a in rigs],'height_m':max(p.z for p in points)-min(p.z for p in points),'actions':[a.name for a in bpy.data.actions]}
 if animated:
  frames=[a.frame_range for a in bpy.data.actions]
  if frames:bpy.context.scene.frame_start=int(min(x[0] for x in frames));bpy.context.scene.frame_end=int(max(x[1] for x in frames))
 else:
  tex=dest.parent/'Textures';tex.mkdir(parents=True,exist_ok=True)
  for image in bpy.data.images:
   if image.type=='IMAGE' and image.size[0]:
    image.filepath_raw=str(tex/(image.name.replace('/','_')+'.png'));image.file_format='PNG';image.save()
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.fbx(filepath=str(dest),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,use_armature_deform_only=True,bake_anim=animated,bake_anim_use_all_actions=animated,bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0.0,path_mode='COPY',embed_textures=not animated,axis_forward='-Z',axis_up='Y')
 REPORT['assets'].append(report)
 if not animated:
  notes=bpy.data.texts.new('UNITY_STAGE_NOTES');notes.write('Preserved Mira source, FBX export checkpoint. Not a deformation repair. Unity import and Humanoid Avatar pending. Clothing is not independently simulated.')
  bpy.context.scene['asset_id']='no7-mira-unity-pilot';bpy.context.scene['stage_id']='S01_unity_interchange'
  checkpoint=ROOT/'production/unity-pilot/stages/S01_mira_interchange_v001.blend'
  if checkpoint.exists():raise RuntimeError('Refusing to overwrite stage checkpoint')
  bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
export(ROOT/'public/assets/hosts/mira.glb',OUT/'Characters/Mira.fbx',False)
for name in ['stand','sit','rise','wave','pour','sing']:
 export(SOURCE/f'm2mr-{name}/mixamo_character.glb',OUT/f'Motions/{name}.fbx',True)
(ROOT/'production/unity-pilot/stages/S01_mira_interchange_v001.json').write_text(json.dumps(REPORT,indent=2))
print('UNITY_INTERCHANGE_EXPORT_COMPLETE')

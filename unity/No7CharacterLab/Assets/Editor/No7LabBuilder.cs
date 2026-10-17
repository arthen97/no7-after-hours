using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;

// Explicit semantic mapping: Mira's Spine02 -> Spine01 -> Spine hierarchy is
// named in the opposite order to the donor's Spine -> Spine1 -> Spine2 hierarchy.
public static class No7LabBuilder
{
    static readonly string[] Motions = { "stand", "sit", "rise", "wave", "pour", "sing", "walk" };
    static readonly Dictionary<string, string> Common = new Dictionary<string, string> {
        {"Hips","Hips"},{"Head","Head"},
        {"LeftShoulder","LeftShoulder"},{"LeftUpperArm","LeftArm"},{"LeftLowerArm","LeftForeArm"},{"LeftHand","LeftHand"},
        {"RightShoulder","RightShoulder"},{"RightUpperArm","RightArm"},{"RightLowerArm","RightForeArm"},{"RightHand","RightHand"},
        {"LeftUpperLeg","LeftUpLeg"},{"LeftLowerLeg","LeftLeg"},{"LeftFoot","LeftFoot"},{"LeftToes","LeftToeBase"},
        {"RightUpperLeg","RightUpLeg"},{"RightLowerLeg","RightLeg"},{"RightFoot","RightFoot"},{"RightToes","RightToeBase"}
    };
    static string Bare(string name) => name.Substring(name.LastIndexOf(':') + 1);
    static Avatar ImportHuman(string path, bool mira)
    {
        var source = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if (!source) throw new InvalidOperationException("Missing exported source: " + path);
        var transforms = source.GetComponentsInChildren<Transform>(true);
        var meshy = transforms.Any(t => Bare(t.name) == "Spine02");
        var mapping = new Dictionary<string,string>(Common);
        mapping["Spine"] = meshy ? "Spine02" : "Spine";
        mapping["Chest"] = meshy ? "Spine01" : "Spine1";
        mapping["UpperChest"] = meshy ? "Spine" : "Spine2";
        mapping["Neck"] = meshy ? "neck" : "Neck";
        var human = new List<HumanBone>();
        foreach (var pair in mapping)
        {
            var bone = transforms.FirstOrDefault(t => Bare(t.name) == pair.Value);
            if (bone) human.Add(new HumanBone { humanName = pair.Key, boneName = bone.name, limit = new HumanLimit { useDefaultValues = true } });
        }
        var description = new HumanDescription {
            human = human.ToArray(),
            skeleton = transforms.Select(t => new SkeletonBone { name = t.name, position = t.localPosition, rotation = t.localRotation, scale = t.localScale }).ToArray(),
            upperArmTwist = .5f, lowerArmTwist = .5f, upperLegTwist = .5f, lowerLegTwist = .5f,
            armStretch = 0, legStretch = 0, feetSpacing = 0, hasTranslationDoF = false
        };
        var importer = (ModelImporter)AssetImporter.GetAtPath(path);
        importer.animationType = ModelImporterAnimationType.Human;
        importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
        importer.humanDescription = description;
        importer.optimizeGameObjects = false;
        importer.animationCompression = ModelImporterAnimationCompression.Off;
        importer.importAnimation = !mira;
        if (!mira)
        {
            var clips = importer.defaultClipAnimations;
            foreach (var clip in clips)
            {
                clip.name = Path.GetFileNameWithoutExtension(path);
                clip.loopTime = clip.name == "stand" || clip.name == "walk";
                clip.loopPose = clip.loopTime;
                clip.lockRootRotation = true;
                clip.lockRootPositionXZ = true;
                clip.lockRootHeightY = true;
                clip.keepOriginalPositionY = true;
            }
            importer.clipAnimations = clips;
        }
        importer.SaveAndReimport();
        var avatar = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Avatar>().FirstOrDefault();
        if (!avatar || !avatar.isValid || !avatar.isHuman)
            throw new InvalidOperationException("Avatar mapping needs review in Rig > Configure: " + path);
        return avatar;
    }
    [MenuItem("No7/1. Prepare Mira motion lab")]
    public static void Prepare()
    {
        var scenePath = "Assets/Scenes/MiraMotionLab.unity";
        if (File.Exists(scenePath)) throw new InvalidOperationException("Lab already exists. Open its scene; preserve edits before creating a new revision.");
        AssetDatabase.Refresh();
        var avatar = ImportHuman("Assets/Characters/Mira.fbx", true);
        var clips = new List<AnimationClip>();
        foreach (var name in Motions)
        {
            var path = "Assets/Motions/" + name + ".fbx";
            if (!File.Exists(path)) continue;
            ImportHuman(path, false);
            var clip = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().FirstOrDefault(c => !c.name.StartsWith("__preview__"));
            if (!clip || !clip.humanMotion) throw new InvalidOperationException("Humanoid clip unavailable: " + name);
            clips.Add(clip);
        }
        Directory.CreateDirectory("Assets/Generated"); Directory.CreateDirectory("Assets/Scenes"); AssetDatabase.Refresh();
        var controller = AnimatorController.CreateAnimatorControllerAtPath("Assets/Generated/Mira.controller");
        var layers = controller.layers; layers[0].iKPass = true; controller.layers = layers;
        foreach (var clip in clips) { var state = controller.layers[0].stateMachine.AddState(clip.name); state.motion = clip; state.iKOnFeet = false; }
        controller.layers[0].stateMachine.defaultState = controller.layers[0].stateMachine.states.First(s => s.state.name == "stand").state;
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var actor = new GameObject("MiraActor");
        var rig = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Characters/Mira.fbx"));
        rig.transform.SetParent(actor.transform, false);
        var animator = rig.GetComponent<Animator>() ?? rig.AddComponent<Animator>();
        animator.avatar = avatar; animator.runtimeAnimatorController = controller; animator.applyRootMotion = false; animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
        var body = actor.AddComponent<CharacterController>(); body.height = 1.8f; body.radius = .24f; body.center = new Vector3(0,.9f,0); body.stepOffset=.15f;
        // Uniform scene sizing is separate from bind matrices and bone scales.
        var renderers = rig.GetComponentsInChildren<SkinnedMeshRenderer>();
        if (renderers.Length > 0) { var bounds = renderers[0].bounds; foreach (var r in renderers) bounds.Encapsulate(r.bounds); if(bounds.size.y > .1f) rig.transform.localScale *= 1.75f / bounds.size.y; }
        var lab = rig.AddComponent<No7CharacterLab>(); lab.actor = body; lab.animator = animator; lab.clipNames = clips.Select(c => c.name).ToArray();
        var floor = GameObject.CreatePrimitive(PrimitiveType.Plane); floor.name = "Contact floor"; floor.transform.localScale=Vector3.one;
        var floorMaterial = new Material(Shader.Find("Standard")); floorMaterial.color = new Color(.08f,.025f,.04f); floor.GetComponent<Renderer>().sharedMaterial=floorMaterial;
        AssetDatabase.CreateAsset(floorMaterial,"Assets/Generated/Floor.mat");
        var camera = new GameObject("Main Camera").AddComponent<Camera>(); camera.tag="MainCamera"; camera.nearClipPlane=.05f; camera.farClipPlane=30; camera.backgroundColor=new Color(.08f,.025f,.04f); camera.clearFlags=CameraClearFlags.SolidColor;
        camera.transform.position=new Vector3(0,1.2f,3.1f);camera.transform.LookAt(new Vector3(0,1,0));camera.gameObject.AddComponent<AudioListener>();
        var orbit = camera.gameObject.AddComponent<No7LabCamera>();orbit.target=actor.transform;
        var light = new GameObject("Key light").AddComponent<Light>();light.type=LightType.Directional;light.intensity=1.2f;light.transform.rotation=Quaternion.Euler(30,-25,0);
        RenderSettings.ambientLight=new Color(.32f,.27f,.3f);
        EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),scenePath);AssetDatabase.SaveAssets();
        Debug.Log("No7 scene created. Avatar validity is only a structural check; visually review every clip before claiming deformation is fixed.");
    }
    [MenuItem("No7/2. Build Web pilot")]
    public static void BuildWeb()
    {
        if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL,BuildTarget.WebGL)) throw new InvalidOperationException("Install Web Build Support in Unity Hub first.");
        if (!File.Exists("Assets/Scenes/MiraMotionLab.unity")) throw new InvalidOperationException("Prepare the lab first.");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes=new[]{"Assets/Scenes/MiraMotionLab.unity"}, locationPathName="Builds/WebPilot", target=BuildTarget.WebGL, options=BuildOptions.None });
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) throw new InvalidOperationException("Web build did not succeed.");
    }
}

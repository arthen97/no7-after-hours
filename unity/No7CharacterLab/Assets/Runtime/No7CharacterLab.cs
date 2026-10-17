using UnityEngine;

// Experimental character harness. No procedural rotations or bone scaling are layered
// over the Humanoid pose; the Avatar has arm/leg stretching disabled at import.
public sealed class No7CharacterLab : MonoBehaviour
{
    public Animator animator;
    public CharacterController actor;
    public string[] clipNames;
    public bool footContact = true;
    [Range(.25f,1.5f)] public float playback = 1;
    string selected = "stand";
    float elapsed;
    Vector3 walkStart;
    public void Play(string clip)
    {
        if (!animator || !animator.isHuman || !animator.HasState(0,Animator.StringToHash(clip))) return;
        selected=clip; walkStart=actor.transform.position;elapsed=0;animator.CrossFadeInFixedTime(clip,.25f,0);
    }
    void Update()
    {
        if (!animator) return;
        animator.speed=playback;elapsed+=Time.deltaTime*playback;
        // Stop at the end of a two-metre preview corridor; no synthetic turn pose.
        // Root translation is driven once, via CharacterController, only for the walk clip.
        if (selected=="walk" && actor) {
            actor.Move(actor.transform.forward * (.42f*Time.deltaTime*playback));
            if (Vector3.Distance(actor.transform.position,walkStart)>=2) Play("stand");
        }
    }
    void OnAnimatorIK(int layer)
    {
        if (!animator || !animator.isHuman) return;
        SolveFoot(AvatarIKGoal.LeftFoot,HumanBodyBones.LeftFoot,animator.leftFeetBottomHeight);
        SolveFoot(AvatarIKGoal.RightFoot,HumanBodyBones.RightFoot,animator.rightFeetBottomHeight);
    }
    void SolveFoot(AvatarIKGoal goal,HumanBodyBones boneId,float sole)
    {
        animator.SetIKPositionWeight(goal,0); animator.SetIKRotationWeight(goal,0);
        if (!footContact) return;
        var bone=animator.GetBoneTransform(boneId);if(!bone)return;
        // Only the floor is solved; character colliders are excluded by testing downward
        // from the current sole and ignoring hits inside this actor's hierarchy.
        var hits=Physics.RaycastAll(bone.position+Vector3.up*.20f,Vector3.down,.5f);
        RaycastHit? floor=null;
        foreach(var h in hits)if(!h.transform.IsChildOf(actor.transform)&&(!floor.HasValue||h.distance<floor.Value.distance))floor=h;
        if(!floor.HasValue)return;
        var target=floor.Value.point+Vector3.up*sole;
        var gap=bone.position.y-target.y;
        var weight=1-Mathf.InverseLerp(.025f,.11f,Mathf.Max(0,gap));
        animator.SetIKPositionWeight(goal,weight);animator.SetIKPosition(goal,new Vector3(bone.position.x,Mathf.Max(target.y,bone.position.y-.06f),bone.position.z));
    }
    void OnGUI()
    {
        GUILayout.BeginArea(new Rect(16,16,290,Screen.height-32),GUI.skin.box);
        GUILayout.Label("NO.7 / UNITY CHARACTER LAB");
        GUILayout.Label("Mira — Humanoid retarget pilot");
        GUILayout.Label("Not yet approved for the public game");
        if(clipNames!=null)foreach(var clip in clipNames)if(GUILayout.Button(clip,GUILayout.Height(30)))Play(clip);
        GUILayout.Label("Playback " + playback.ToString("F2") + "×");playback=GUILayout.HorizontalSlider(playback,.25f,1.5f);
        footContact=GUILayout.Toggle(footContact,"Foot contact IK");
        if(GUILayout.Button("Reset position")){actor.enabled=false;actor.transform.position=Vector3.zero;actor.enabled=true;Play("stand");}
        GUILayout.Label("Left-drag: orbit / wheel: zoom\nRight-drag: focus height");
        GUILayout.Label("Clip: " + selected + " / " + elapsed.ToString("F1") + "s");
        GUILayout.EndArea();
    }
}

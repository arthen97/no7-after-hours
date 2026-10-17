using UnityEngine;
public sealed class No7LabCamera : MonoBehaviour
{
    public Transform target;
    float yaw=0,pitch=8,distance=3.1f,height=1;
    void LateUpdate()
    {
        if(!target)return;
        if(Input.mousePosition.x>320){
            if(Input.GetMouseButton(0)){yaw+=Input.GetAxis("Mouse X")*3;pitch-=Input.GetAxis("Mouse Y")*3;}
            if(Input.GetMouseButton(1))height=Mathf.Clamp(height-Input.GetAxis("Mouse Y")*.03f,.12f,1.95f);
            distance=Mathf.Clamp(distance-Input.mouseScrollDelta.y*.15f,.5f,5);
        }
        pitch=Mathf.Clamp(pitch,-65,70);
        var focus=target.position+Vector3.up*height;
        transform.position=focus+Quaternion.Euler(pitch,yaw,0)*Vector3.forward*distance;
        transform.LookAt(focus);
    }
}

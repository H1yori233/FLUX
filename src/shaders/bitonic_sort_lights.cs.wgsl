@id(0) override kStep : u32;
@id(1) override kStage : u32;

@group(${bindGroup_scene}) @binding(0) var<storage, read_write> lightSet: LightSet;

@compute @workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let lightIdx = global_id.x;

    // Only threads with lightIdx < numLights / 2 participate,
    // since each compares one pair of lights
    if (lightIdx >= lightSet.numLights / 2u) {
        return;
    }

    let step = kStep;
    let stage = kStage;
    let direction = select(0u, 1u, (step & 1u) == 1u);
    
    // Compute the distance between elements to compare in this stage:
    //   pairDistance = 2^(step - stage - 1)
    let pairDistance = 1u << (step - stage - 1u);
    let blockSize = 2u * pairDistance;
    
    let left = ((lightIdx / pairDistance) * blockSize) + (lightIdx % pairDistance);
    let right = left + pairDistance;
    
    // If right index is out of bounds, skip this thread
    if (right >= lightSet.numLights) {
        return;
    }
    
    let leftZ = lightSet.lights[left].pos.z;
    let rightZ = lightSet.lights[right].pos.z;

    let swap = (leftZ > rightZ) == (direction == 1u);
    
    // swap lights
    if (swap) {
        let tempPos = lightSet.lights[left].pos;
        let tempColor = lightSet.lights[left].color;
        
        lightSet.lights[left].pos = lightSet.lights[right].pos;
        lightSet.lights[left].color = lightSet.lights[right].color;
        
        lightSet.lights[right].pos = tempPos;
        lightSet.lights[right].color = tempColor;
    }
}
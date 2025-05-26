@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> zBin: ZBin;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let binIdx = global_id.x;

    if (binIdx >= ${numClustersZ}) {
        return;
    }

    // Calculate the depth range for the current bin
    let zNear = f32(${nearPlane});
    let zFar = f32(${farPlane});
    let binZNear = zNear * pow(zFar / zNear, f32(binIdx) / ${numClustersZ});
    let binZFar = zNear * pow(zFar / zNear, (f32(binIdx) + 1.0) / ${numClustersZ});

    // Find the first and last light index in the current bin
    var startIdx = 0u;
    var endIdx = lightSet.numLights;
    for(var i = 0u; i < lightSet.numLights; i++) {
        let depth = -lightSet.lights[i].pos.z;
        if(depth >= binZNear) {
            startIdx = i;
            break;
        }
    }

    for(var i = lightSet.numLights - 1u; i >= 0u; i--) {
        let depth = -lightSet.lights[i].pos.z;
        if(depth < binZFar) {
            endIdx = i;
            break;
        }
    }
    
    // Store the start and end indices in the current bin
    zBin.bins[binIdx] = packBounds(startIdx, endIdx);
}
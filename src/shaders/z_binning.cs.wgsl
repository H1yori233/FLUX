@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> zBin: ZBin;

fn binarySearchLowerBound(depth: f32) -> u32 {
    var left = 0u;
    var right = lightSet.numLights;
    
    while (left < right) {
        let mid = (left + right) / 2u;
        let lightPos = lightSet.lights[mid].pos;
        if (-lightPos.z < depth) {
            left = mid + 1u;
        } else {
            right = mid;
        }
    }   
    return left;
}

fn binarySearchUpperBound(depth: f32) -> u32 {
    var left = 0u;
    var right = lightSet.numLights;
    
    while (left < right) {
        let mid = (left + right) / 2u;
        let lightPos = lightSet.lights[mid].pos;
        if (-lightPos.z <= depth) {
            left = mid + 1u;
        } else {
            right = mid;
        }
    }
    
    return left;
}

// put start and end indices into a single u32
fn packBounds(startIdx: u32, endIdx: u32) -> u32 {
    return (startIdx << 16u) | (endIdx & 0xFFFFu);
}

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
    let startIdx = binarySearchLowerBound(binZNear);
    let endIdx = binarySearchUpperBound(binZFar);

    // Store the start and end indices in the current bin
    zBin.bins[binIdx] = packBounds(startIdx, endIdx);
    // zBin.bins[binIdx] = packBounds(0u, lightSet.numLights);
}
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> zBinSet: ZBinSet;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let binIdx = global_id.x;

    if (binIdx >= ${numZBins}) {
        return;
    }

    // Clear the current bin
    zBinSet.bins[binIdx].numLights = 0u;

    // Calculate the depth range for the current bin
    let zNear = cameraUniforms.zNear;
    let zFar = cameraUniforms.zFar;
    let binStart = f32(binIdx) / f32(${numZBins});
    let binEnd = f32(binIdx + 1u) / f32(${numZBins});
    let binZNear = -zNear - binStart * (zFar - zNear);
    let binZFar = -zNear - binEnd * (zFar - zNear);

    // Iterate through all lights
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightPos = lightSet.lights[lightIdx].pos;
        let lightViewPos = (cameraUniforms.viewMat * vec4(lightPos, 1.0)).xyz;
        let lightViewZ = lightViewPos.z;
        
        // Consider the influence of the light radius
        let radius = f32(${lightRadius});
        let lightZNear = lightViewZ - radius;
        let lightZFar = lightViewZ + radius;
        
        // Check if the light is in the current bin
        if (lightZNear <= binZNear && lightZFar >= binZFar) {
            let currentNumLights = zBinSet.bins[binIdx].numLights;
            if (currentNumLights < ${maxNumLights}) {
                zBinSet.bins[binIdx].lightIndices[currentNumLights] = lightIdx;
                zBinSet.bins[binIdx].numLights = currentNumLights + 1u;
            }
        }
    }
}
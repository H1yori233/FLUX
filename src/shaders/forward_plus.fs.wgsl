// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragCoord: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}


// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster's data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment's position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment's diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

fn calculateClusterIndex(fragPos: vec3f) -> u32 {
    let posNDC = camera.viewProjMat * vec4f(fragPos, 1.0);
    let normalizedPos = posNDC.xyz / posNDC.w;
    
    let x = u32((normalizedPos.x + 1.0) * 0.5 * f32(${numClustersX}));
    let y = u32((normalizedPos.y + 1.0) * 0.5 * f32(${numClustersY}));
    
    let posView = camera.viewMat * vec4f(fragPos, 1.0);
    let viewZ = -posView.z;
    let z = u32(log(viewZ / camera.nearZ) / 
            log(camera.farZ / camera.nearZ) * 
            f32(${numClustersZ}));
    
    return x + 
           y * ${numClustersX} + 
           z * ${numClustersY} * ${numClustersX};
}

fn getNumLightDebugColor(cluster : Cluster) -> vec3f {
    let lightCount = f32(cluster.numLights) / ${maxNumLights}; // normalized
    return vec3f(lightCount, lightCount, lightCount);
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // let id = calculateClusterIndex(in.fragCoord);
    let id = calculateClusterIndex(in.pos);
    if (id >= ${numClustersX} * ${numClustersY} * ${numClustersZ}) {
        return vec4(1.0, 0.0, 1.0, 1.0);
    }
    let cluster = clusterSet.clusters[id];
    
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.numLights; i++) {
        let lightIdx = cluster.lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    // var finalColor = diffuseColor.rgb * totalLightContrib;
    // var finalColor = getDepthDebugColor(in.pos);
    // var finalColor =  getClusterDebugColor(id);
    var finalColor = getNumLightDebugColor(cluster);
    // let a = f32(id) / 24 / ${maxNumLights};
    // var finalColor = vec3f(a, a, a);
    return vec4(finalColor, 1);
}

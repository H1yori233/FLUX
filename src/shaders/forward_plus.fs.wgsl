// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterParams: ClusterParams;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}


// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

fn calculateClusterIndex(fragPos: vec3f) -> u32 {
    // Convert in.pos to NDC (-1, 1)
    let screenPos  = camera.viewProjMat * vec4f(fragPos, 1.0);
    let posNDC = screenPos .xyz / screenPos .w;

    // Get Index: from (-1, 1) to (0, number)
    let xCluster    = u32((posNDC.x * 0.5 + 0.5) * f32(clusterParams.numClustersX));
    let yCluster    = u32((1.0 - (posNDC.y * 0.5 + 0.5)) * f32(clusterParams.numClustersY));
    let zDist       = length(fragPos);
    let zCluster    = u32(log(zDist / clusterParams.nearZ) / 
                      log(clusterParams.farZ / clusterParams.nearZ) * 
                      f32(clusterParams.numClustersZ));

    let x = min(xCluster, clusterParams.numClustersX - 1u);
    let y = min(yCluster, clusterParams.numClustersY - 1u);
    let z = min(zCluster, clusterParams.numClustersZ - 1u);

    return x +
           y * clusterParams.numClustersX +
           z * clusterParams.numClustersX * clusterParams.numClustersY; 
}

fn getClusterDebugColor(id: u32) -> vec3f {
    let x = (id * 13) % 255;
    let y = (id * 47) % 255;
    let z = (id * 101) % 255;
    return vec3f(f32(x) / 255.0, f32(y) / 255.0, f32(z) / 255.0);
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let id = calculateClusterIndex(in.pos);
    let cluster = clusterSet.clusters[id];
    
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.numLights; i++) {
        let lightIdx = cluster.lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;

    // var depth = length(in.pos);
    // var normalizedDepth = depth / 30.0f;
    // var finalColor = vec3f(normalizedDepth);

    // let lightCount = f32(cluster.numLights) / 32.0; // 归一化
    // var finalColor = vec3f(lightCount, 0.0, 0.0);
    // var finalColor =  getClusterDebugColor(id);

    return vec4(finalColor, 1);
}

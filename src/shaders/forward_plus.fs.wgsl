// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

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
    let screenPos   = camera.viewProjMat * vec4f(fragPos, 1.0);
    let posNDC      = screenPos.xyz / screenPos.w;
    let posView     = camera.viewMat * vec4<f32>(fragPos, 1.0);
    let zDist       = posView.z;

    // Get Index: from (-1, 1) to (0, number)
    let xCluster    = u32((posNDC.x * 0.5 + 0.5) * f32(${numClustersX}));
    let yCluster    = u32((1.0 - (posNDC.y * 0.5 + 0.5)) * f32(${numClustersY}));
    let zCluster    = u32(log(zDist / camera.nearZ) / 
                      log(camera.farZ / camera.nearZ) * 
                      f32(${numClustersZ}));

    let x = min(xCluster, ${numClustersX} - 1u);
    let y = min(yCluster, ${numClustersY} - 1u);
    let z = min(zCluster, ${numClustersZ} - 1u);

    return x +
           y * ${numClustersX} +
           z * ${numClustersX} * ${numClustersY};
}

fn getNumLightDebugColor(cluster : Cluster) -> vec3f {
    let lightCount = f32(cluster.numLights) / ${maxNumLights}; // normalized
    return vec3f(lightCount, 0.0, 0.0);
}

fn getTile(fragPos: vec3f) -> vec3u {
    // 与compute shader一致的簇计算
    let screenPos = camera.viewProjMat * vec4f(fragPos, 1.0);
    let ndc = screenPos.xyz / screenPos.w;
    
    return vec3u(
        u32((ndc.x * 0.5 + 0.5) * f32(${numClustersX})),
        u32((1.0 - (ndc.y * 0.5 + 0.5)) * f32(${numClustersY})),
        u32(log((camera.viewMat * vec4f(fragPos, 1.0)).z / camera.nearZ) / 
            log(camera.farZ / camera.nearZ) * 
            f32(${numClustersZ}))
    );
}

fn getTileColor(fragPos: vec3f) -> vec3f {
    let tile = getTile(fragPos);
    return vec3f(
        f32(tile.x) / f32(${numClustersX}),
        f32(tile.y) / f32(${numClustersY}),
        f32(tile.z) / f32(${numClustersZ})
    );
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

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
    // var finalColor = getTileColor(in.pos);
    // var finalColor =  getClusterDebugColor(id);
    var finalColor = getNumLightDebugColor(cluster);
    return vec4(finalColor, 1);
}

// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var positionTexture: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(1) var normalTexture: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(2) var albedoTexture: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(3) var textureSampler: sampler;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

fn calculateClusterIndex(fragPos: vec3f) -> u32 {
    var posView = camera.viewMat * vec4f(fragPos, 1.0);
    var posNDC  = camera.viewProjMat * vec4f(fragPos, 1.0);
    posNDC = posNDC / posNDC.w;
    
    let x = u32((posNDC.x + 1.0) * 0.5 * f32(${numClustersX}));
    let y = u32((1.0 - posNDC.y) * 0.5 * f32(${numClustersY}));
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
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let position = textureSample(positionTexture, textureSampler, texCoord).xyz;
    let normal = normalize(textureSample(normalTexture, textureSampler, texCoord).xyz);
    let albedo = textureSample(albedoTexture, textureSampler, texCoord);
    
    if (albedo.a < 0.5) {
        discard;
    }

    let id = calculateClusterIndex(position);
    if (id >= ${numClustersX} * ${numClustersY} * ${numClustersZ}) {
        return vec4(1.0, 0.0, 1.0, 1.0);
    }
    let cluster = clusterSet.clusters[id];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.numLights; i++) {
        let lightIdx = cluster.lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position, normal);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    // finalColor = albedo.rgb;
    // var finalColor = getNumLightDebugColor(cluster);
    return vec4(finalColor, 1.0);
}

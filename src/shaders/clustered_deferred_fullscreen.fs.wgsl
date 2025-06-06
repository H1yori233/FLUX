// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
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

fn getClusterIndex(viewPos: vec3f, fragPos: vec4f) -> u32 {
    let tileSizePx = cameraUniforms.screenDimensions.xy / 
                     vec2(${numClustersX}, ${numClustersY});
    let clusterX = clamp(u32(floor(fragPos.x / tileSizePx.x)), 0u, ${numClustersX} - 1u);
    let clusterY = clamp(u32(floor(fragPos.y / tileSizePx.y)), 0u, ${numClustersY} - 1u);

    let clusterZ = getZIndex(-viewPos.z);
    return clusterX + 
           clusterY * ${numClustersX} + 
           clusterZ * ${numClustersX} * ${numClustersY};
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

    let index = (getClusterIndex(position, in.fragCoord));
    let cluster_ptr = &clusterSet.clusters[index];
    
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster_ptr).numLights; i++) {
        let lightIdx = (*cluster_ptr).lightIndices[i];
        let light_ptr = &lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(*light_ptr, position, normal);
    }

    let finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var packTexture: texture_2d<u32>;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

fn reconstructViewPosition(uv: vec2f, depth: f32) -> vec3f {
    let clip = vec4f(vec2f(uv.x, 1.0 - uv.y) * 2.0 - 1.0, depth, 1.0);
    let viewSpacePos = cameraUniforms.invProjMat * clip;
    return viewSpacePos.xyz / viewSpacePos.w;
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
    let pack = textureLoad(packTexture, vec2i(in.fragPos.xy), 0);

    let normal = decodeNormal(unpack2x16snorm(pack.x));
    let DR = unpack2x16snorm(pack.y);
    let GB = unpack2x16snorm(pack.z);
    let depth = DR.x;
    let albedo = vec3f(DR.y, GB.x, GB.y);
    let position = reconstructViewPosition(texCoord, depth);
    
    let index = (getClusterIndex(position, in.fragPos));
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
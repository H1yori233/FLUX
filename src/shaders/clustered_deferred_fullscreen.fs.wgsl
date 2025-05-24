// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var packTexture: texture_2d<u32>;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

fn decodeNormal(encoded: vec2f) -> vec3f {
    // |X'| + |Y'| + |Z'| = 1 -> p.z = 1 - |p.x| - |p.y|
    let n = vec3f(encoded.x, encoded.y, 1.0 - abs(encoded.x) - abs(encoded.y));
    let t = max(-n.z, 0.0);

    var result = n;
    if (n.x >= 0.0) {
        result.x -= t;
    } else {
        result.x += t;
    }
    
    if (n.y >= 0.0) {
        result.y -= t;
    } else {
        result.y += t;
    }
    return normalize(result);
}

fn reconstructWorldPosition(uv: vec2f, depth: f32) -> vec3f {
    let clip = vec4f(vec2f(uv.x, 1.0 - uv.y) * 2.0 - 1.0, depth, 1.0);
    let worldSpacePos = cameraUniforms.invViewProjMat * clip;
    return worldSpacePos.xyz / worldSpacePos.w;
}

fn getClusterIndex(pos: vec3f, fragPos: vec4f) -> u32 {
    let tileSizePx = cameraUniforms.screenDimensions.xy / 
                     vec2(${numClustersX}, ${numClustersY});
    let clusterX = clamp(u32(floor(fragPos.x / tileSizePx.x)), 0u, ${numClustersX} - 1u);
    let clusterY = clamp(u32(floor(fragPos.y / tileSizePx.y)), 0u, ${numClustersY} - 1u);

    let viewPos = cameraUniforms.viewMat * vec4(pos, 1.0);
    let zNear = cameraUniforms.zNear;
    let zFar  = cameraUniforms.zFar;
    let sliceF = log(-viewPos.z / zNear) / log(zFar / zNear) *
                 f32(${numClustersZ});
    let clusterZ = clamp(u32(sliceF), 0u, ${numClustersZ} - 1u);
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
    let position = reconstructWorldPosition(texCoord, depth);
    
    let index = (getClusterIndex(position, in.fragPos));
    var totalLightContrib = vec3f(0, 0, 0);
    let cluster = clusterSet.clusters[index];
    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, position, normal);
    }

    let finalColor = albedo.rgb * totalLightContrib;

    return vec4(finalColor, 1.0);
}
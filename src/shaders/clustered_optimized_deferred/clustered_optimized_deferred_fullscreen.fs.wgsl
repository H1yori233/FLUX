// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var packTexture: texture_2d<u32>;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

fn reconstructWorldPosition(uv: vec2f, depth: f32) -> vec3f {
    let clipSpacePos = vec4f(uv * 2.0 - 1.0, depth, 1.0);
    let worldSpacePos = camera.invViewProjMat * clipSpacePos;
    return worldSpacePos.xyz / worldSpacePos.w;
}

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
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let pack = textureLoad(packTexture, vec2i(in.fragCoord.xy), 0);
    
    let normal = decodeNormal(unpack2x16snorm(pack.x));
    let DR = unpack2x16snorm(pack.y);
    let GB = unpack2x16snorm(pack.z);
    let depth = DR.x;
    let albedo = vec3f(DR.y, GB.x, GB.y);
    let position = reconstructWorldPosition(texCoord, depth);

    let id = calculateClusterIndex(position);
    if (id >= ${numClustersX} * ${numClustersY} * ${numClustersZ}) {
        return vec4(1.0, 0.0, 1.0, 1.0);
    }
    let cluster = clusterSet.clusters[id];
    
    // var totalLightContrib = vec3f(0, 0, 0);
    // for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
    //     let light = lightSet.lights[lightIdx];
    //     totalLightContrib += calculateLightContrib(light, position, normalize(normal));
    // }
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < cluster.numLights; i++) {
        let lightIdx = cluster.lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position, normalize(normal));
    }

    // let finalColor = albedo.rgb * totalLightContrib;
    // let finalColor = albedo.rgb;
    var finalColor = getNumLightDebugColor(cluster);
    return vec4(finalColor, 1.0);
}

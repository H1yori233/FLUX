// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    invViewProjMat: mat4x4f,

    // camera info
    screenDimensions: vec2f,
    zNear: f32,
    zFar: f32
}

struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxNumLights}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct ZBin {
    bins: array<u32, ${numClustersZ}>
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posView: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posView;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

fn getZIndex(depth: f32) -> u32 {
    let zNear = f32(${nearPlane});
    let zFar  = f32(${farPlane});
    let sliceF = log(depth / zNear) / log(zFar / zNear) *
                 f32(${numClustersZ});
    let clusterZ = clamp(u32(sliceF), 0u, ${numClustersZ} - 1u);
    return clusterZ;
}

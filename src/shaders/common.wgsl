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

// octahedron normal encoding
fn encodeNormal(normal: vec3f) -> vec2f {
    // project positions in the sphere onto a octahedron (which |X'| + |Y'| + |Z'| = 1)
    let p = normal.xy / (abs(normal.x) + abs(normal.y) + abs(normal.z));
    var x: f32;
    var y: f32;
    
    // X^2 + Y^2 + Z^2 = 1 -> we can only store X and Y, but need SIGN of Z    
    if (normal.z < 0.0) {
        // |p'.x| = |p.x| + |p.z| = |p.x| - p.z
        if (p.x >= 0.0) {
            x = (1.0 - abs(p.y));
        } else {
            x = -(1.0 - abs(p.y));
        }
        
        // |p'.y| = |p.y| + |p.z| = |p.y| - p.z
        if (p.y >= 0.0) {
            y = (1.0 - abs(p.x));
        } else {
            y = -(1.0 - abs(p.x));
        }
    } else {
        x = p.x;
        y = p.y;
        // so p.z = 1 - |p.x| - |p.y|
    }
    return vec2f(x, y);
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

// put start and end indices into a single u32
fn packBounds(startIdx: u32, endIdx: u32) -> u32 {
    return (startIdx << 16u) | (endIdx & 0xFFFFu);
}

fn unpackBounds(bounds: u32) -> vec2u {
    let startIdx = bounds >> 16u;
    let endIdx = bounds & 0xFFFFu;
    return vec2u(startIdx, endIdx);
}

fn getZIndex(depth: f32) -> u32 {
    let zNear = f32(${nearPlane});
    let zFar  = f32(${farPlane});
    let sliceF = log(depth / zNear) / log(zFar / zNear) *
                 f32(${numClustersZ});
    let clusterZ = clamp(u32(sliceF), 0u, ${numClustersZ} - 1u);
    return clusterZ;
}

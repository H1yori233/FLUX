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
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxNumLights}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    projMat: mat4x4f,
    invViewProjMat: mat4x4f,
    screenWidth: f32,
    screenHeight: f32,
    nearZ: f32,
    farZ: f32
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

// X^2 + Y^2 + Z^2 = 1 -> we can only store X and Y, but need SIGN of Z
fn encodeNormal(normal: vec3f) -> vec2f {
    // project positions in the sphere onto a octahedron (which |X'| + |Y'| + |Z'| = 1)
    let p = normal.xy / (abs(normal.x) + abs(normal.y) + abs(normal.z));
    var x: f32;
    var y: f32;
    
    
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
    let encNorm = encoded * 2.0 - 1.0;
    // |X'| + |Y'| + |Z'| = 1 -> p.z = 1 - |p.x| - |p.y|
    let n = vec3f(encNorm.x, encNorm.y, 1.0 - abs(encNorm.x) - abs(encNorm.y));
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

fn getDepthDebugColor(fragPos: vec3f) -> vec3f {
    var depth = length(fragPos);
    var normalizedDepth = depth / 30.0f;
    return vec3f(normalizedDepth);
}

fn getClusterDebugColor(id: u32) -> vec3f {
    let x = (id * 13) % 255;
    let y = (id * 47) % 255;
    let z = (id * 101) % 255;
    return vec3f(f32(x) / 255.0, f32(y) / 255.0, f32(z) / 255.0);
}

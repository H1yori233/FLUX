// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) pack: vec4u
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

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    
    // Early discard for transparent pixels
    if (diffuseColor.a < 0.5) {
        discard;
    }
    
    var output: GBufferOutput;
    let normal = normalize(in.nor);
    let depth = in.fragPos.z;
    let encodedNormal = encodeNormal(normal);

    let packedNormal = pack2x16snorm(encodedNormal);
    let packedD_R = pack2x16snorm(vec2f(depth, diffuseColor.r));
    let packedGB = pack2x16snorm(vec2f(diffuseColor.g, diffuseColor.b));
    output.pack = vec4u(packedNormal, packedD_R, packedGB, 0);
    
    return output;
} 
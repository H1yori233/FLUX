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
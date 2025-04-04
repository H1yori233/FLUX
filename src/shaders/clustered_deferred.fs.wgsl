// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) position: vec4f,  // World position (xyz) + unused (w)
    @location(1) normal: vec4f,    // Normal vector (xyz) + unused (w)
    @location(2) albedo: vec4f     // Diffuse color (rgb) + alpha (a)
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    
    // Early discard for transparent pixels
    if (diffuseColor.a < 0.5) {
        discard;
    }
    
    var output: GBufferOutput;
    output.position = vec4f(in.pos, 1.0);
    output.normal = vec4f(normalize(in.nor), 0.0);
    output.albedo = diffuseColor;
    
    return output;
}

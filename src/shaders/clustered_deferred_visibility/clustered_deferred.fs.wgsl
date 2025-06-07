@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @location(3) @interpolate(flat) objectId: u32,
    @location(4) @interpolate(flat) triangleId: u32
}

struct GBufferOutput {
    @location(0) index: u32
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    var output: GBufferOutput;
    output.index = (in.objectId << 16u) + (in.triangleId & 0xFFFFu);
    
    return output;
}
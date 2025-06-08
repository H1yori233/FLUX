struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(${bindGroup_postProcessing}) @binding(0) var inputTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var blurTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(2) var inputSampler: sampler;
@group(${bindGroup_postProcessing}) @binding(3) var<uniform> strength: f32;

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
    var result = textureSample(inputTexture, inputSampler, in.uv);
    let blur =  textureSample(blurTexture, inputSampler, in.uv);
    result += blur * strength;
    return result;
}
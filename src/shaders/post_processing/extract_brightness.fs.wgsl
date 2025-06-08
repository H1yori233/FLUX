struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

@group(${bindGroup_postProcessing}) @binding(0) var inputTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var<uniform> threshold: f32;
@group(${bindGroup_postProcessing}) @binding(2) var<uniform> intensity: f32;
@group(${bindGroup_postProcessing}) @binding(3) var inputSampler: sampler;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let color = textureSample(inputTexture, inputSampler, in.uv);
    let brightness = luminance(color.xyz);
    let brightColor = select(vec4f(0.0, 0.0, 0.0, 1.0), 
        color * intensity, brightness > threshold);
    return brightColor;
}

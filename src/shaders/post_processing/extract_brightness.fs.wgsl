struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

@group(${bindGroup_post_process}) @binding(0) var inputTexture: texture_2d<f32>;
@group(${bindGroup_post_process}) @binding(1) var<uniform> threshold: f32;
@group(${bindGroup_post_process}) @binding(2) var<uniform> intensity: f32;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let color = textureLoad(inputTexture, vec2i(in.fragCoord.xy), 0);
    let brightness = luminance(color);
    let brightColor = select(vec4f(0.0, 0.0, 0.0, 1.0), 
        color * intensity, brightness > threshold);
    return brightColor;
}

@group(${bindGroup_postProcessing}) @binding(0) var renderTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var textureSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let color = textureSample(renderTexture, textureSampler, texCoord);
    let luminance = luminance(color.rgb);
    let finalColor = vec3f(luminance, luminance, luminance);
    return vec4(finalColor, 1.0);
}

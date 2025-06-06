@group(${bindGroup_postProcessing}) @binding(0) var renderTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var textureSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

const LEVELS: f32 = 4.0;
const THRESHOLD: f32 = 0.5;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let color = textureSample(renderTexture, textureSampler, texCoord);
    
    let lum = luminance(color.rgb);
    let quantLum = floor(lum * LEVELS) / LEVELS;
    let scale = quantLum / max(lum, 1e-4);
    var finalColor = color.rgb * scale;

    let edgeFactor = step(THRESHOLD, fwidth(lum));
    finalColor = mix(finalColor, vec3f(0.0), edgeFactor);
    return vec4(finalColor, 1.0);
}

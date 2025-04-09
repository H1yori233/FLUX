struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var originalTexture: texture_2d<f32>;
@group(0) @binding(1) var blurredTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> bloomStrength: f32;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let originalColor = textureLoad(originalTexture, vec2i(in.fragCoord.xy), 0);
    let blurredColor = textureLoad(blurredTexture, vec2i(in.fragCoord.xy), 0);
    
    // 混合原始图像和模糊后的亮部
    return originalColor + blurredColor * bloomStrength;
} 
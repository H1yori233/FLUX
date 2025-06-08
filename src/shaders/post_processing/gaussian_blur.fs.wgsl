struct FragmentInput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(${bindGroup_postProcessing}) @binding(0) var inputTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var inputSampler: sampler;
@group(${bindGroup_postProcessing}) @binding(2) var<uniform> horizontal: u32;

const weights = array<f32, 8>(
    0.174697, 0.160230, 0.122306, 0.080840, 0.046310, 0.022944, 0.009864, 0.003674
);

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texelSize = vec2f(1.0 / f32(textureDimensions(inputTexture).x), 1.0 / f32(textureDimensions(inputTexture).y));
    var result = textureSample(inputTexture, inputSampler, in.uv) * weights[0];

    for (var i = 1u; i < 8u; i++) {
        let offsetFactor = f32(i);
        var offset = vec2f(0.0, 0.0);
        if (horizontal == 1u) {
            offset.x = offsetFactor * texelSize.x;
        } else {
            offset.y = offsetFactor * texelSize.y;
        }

        // Comment out weight access for testing
        let weight = weights[i]; 

        // Texture sampling lines remain commented out
        result += textureSample(inputTexture, inputSampler, in.uv + offset) * weight;
        result += textureSample(inputTexture, inputSampler, in.uv - offset) * weight;
    }
    return result;
} 

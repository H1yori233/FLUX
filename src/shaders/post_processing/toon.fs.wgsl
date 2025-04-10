struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

@group(${bindGroup_post_process}) @binding(0) var inputTexture: texture_2d<f32>;
@group(${bindGroup_post_process}) @binding(1) var<uniform> intensity: f32;
@group(${bindGroup_post_process}) @binding(2) var<uniform> threshold: f32;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let coord = vec2i(in.fragCoord.xy);
    let color = textureLoad(inputTexture, coord, 0);
    let dims = textureDimensions(inputTexture);
    let toonColor = vec3f(
        round(color.r * intensity) / intensity,
        round(color.g * intensity) / intensity,
        round(color.b * intensity) / intensity
    );

    let centerLum = luminance(color);
    var edgeStrength: f32 = 0.0;
    let edgeColor = vec3f(1.0, 1.0, 1.0);
    let offsets = array<vec2i, 4>(
        vec2i(0, 1),
        vec2i(0, -1),
        vec2i(-1, 0),
        vec2i(1, 0)
    );

    for (var i = 0u; i < 4u; i++) {
        let temp = coord + offsets[i];
        let neighborCoord = vec2i(
            clamp(temp.x, 0, i32(dims.x) - 1),
            clamp(temp.y, 0, i32(dims.y) - 1)
        );
        let neighborColor = textureLoad(inputTexture, neighborCoord, 0);
        let neighborLum = luminance(neighborColor);
        edgeStrength = edgeStrength + abs(centerLum - neighborLum);
    }

    if (edgeStrength > threshold) {
        return vec4f(edgeColor, 1.0);
    } else {
        return vec4f(toonColor, 1.0);
    }
}

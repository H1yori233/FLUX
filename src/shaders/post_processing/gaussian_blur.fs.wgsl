struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> horizontal: u32;
@group(0) @binding(2) var<uniform> kernelSize: u32;

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) fragCoord: vec2f,
}

@fragment
fn main(in: VertexOutput) -> @location(0) vec4f {
    // let weights = array<f32, 15>(
    //     0.227027, 0.1945946, 0.1216216, 0.054054, 0.0262162,
    //     0.0, 0.0, 0.0, 0.0, 0.0,
    //     0.0, 0.0, 0.0, 0.0, 0.0
    // );
    
    var result = textureLoad(inputTexture, vec2i(in.fragCoord.xy), 0);
    // var result = textureLoad(inputTexture, vec2i(in.fragCoord.xy), 0) * weights[0];
    
    // for (var i: u32 = 1u; i < kernelSize; i++) {
    //     var offset = vec2f(f32(i) * (1.0 / f32(textureDimensions(inputTexture).x)), 0.0);
    //     if (horizontal == 1u) {
    //         offset.y = 0.0;
    //     } else {
    //         offset.x = 0.0;
    //     }
        
    //     let pos = vec2i(in.fragCoord.xy) + vec2i(offset);
    //     result += textureLoad(inputTexture, pos, 0) * weights[i];
        
    //     let negPos = vec2i(in.fragCoord.xy) - vec2i(offset);
    //     result += textureLoad(inputTexture, negPos, 0) * weights[i];
    // }
    
    return result;
    // return vec4f(1.0, 1.0, 0.0, 1.0);
} 
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var visibilityTexture: texture_2d<u32>;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

fn generateTriangleColor(triangleId: u32) -> vec3f {
    // Generate pseudo-random colors based on triangle ID
    // This creates a distinctive color pattern for each triangle
    let hash = triangleId * 2654435761u; // Large prime for better distribution
    
    let r = f32((hash >> 0u) & 0xFFu) / 255.0;
    let g = f32((hash >> 8u) & 0xFFu) / 255.0; 
    let b = f32((hash >> 16u) & 0xFFu) / 255.0;
    
    // Ensure colors are bright enough to see
    return vec3f(
        0.3 + 0.7 * r,
        0.3 + 0.7 * g,
        0.3 + 0.7 * b
    );
}


@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let temp = textureLoad(visibilityTexture, vec2i(in.fragPos.xy), 0).x;

    let objectId = temp >> 16u;
    let triangleId = temp & 0xFFFFu;
 
    // let finalColor = vec3f(fract(f32(objectId)  * 0.003921568),   //  /255.0
    //                        fract(f32(triangleId)* 0.001953125),   //  /512.0
    //                        0.0);
    let finalColor = generateTriangleColor(triangleId);
                           
    return vec4(finalColor, 1.0);
} 
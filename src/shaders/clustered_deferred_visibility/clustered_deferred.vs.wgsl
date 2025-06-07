@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_model}) @binding(0) var<uniform> modelMat: mat4x4f;

// ------------------------------------
// Get ID of the object and triangle
// ------------------------------------
// By default, vertex outputs that go into fragment inputs 
// are **linearly interpolated** across the triangle
//
// **flat** means **no interpolation**: 
//     - the fragment gets the exact value output 
//          by whichever vertex provoked the triangle 
//          (by default the first vertex of the primitive).

struct VertexInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @location(3) @interpolate(flat) objectId: u32,
    @location(4) @interpolate(flat) triangleId: u32
}

@vertex
fn main(in: VertexInput, 
        @builtin(instance_index) instanceIndex: u32, 
        @builtin(vertex_index) vertexIndex: u32) -> VertexOutput
{
    let modelPos = modelMat * vec4(in.pos, 1);

    var out: VertexOutput;
    out.fragPos = cameraUniforms.viewProjMat * modelPos;
    out.pos = (cameraUniforms.viewMat * modelPos).xyz;
    out.nor = in.nor;
    out.uv = in.uv;
    out.objectId = instanceIndex;
    out.triangleId = vertexIndex / 3u;
    return out;
}

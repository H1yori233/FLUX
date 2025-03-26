struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    var depth = length(in.pos);
    // var normalizedDepth = depth / ${lightRadius};
    var normalizedDepth = depth / 30.0f;

    var finalColor = vec3f(normalizedDepth);
    return vec4(finalColor, 1);
}

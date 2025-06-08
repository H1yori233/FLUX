@group(${bindGroup_postProcessing}) @binding(0) var renderTexture: texture_2d<f32>;
@group(${bindGroup_postProcessing}) @binding(1) var textureSampler: sampler;
@group(${bindGroup_postProcessing}) @binding(2) var<uniform> levels: f32;
@group(${bindGroup_postProcessing}) @binding(3) var<uniform> edgeThreshold: f32;
@group(${bindGroup_postProcessing}) @binding(4) var<uniform> edgeIntensity: f32;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let texCoord = in.uv;
    let color = textureSample(renderTexture, textureSampler, texCoord);
    
    // Improve dark area visibility
    var lum = luminance(color.rgb);
    
    // Boost dark areas more aggressively
    let darkBoost = 0.25;
    let minLum = 0.35;
    let gamma = 0.7;  // Lower gamma to boost dark areas more
    
    // Apply dark area enhancement
    lum = pow(max(lum + darkBoost, minLum), gamma);
    
    // Keep toon shading effect with adjusted luminance
    let quantLum = floor(lum * levels) / levels;
    
    // Adaptive scaling - preserve more detail in dark areas
    var scale = mix(1.0, quantLum / max(lum, 1e-4), smoothstep(0.2, 0.7, lum));
    var finalColor = color.rgb * scale;

    // Sobel edge detection
    let texelSize = vec2f(1.0 / f32(textureDimensions(renderTexture).x), 1.0 / f32(textureDimensions(renderTexture).y));
    
    let tl = textureSample(renderTexture, textureSampler, texCoord + vec2f(-texelSize.x, -texelSize.y)).rgb;
    let t  = textureSample(renderTexture, textureSampler, texCoord + vec2f(0.0, -texelSize.y)).rgb;
    let tr = textureSample(renderTexture, textureSampler, texCoord + vec2f(texelSize.x, -texelSize.y)).rgb;
    let l  = textureSample(renderTexture, textureSampler, texCoord + vec2f(-texelSize.x, 0.0)).rgb;
    let r  = textureSample(renderTexture, textureSampler, texCoord + vec2f(texelSize.x, 0.0)).rgb;
    let bl = textureSample(renderTexture, textureSampler, texCoord + vec2f(-texelSize.x, texelSize.y)).rgb;
    let b  = textureSample(renderTexture, textureSampler, texCoord + vec2f(0.0, texelSize.y)).rgb;
    let br = textureSample(renderTexture, textureSampler, texCoord + vec2f(texelSize.x, texelSize.y)).rgb;
    
    let tlLum = luminance(tl);
    let tLum  = luminance(t);
    let trLum = luminance(tr);
    let lLum  = luminance(l);
    let rLum  = luminance(r);
    let blLum = luminance(bl);
    let bLum  = luminance(b);
    let brLum = luminance(br);
    
    let sobelX = trLum + 2.0 * rLum + brLum - tlLum - 2.0 * lLum - blLum;
    let sobelY = blLum + 2.0 * bLum + brLum - tlLum - 2.0 * tLum - trLum;
    
    let edgeMagnitude = sqrt(sobelX * sobelX + sobelY * sobelY);
    let edgeFactor = step(edgeThreshold, edgeMagnitude * edgeIntensity);
    
    // Reduce edge darkness in dark areas to preserve visibility
    let adaptiveEdgeDarkness = mix(0.3, 0.1, smoothstep(0.0, 0.4, luminance(finalColor)));
    finalColor = mix(finalColor, vec3f(adaptiveEdgeDarkness), edgeFactor);

    return vec4(finalColor, 1.0);
}

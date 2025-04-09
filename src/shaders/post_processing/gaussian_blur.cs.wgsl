@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> horizontal: u32;
@group(0) @binding(2) var<uniform> kernelSize: u32;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;

const WORKGROUP_SIZE = ${gaussianBlurWorkgroupSize};

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dimensions = textureDimensions(inputTexture);
    let pixel_pos = vec2<i32>(global_id.xy);
    
    // 检查是否超出纹理边界
    if (pixel_pos.x >= dimensions.x || pixel_pos.y >= dimensions.y) {
        return;
    }
    
    let weights = array<f32, 15>(
        0.227027, 0.1945946, 0.1216216, 0.054054, 0.0262162,
        0.0167, 0.0090, 0.0055, 0.0030, 0.0018,
        0.0010, 0.0005, 0.0003, 0.0001, 0.0001
    );
    
    // 中心像素
    var result = textureLoad(inputTexture, pixel_pos, 0) * weights[0];
    
    // 根据核尺寸应用模糊
    for (var i: u32 = 1u; i < kernelSize && i < 15u; i++) {
        var offset: vec2<i32>;
        
        // 根据方向设置偏移
        if (horizontal == 1u) {
            offset = vec2<i32>(i32(i), 0);
        } else {
            offset = vec2<i32>(0, i32(i));
        }
        
        // 读取正偏移像素
        let pos_pos = pixel_pos + offset;
        if (pos_pos.x < dimensions.x && pos_pos.y < dimensions.y) {
            result += textureLoad(inputTexture, pos_pos, 0) * weights[i];
        }
        
        // 读取负偏移像素
        let neg_pos = pixel_pos - offset;
        if (neg_pos.x >= 0 && neg_pos.y >= 0) {
            result += textureLoad(inputTexture, neg_pos, 0) * weights[i];
        }
    }
    
    textureStore(outputTexture, pixel_pos, result);
}

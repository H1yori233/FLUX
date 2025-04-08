// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

fn clip2View(clip: vec4f) -> vec4f {
    var view = camera.invViewProjMat * clip;
    view = view / view.w;
    return view;
}

fn screen2View(screen: vec4f) -> vec4f {
    let texCoord = screen.xy / vec2f(camera.screenWidth, camera.screenHeight);
    let clip = vec4f(vec2f(texCoord.x, 1.0 - texCoord.y) * 2.0 - 1.0, screen.z, screen.w);
    return clip2View(clip);
}

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster's bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

fn lightIntersect(lightPos: vec3<f32>, 
                  min: vec3<f32>, max: vec3<f32>, r: f32) -> bool {
    let closestPoint = clamp(lightPos, min, max); 
    let d = lightPos - closestPoint;
    let dist = dot(d, d);
    return dist <= r * r;
}

@compute @workgroup_size(${workgroupSizeX}, ${workgroupSizeY}, ${workgroupSizeZ})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= ${numClustersX} || 
        global_id.y >= ${numClustersY} || 
        global_id.z >= ${numClustersZ}) {
        return;
    }
    
    let index = global_id.x + 
                global_id.y * ${numClustersX} + 
                global_id.z * ${numClustersX} * ${numClustersY};

    let minX = -1.0 + 2.0 * f32(global_id.x) / f32(${numClustersX});
    let maxX = -1.0 + 2.0 * f32(global_id.x + 1) / f32(${numClustersX});
    let minY = -1.0 + 2.0 * f32(global_id.y) / f32(${numClustersY});
    let maxY = -1.0 + 2.0 * f32(global_id.y + 1) / f32(${numClustersY});
    
    let tileNear    = -camera.nearZ * 
                      pow(camera.farZ / camera.nearZ, 
                      f32(global_id.z) / f32(${numClustersZ}));
    let tileFar     = -camera.nearZ * 
                      pow(camera.farZ / camera.nearZ, 
                      f32(global_id.z + 1u) / f32(${numClustersZ}));
    let minZ = (camera.projMat[2][2] * tileNear + camera.projMat[3][2]) / 
               (camera.projMat[2][3] * tileNear + camera.projMat[3][3]);
    let maxZ = (camera.projMat[2][2] * tileFar  + camera.projMat[3][2]) / 
               (camera.projMat[2][3] * tileFar  + camera.projMat[3][3]);
    
    var corners: array<vec4f, 8>;
    corners[0] = vec4f(minX, minY, minZ, 1.0);
    corners[1] = vec4f(minX, minY, maxZ, 1.0);
    corners[2] = vec4f(minX, maxY, minZ, 1.0);
    corners[3] = vec4f(minX, maxY, maxZ, 1.0);
    corners[4] = vec4f(maxX, minY, minZ, 1.0);
    corners[5] = vec4f(maxX, minY, maxZ, 1.0);
    corners[6] = vec4f(maxX, maxY, minZ, 1.0);
    corners[7] = vec4f(maxX, maxY, maxZ, 1.0);

    var min_bounds = clip2View(corners[0]).xyz;
    var max_bounds = min_bounds;
    for (var i = 1u; i < 8u; i++) {
        let corner = clip2View(corners[i]).xyz;
        min_bounds = min(min_bounds, corner);
        max_bounds = max(max_bounds, corner);
    }

    // Assigning lights to clusters:
    clusterSet.clusters[index].numLights = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightWorld = lightSet.lights[lightIdx].pos;
        let lightView = camera.viewMat * vec4f(lightWorld, 1.0);
        if (lightIntersect(lightView.xyz, min_bounds, max_bounds, ${lightRadius})) {
            let count = clusterSet.clusters[index].numLights;
            if (count < ${maxNumLights}) {
                clusterSet.clusters[index].lightIndices[count] = lightIdx;
                clusterSet.clusters[index].numLights += 1u;
            }
        }
    }
}

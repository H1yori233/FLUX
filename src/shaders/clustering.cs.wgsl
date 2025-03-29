// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterParams: ClusterParams;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

fn calculateViewPos(ndc_x: f32, ndc_y: f32, depth: f32) -> vec3f {
    let ndcCoord = vec4(ndc_x, ndc_y, depth, 1.0);
    let viewCoord = camera.invViewProjMat * ndcCoord;
    return viewCoord.xyz / viewCoord.w;
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
    let x = clamp(lightPos.x, min.x, max.x);
    let y = clamp(lightPos.y, min.y, max.y);
    let z = clamp(lightPos.z, min.z, max.z);

    let closestPoint = vec3<f32>(x, y, z);
    let d = lightPos - closestPoint;
    let dist = dot(d, d);
    if (dist <= r * r) {
        return true;
    }
    else {
        return false;
    }
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= clusterParams.numClustersX || 
        global_id.y >= clusterParams.numClustersY || 
        global_id.z >= clusterParams.numClustersZ) {
        return;
    }
    
    let index = global_id.x + 
                global_id.y * clusterParams.numClustersX + 
                global_id.z * clusterParams.numClustersX * clusterParams.numClustersY;
    
    let cluster_size_x = clusterParams.screenWidth / f32(clusterParams.numClustersX);
    let cluster_size_y = clusterParams.screenHeight / f32(clusterParams.numClustersY);
    
    let min_x = f32(global_id.x) * cluster_size_x;
    let max_x = min_x + cluster_size_x;
    let min_y = f32(global_id.y) * cluster_size_y;
    let max_y = min_y + cluster_size_y;

    let tileNear    = clusterParams.nearZ * 
                      pow(clusterParams.farZ / clusterParams.nearZ, 
                          f32(global_id.z) / f32(clusterParams.numClustersZ));
    let tileFar     = clusterParams.nearZ * 
                      pow(clusterParams.farZ / clusterParams.nearZ, 
                          f32(global_id.z + 1u) / f32(clusterParams.numClustersZ));
    let min_z = (tileNear - clusterParams.nearZ) / 
                (clusterParams.farZ - clusterParams.nearZ);
    let max_z = (tileFar -  clusterParams.nearZ) / 
                (clusterParams.farZ - clusterParams.nearZ);

    // from (0, width) to (-1, 1)
    let min_x_ndc = min_x / clusterParams.screenWidth * 2.0 - 1.0;
    let max_x_ndc = max_x / clusterParams.screenWidth * 2.0 - 1.0;
    let min_y_ndc = 1.0 - (min_y / clusterParams.screenHeight * 2.0);
    let max_y_ndc = 1.0 - (max_y / clusterParams.screenHeight * 2.0);
    
    var corners: array<vec3f, 8>;
    corners[0] = calculateViewPos(min_x_ndc, min_y_ndc, min_z);
    corners[1] = calculateViewPos(max_x_ndc, min_y_ndc, min_z);
    corners[2] = calculateViewPos(min_x_ndc, max_y_ndc, min_z);
    corners[3] = calculateViewPos(max_x_ndc, max_y_ndc, min_z);
    
    corners[4] = calculateViewPos(min_x_ndc, min_y_ndc, max_z);
    corners[5] = calculateViewPos(max_x_ndc, min_y_ndc, max_z);
    corners[6] = calculateViewPos(min_x_ndc, max_y_ndc, max_z);
    corners[7] = calculateViewPos(max_x_ndc, max_y_ndc, max_z);

    var min_bounds = corners[0];
    var max_bounds = corners[0];
    for (var i = 1u; i < 8u; i++) {
        min_bounds = min(min_bounds, corners[i]);
        max_bounds = max(max_bounds, corners[i]);
    }
    
    clusterSet.clusters[index].min = min_bounds;
    clusterSet.clusters[index].max = max_bounds;
    
    // Assigning lights to clusters:
    clusterSet.clusters[index].lightCount = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (lightIntersect(lightSet.lights[lightIdx].pos, 
                           min_bounds, max_bounds, 
                           ${lightRadius})) {
            let count = clusterSet.clusters[index].lightCount;
            if (clusterSet.clusters[index].lightCount < 32u) {
                clusterSet.clusters[index].lightIndices[count] = lightIdx;
                clusterSet.clusters[index].lightCount += 1u;
            }
        }
    }
}

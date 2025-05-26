/*
 * This code is primarily based on the following article:
 * https://www.aortiz.me/2018/12/21/CG.html
 */

// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read> zBin: ZBin;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

fn screen2View(screen: vec4f) -> vec4f {
    //Convert to NDC
    let texCoord = screen.xy / cameraUniforms.screenDimensions.xy;
    //Convert to clipSpace
    let clip = vec4(vec2(texCoord.x, 1.0 - texCoord.y) * 2.0 - 1.0, screen.z, screen.w);
    //View space transform
    var view = cameraUniforms.invProjMat * clip;
    // Perspective projection
    view = view / view.w;
    return view;
}

fn lineIntersectionToZPlane(A: vec3f, B: vec3f, zDistance: f32) -> vec3f {
    //all clusters planes are aligned in the same z direction
    let normal = vec3(0.0, 0.0, 1.0);
    //getting the line from the eye to the tile
    let ab =  B - A;
    //Computing the intersection length for the line and the plane
    let t = (zDistance - dot(normal, A)) / dot(normal, ab);
    //Computing the actual xyz position of the point along the line
    let result = A + t * ab;
    return result;
}

fn sqDistPointAABB(point: vec3f, min: vec3f, max: vec3f) -> f32 { 
    var sqDist = 0.0;

    if(point.x < min.x) {
        sqDist += (min.x - point.x) * (min.x - point.x);
    }
    if(point.x > max.x) {
        sqDist += (max.x - point.x) * (max.x - point.x);
    }

    if(point.y < min.y) {
        sqDist += (min.y - point.y) * (min.y - point.y);
    }
    if(point.y > max.y) {
        sqDist += (max.y - point.y) * (max.y - point.y);
    }

    if(point.z < min.z) {
        sqDist += (min.z - point.z) * (min.z - point.z);
    }
    if(point.z > max.z) {
        sqDist += (max.z - point.z) * (max.z - point.z);
    }

    return sqDist;
}

fn testSphereAABB(light: u32, min: vec3f, max: vec3f) -> bool {
    let radius = ${lightRadius};
    // let pos = vec4(lightSet.lights[light].pos, 1.0);
    // let center  = (cameraUniforms.viewMat * pos).xyz;
    let center = lightSet.lights[light].pos;
    let squaredDistance = sqDistPointAABB(center, min, max);

    return squaredDistance <= f32(radius * radius);
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

    let eyePos = vec3(0.0);
    
    // Calculating the min and max point in screen space
    let tileSizePx = cameraUniforms.screenDimensions.xy / 
                     vec2(${numClustersX}, ${numClustersY});
    let maxPoint_sS = vec4(vec2(f32(global_id.x) + 1.0,
                                f32(global_id.y) + 1.0) * tileSizePx,
                                -1.0, 1.0);     // Top Right
    let minPoint_sS = vec4(vec2(f32(global_id.x),
                                f32(global_id.y)) * tileSizePx,
                                -1.0, 1.0);     // Bottom left

    // Pass min and max to view space
    let maxPoint_vS = screen2View(maxPoint_sS).xyz;
    let minPoint_vS = screen2View(minPoint_sS).xyz;

    // Near and far values of the cluster in view space
    // We use equation (2) directly to obtain the tile values
    let zNear = f32(${nearPlane});
    let zFar = f32(${farPlane});
    let tileNear  = -zNear * pow(zFar / zNear, f32(global_id.z) / ${numClustersZ});
    let tileFar   = -zNear * pow(zFar / zNear, (f32(global_id.z) + 1.0) / ${numClustersZ});

    // Finding the 4 intersection points made from each point to the cluster near/far plane
    let minPointNear = lineIntersectionToZPlane(eyePos, minPoint_vS, tileNear);
    let minPointFar  = lineIntersectionToZPlane(eyePos, minPoint_vS, tileFar );
    let maxPointNear = lineIntersectionToZPlane(eyePos, maxPoint_vS, tileNear);
    let maxPointFar  = lineIntersectionToZPlane(eyePos, maxPoint_vS, tileFar );
    
    let minPointAABB = min(min(minPointNear, minPointFar), min(maxPointNear, maxPointFar));
    let maxPointAABB = max(max(minPointNear, minPointFar), max(maxPointNear, maxPointFar));
    
    // Z-Binning
    let bounds = unpackBounds(zBin.bins[global_id.z]);
    let startLightIdx = bounds.x;
    let endLightIdx = bounds.y;

    // Iterating within lights
    clusterSet.clusters[index].numLights = 0u;
    // for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
    //     if(testSphereAABB(lightIdx, minPointAABB, maxPointAABB)){
    //         let numLights = clusterSet.clusters[index].numLights;
    //         clusterSet.clusters[index].lightIndices[numLights] = lightIdx;
    //         clusterSet.clusters[index].numLights++;
    //     }
    //     if(clusterSet.clusters[index].numLights >= ${maxNumLights}) {
    //         break;
    //     }
    // }
    for (var lightIdx = startLightIdx; lightIdx < endLightIdx; lightIdx++) {
        if(testSphereAABB(lightIdx, minPointAABB, maxPointAABB)){
            let numLights = clusterSet.clusters[index].numLights;
            clusterSet.clusters[index].lightIndices[numLights] = lightIdx;
            clusterSet.clusters[index].numLights++;
        }
        if(clusterSet.clusters[index].numLights >= ${maxNumLights}) {
            break;
        }
    }
}
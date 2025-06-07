// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';
import { canvas } from '../renderer';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import clusteredDeferredOptimizationFragRaw from './clustered_deferred_optimization/clustered_deferred.fs.wgsl?raw';
import clusteredDeferredOptimizationFullscreenFragRaw from './clustered_deferred_optimization/clustered_deferred_fullscreen.fs.wgsl?raw';

import clusteredDeferredVisibilityVertRaw from './clustered_deferred_visibility/clustered_deferred.vs.wgsl?raw';
import clusteredDeferredVisibilityFragRaw from './clustered_deferred_visibility/clustered_deferred.fs.wgsl?raw';
import clusteredDeferredVisibilityFullscreenFragRaw from './clustered_deferred_visibility/clustered_deferred_fullscreen.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

import grayFragRaw from './post_processing/gray.fs.wgsl?raw';
import toonFragRaw from './post_processing/toon.fs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    bindGroup_gbuffer: 1,
    bindGroup_postProcessing: 0,

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    // TODO-2: add constants for light clustering here
    nearPlane: Camera.nearPlane,
    farPlane: Camera.farPlane,
    
    maxNumLights: 512,

    numClustersX: 16,
    numClustersY: 9,
    numClustersZ: 16,
    
    workgroupSizeX: 8,
    workgroupSizeY: 4,
    workgroupSizeZ: 8,
};

// =================================

function evalShaderRaw(raw: string) {
    return eval('`' + raw.replaceAll('${', '${constants.') + '`');
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const clusteredDeferredOptimizationFragSrc: string = processShaderRaw(clusteredDeferredOptimizationFragRaw);
export const clusteredDeferredOptimizationFullscreenFragSrc: string = processShaderRaw(clusteredDeferredOptimizationFullscreenFragRaw);

export const clusteredDeferredVisibilityVertSrc: string = processShaderRaw(clusteredDeferredVisibilityVertRaw);
export const clusteredDeferredVisibilityFragSrc: string = processShaderRaw(clusteredDeferredVisibilityFragRaw);
export const clusteredDeferredVisibilityFullscreenFragSrc: string = processShaderRaw(clusteredDeferredVisibilityFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);

export const grayFragSrc: string = processShaderRaw(grayFragRaw);
export const toonFragSrc: string = processShaderRaw(toonFragRaw);

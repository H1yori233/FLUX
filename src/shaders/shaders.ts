// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';
import clusteredOptimizedDeferredFragRaw from './clustered_optimized_deferred/clustered_optimized_deferred.fs.wgsl?raw';
import clusteredOptimizedDeferredFullscreenFragRaw from './clustered_optimized_deferred/clustered_optimized_deferred_fullscreen.fs.wgsl?raw';

import extractBrightnessFragRaw from './post_processing/extract_brightness.fs.wgsl?raw';
import gaussianBlurFragRaw from './post_processing/gaussian_blur.fs.wgsl?raw';
import gaussianBlurComputeRaw from './post_processing/gaussian_blur.cs.wgsl?raw';
import blendFragRaw from './post_processing/blend.fs.wgsl?raw';
import toonFragRaw from './post_processing/toon.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

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
    bindGroup_compute: 2,
    bindGroup_post_process: 0,

    moveLightsWorkgroupSize: 128,
    gaussianBlurWorkgroupSize: 16,

    lightRadius: 2,
    
    // TODO-2
    maxNumLights: 64,

    workgroupSizeX: 4,
    workgroupSizeY: 4,
    workgroupSizeZ: 4,

    numClustersX: 16,
    numClustersY: 9,
    numClustersZ: 24,
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
export const clusteredOptimizedDeferredFragSrc: string = processShaderRaw(clusteredOptimizedDeferredFragRaw);
export const clusteredOptimizedDeferredFullscreenFragSrc: string = processShaderRaw(clusteredOptimizedDeferredFullscreenFragRaw);

export const extractBrightnessFragSrc: string = processShaderRaw(extractBrightnessFragRaw);
export const gaussianBlurFragSrc: string = processShaderRaw(gaussianBlurFragRaw);
export const gaussianBlurComputeSrc: string = processShaderRaw(gaussianBlurComputeRaw);
export const blendFragSrc: string = processShaderRaw(blendFragRaw);
export const toonFragSrc: string = processShaderRaw(toonFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);

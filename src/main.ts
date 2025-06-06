import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';
import { ClusteredDeferredOptimizationRenderer } from './renderers/clustered_deferred_optimization';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

class guiStatsStruct
{
    UseRenderBundle : boolean = false;
    UsePostProcessing : boolean = false;
    UseGray : boolean = false;
    UseToon : boolean = false;
}
const guiStats = new guiStatsStruct();

function setUseRenderBundle() {
    if (renderer)
    {
        renderer.bUseRenderBundles = guiStats.UseRenderBundle;
    }
}

function setUsePostProcessing() {
    if (renderer) {
        if (guiStats.UsePostProcessing) {
            (renderer as any).initPostProcessing?.();
        } else {
            (renderer as any).bUsePostProcessing = false;
        }
    }
}

function setPostProcessEffects() {
    if (renderer && (renderer as any).setPostProcessingEffects) {
        (renderer as any).setPostProcessingEffects(guiStats.UseGray, guiStats.UseToon);
    }
}

gui.add(guiStats, "UseRenderBundle").onChange(() => setUseRenderBundle());
gui.add(guiStats, "UsePostProcessing").onChange(() => setUsePostProcessing());
gui.add(guiStats, "UseGray").onChange(() => setPostProcessEffects());
gui.add(guiStats, "UseToon").onChange(() => setPostProcessEffects());

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
        case renderModes.clusteredDeferredOptimization:
            renderer = new ClusteredDeferredOptimizationRenderer(stage);
            break;
    }
    
    // Apply current settings to new renderer
    if (renderer) {
        renderer.bUseRenderBundles = guiStats.UseRenderBundle;
        if (guiStats.UsePostProcessing) {
            (renderer as any).initPostProcessing?.();
        }
        (renderer as any).setPostProcessingEffects?.(guiStats.UseGray, guiStats.UseToon);
    }
}

const renderModes = { 
    naive: 'naive', 
    forwardPlus: 'forward+', 
    clusteredDeferred: 'clustered deferred',
    clusteredDeferredOptimization: 'clustered deferred optimization'
};
let renderModeController = gui.add({ mode: renderModes.forwardPlus }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());

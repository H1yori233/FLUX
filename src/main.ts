import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';
import { ClusteredDeferredOptimizationRenderer } from './renderers/clustered_deferred_optimization';
import { ClusteredDeferredVisibilityRenderer } from './renderers/clustered_deferred_visibility';

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
    UseRenderBundle : boolean = true;
    UseGray : boolean = false;
    UseToon : boolean = false;
    UseBloom : boolean = false;
    BloomThreshold : number = 0.85;
    BloomIntensity : number = 1.2;
    BloomStrength : number = 0.5;
    ToonLevels : number = 4.0;
    ToonEdgeThreshold : number = 0.92;
    ToonEdgeIntensity : number = 1.15;
}
const guiStats = new guiStatsStruct();

function setUseRenderBundle() {
    if (renderer)
    {
        renderer.bUseRenderBundles = guiStats.UseRenderBundle;
    }
}

function setPostProcessEffects() {
    if (renderer) {
        const anyEffectEnabled = guiStats.UseGray || guiStats.UseToon || guiStats.UseBloom;
        
        if (anyEffectEnabled && (renderer as any).initPostProcessing) {
            (renderer as any).initPostProcessing();
        }
        
        if ((renderer as any).setPostProcessingEffects) {
            (renderer as any).setPostProcessingEffects(guiStats.UseGray, guiStats.UseToon, guiStats.UseBloom);
        }
        
        if (!anyEffectEnabled && (renderer as any).bUsePostProcessing !== undefined) {
            (renderer as any).bUsePostProcessing = false;
        }
    }
}

function setBloomParameters() {
    if (renderer && (renderer as any).setBloomParameters) {
        (renderer as any).setBloomParameters(guiStats.BloomThreshold, guiStats.BloomIntensity, guiStats.BloomStrength);
    }
}

function setToonParameters() {
    if (renderer && (renderer as any).setToonParameters) {
        (renderer as any).setToonParameters(guiStats.ToonLevels, guiStats.ToonEdgeThreshold, guiStats.ToonEdgeIntensity);
    }
}

gui.add(guiStats, "UseRenderBundle").onChange(() => setUseRenderBundle());
gui.add(guiStats, "UseGray").onChange(() => setPostProcessEffects());
gui.add(guiStats, "UseToon").onChange(() => setPostProcessEffects());
gui.add(guiStats, "UseBloom").onChange(() => setPostProcessEffects());

// Create Bloom folder
const bloomFolder = gui.addFolder('Bloom Parameters');
bloomFolder.add(guiStats, "BloomThreshold", 0.0, 1.0, 0.01).onChange(() => setBloomParameters());
bloomFolder.add(guiStats, "BloomIntensity", 0.0, 5.0, 0.1).onChange(() => setBloomParameters());
bloomFolder.add(guiStats, "BloomStrength", 0.0, 2.0, 0.05).onChange(() => setBloomParameters());

// Create Toon folder
const toonFolder = gui.addFolder('Toon Parameters');
toonFolder.add(guiStats, "ToonLevels", 2.0, 8.0, 1.0).onChange(() => setToonParameters());
toonFolder.add(guiStats, "ToonEdgeThreshold", 0.01, 1.0, 0.01).onChange(() => setToonParameters());
toonFolder.add(guiStats, "ToonEdgeIntensity", 0.1, 2.0, 0.01).onChange(() => setToonParameters());

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
        case renderModes.clusteredDeferredVisibility:
            renderer = new ClusteredDeferredVisibilityRenderer(stage);
            break;
    }
    
    // Apply current settings to new renderer
    if (renderer) {
        renderer.bUseRenderBundles = guiStats.UseRenderBundle;
        if (guiStats.UseGray || guiStats.UseToon || guiStats.UseBloom) {
            (renderer as any).initPostProcessing?.();
            (renderer as any).setPostProcessingEffects?.(guiStats.UseGray, guiStats.UseToon, guiStats.UseBloom);
        }
        
        (renderer as any).setBloomParameters?.(guiStats.BloomThreshold, guiStats.BloomIntensity, guiStats.BloomStrength);
        (renderer as any).setToonParameters?.(guiStats.ToonLevels, guiStats.ToonEdgeThreshold, guiStats.ToonEdgeIntensity);
    }
}

const renderModes = { 
    naive: 'naive', 
    forwardPlus: 'forward+', 
    clusteredDeferred: 'clustered deferred',
    clusteredDeferredOptimization: 'clustered deferred optimization',
    clusteredDeferredVisibility: 'clustered deferred visibility'
};
let renderModeController = gui.add({ mode: renderModes.forwardPlus }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());

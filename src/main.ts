import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import * as rendererModule from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';
import { ClusteredOptimizedDeferredRenderer } from './renderers/clustered_optimized_deferred';
import { Bloom } from './renderers/bloom';
import { Toon } from './renderers/toon';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await rendererModule.initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const bloom = new Bloom();
const toon = new Toon();

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const stage = new Stage(scene, lights, camera, stats, bloom, toon);

var renderer: rendererModule.Renderer | undefined;

const bloomParams = {
    enabled: false,
    threshold: 0.7,
    intensity: 1.0,
    strength: 0.5,
    kernelSize: 5
};

const toonParams = {
    enabled: false,
    intensity: 5.0,
    threshold: 0.08,
};

let bloomEnabledController: dat.GUIController;
let toonEnabledController: dat.GUIController;

function updateBloomParams() {
    bloom.updateParams({
        threshold: bloomParams.threshold,
        intensity: bloomParams.intensity,
        strength: bloomParams.strength,
        kernelSize: bloomParams.kernelSize
    });
}

function setRenderer(mode: string) {
    renderer?.stop();

    // Reset Bloom and Toon states before creating a new renderer
    if (bloomEnabledController) {
        bloomParams.enabled = false;
        bloomEnabledController.setValue(false);
    }
    if (toonEnabledController) {
        toonParams.enabled = false;
        toonEnabledController.setValue(false);
    }

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
        case renderModes.clusteredOptimizedDeferred:
            renderer = new ClusteredOptimizedDeferredRenderer(stage);
            break;
    }
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', 
    clusteredDeferred: 'clustered deferred', clusteredOptimizedDeferred: 'clustered optimized deferred'};
let renderModeController = gui.add({ mode: renderModes.forwardPlus }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

// Add Bloom to GUI
const bloomFolder = gui.addFolder('Bloom Effect');
bloomEnabledController = bloomFolder.add(bloomParams, 'enabled').name('Enable').onChange(() => {
    renderer?.toggleBloom();
});
bloomFolder.add(bloomParams, 'threshold').min(0.0).max(1.0).step(0.01).name('Threshold').onChange(() => {
    updateBloomParams();
});
bloomFolder.add(bloomParams, 'intensity').min(0.0).max(5.0).step(0.1).name('Intensity').onChange(() => {
    updateBloomParams();
});
bloomFolder.add(bloomParams, 'strength').min(0.0).max(20.0).step(0.05).name('Strength').onChange(() => {
    updateBloomParams();
});
bloomFolder.add(bloomParams, 'kernelSize').min(3).max(15).step(2).name('Kernel Size').onChange(() => {
    updateBloomParams();
});

// Add Toon to GUI
const toonFolder = gui.addFolder('Toon Effect');
toonEnabledController = toonFolder.add(toonParams, 'enabled').name('Enable').onChange(() => {
    renderer?.toggleToon();
});
toonFolder.add(toonParams, 'intensity').min(2.0).max(20.0).step(1.0).name('Quantization').onChange(() => {
    toon.updateIntensity(toonParams.intensity, toonParams.threshold);
});
toonFolder.add(toonParams, 'threshold').min(0.05).max(0.2).step(0.01).name('Threshold').onChange(() => {
    toon.updateIntensity(toonParams.intensity, toonParams.threshold);
});

setRenderer(renderModeController.getValue());
updateBloomParams();

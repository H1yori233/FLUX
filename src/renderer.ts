import { Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { Bloom } from './renderers/bloom';
import { Toon } from './renderers/toon';

export var canvas: HTMLCanvasElement;
export var canvasFormat: GPUTextureFormat;
export var context: GPUCanvasContext;
export var device: GPUDevice;
export var canvasTextureView: GPUTextureView;

export var aspectRatio: number;
export const fovYDegrees = 45;

export var modelBindGroupLayout: GPUBindGroupLayout;
export var materialBindGroupLayout: GPUBindGroupLayout;

// Bloom parameters
export var bloomThresholdBuffer: GPUBuffer;
export var bloomIntensityBuffer: GPUBuffer;
export var bloomStrengthBuffer: GPUBuffer;
export var kernelSizeBuffer: GPUBuffer;

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    aspectRatio = canvas.width / canvas.height;

    if (!navigator.gpu)
    {
        let errorMessageElement = document.createElement("h1");
        errorMessageElement.textContent = "This browser doesn't support WebGPU! Try using Google Chrome.";
        errorMessageElement.style.paddingLeft = '0.4em';
        document.body.innerHTML = '';
        document.body.appendChild(errorMessageElement);
        throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
    {
        throw new Error("no appropriate GPUAdapter found");
    }

    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu")!;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    console.log("WebGPU init successsful");
    console.log("Canvas Resolution: " + canvas.width + "x" + canvas.height);
    console.log("Aspect Ratio: " + aspectRatio);

    modelBindGroupLayout = device.createBindGroupLayout({
        label: "model bind group layout",
        entries: [
            { // modelMat
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }
        ]
    });

    materialBindGroupLayout = device.createBindGroupLayout({
        label: "material bind group layout",
        entries: [
            { // diffuseTex
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            { // diffuseTexSampler
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }
        ]
    });

    // Initialize Bloom buffers
    bloomThresholdBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    bloomIntensityBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    bloomStrengthBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    kernelSizeBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
}

export const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        { // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0
        },
        { // nor
            format: "float32x3",
            offset: 12,
            shaderLocation: 1
        },
        { // uv
            format: "float32x2",
            offset: 24,
            shaderLocation: 2
        }
    ]
};

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;
    protected bloom: Bloom;
    protected toon: Toon;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;
    protected enableBloom: boolean = false;
    protected enableToon: boolean = false;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.bloom = stage.bloom;
        this.toon = stage.toon;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
        this.enableBloom = false;
        this.enableToon = false;
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    toggleBloom(): void {
        this.enableBloom = !this.enableBloom;
    }

    toggleToon(): void {
        this.enableToon = !this.enableToon;
    }

    protected abstract draw(): { encoder: GPUCommandEncoder, renderTexture?: GPUTexture, canvasTextureView: GPUTextureView };

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        const result = this.draw();
        const { encoder, renderTexture, canvasTextureView } = result;

        if (this.enableToon && renderTexture) {
            // Copy the render result to toon's render texture
            encoder.copyTextureToTexture(
                { texture: renderTexture },
                { texture: this.toon.renderTexture },
                [canvas.width, canvas.height]
            );
            this.toon.doToon(encoder, canvasTextureView);
        } else if (this.enableBloom && renderTexture) {
            // Copy the render result to bloom's render texture
            encoder.copyTextureToTexture(
                { texture: renderTexture },
                { texture: this.bloom.renderTexture },
                [canvas.width, canvas.height]
            );
            this.bloom.doBloom(encoder, canvasTextureView);
        }

        device.queue.submit([encoder.finish()]);

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}

export function updateBloomParams(params: {
    threshold: number;
    intensity: number;
    strength: number;
    kernelSize: number;
}) {
    const thresholdData = new Float32Array([params.threshold]);
    device.queue.writeBuffer(bloomThresholdBuffer, 0, thresholdData);
    
    const intensityData = new Float32Array([params.intensity]);
    device.queue.writeBuffer(bloomIntensityBuffer, 0, intensityData);
    
    const strengthData = new Float32Array([params.strength]);
    device.queue.writeBuffer(bloomStrengthBuffer, 0, strengthData);
    
    const kernelSizeData = new Uint32Array([params.kernelSize]);
    device.queue.writeBuffer(kernelSizeBuffer, 0, kernelSizeData);
}

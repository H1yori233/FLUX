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

    protected pingTexture: GPUTexture;
    protected pongTexture: GPUTexture;

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

        const textureDesc: GPUTextureDescriptor = {
            size: [canvas.width, canvas.height],
            format: canvasFormat, 
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
       };
       this.pingTexture = device.createTexture({...textureDesc, label: "ping texture"});
       this.pongTexture = device.createTexture({...textureDesc, label: "pong texture"});
   
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);

        this.pingTexture?.destroy();
        this.pongTexture?.destroy();
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
        if (!renderTexture) {
            device.queue.submit([encoder.finish()]);
            this.stats.end();
            this.prevTime = time;
            this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
            return;
        }
        
        const activeEffects = [];
        if (this.enableToon) activeEffects.push(this.toon);
        if (this.enableBloom) activeEffects.push(this.bloom);

        if (activeEffects.length === 0) {
            encoder.copyTextureToTexture(
                { texture: renderTexture },
                { texture: context.getCurrentTexture() },
                [canvas.width, canvas.height]
            );
        } else {
            let currentSourceTexture = renderTexture;
            let ping = true;

            for (let i = 0; i < activeEffects.length; i++) {
                const effect = activeEffects[i];
                const isLastEffect = (i === activeEffects.length - 1);

                // Determine the output target for this effect pass
                const destinationView = isLastEffect
                    ? canvasTextureView
                    : (ping ? this.pingTexture.createView() : this.pongTexture.createView());
                const destinationTextureForNextSource = isLastEffect
                    ? null
                    : (ping ? this.pingTexture : this.pongTexture);

                // Copy the current input data (from previous step or original render)
                // into the effect's designated input texture
                encoder.copyTextureToTexture(
                    { texture: currentSourceTexture },
                    { texture: effect.renderTexture },
                    [canvas.width, canvas.height]
                );

                // Apply the effect, rendering into the destinationView
                if (effect === this.toon) {
                    this.toon.doToon(encoder, destinationView);
                } else if (effect === this.bloom) {
                    this.bloom.doBloom(encoder, destinationView);
                }

                // Prepare for the next iteration
                if (!isLastEffect) {
                    // The texture we just rendered *to* becomes the source for the next effect
                    currentSourceTexture = destinationTextureForNextSource!;
                    ping = !ping;
                }
            }
        }

        device.queue.submit([encoder.finish()]);
        this.stats.end();
        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}

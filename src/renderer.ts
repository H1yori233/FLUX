import { Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import * as shaders from './shaders/shaders';

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

    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance"
    });
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

export const quadVertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [
        { // pos
            format: "float32x2",
            offset: 0,
            shaderLocation: 0
        }
    ]
};

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;

    bUseRenderBundles: boolean = false;
    protected quadVertexBuffer: GPUBuffer;
    protected quadIndexBuffer: GPUBuffer;
    
    // Post-processing
    protected bUsePostProcessing: boolean = false;
    protected useGrayEffect: boolean = false;
    protected useToonEffect: boolean = false;
    
    protected renderTexture: GPUTexture | null = null;
    protected renderTextureView: GPUTextureView | null = null;
    protected intermediateTexture: GPUTexture | null = null;
    protected intermediateTextureView: GPUTextureView | null = null;

    protected postProcessPipelines: Map<string, GPURenderPipeline> = new Map();
    protected postProcessBindGroupLayout: GPUBindGroupLayout | null = null;
    protected postProcessBindGroup: GPUBindGroup | null = null;
    protected intermediateBindGroup: GPUBindGroup | null = null;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));

        // Create quad buffers for fullscreen rendering
        let quadVerts = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]);
        let quadIndex = new Uint32Array([0, 1, 2, 2, 1, 3]);

        this.quadVertexBuffer = device.createBuffer({
            label: "vertex buffer",
            size: quadVerts.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.quadVertexBuffer, 0, quadVerts);

        this.quadIndexBuffer = device.createBuffer({
            label: "index buffer",
            size: quadIndex.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.quadIndexBuffer, 0, quadIndex);
    }

    protected initPostProcessing() {
        this.bUsePostProcessing = true;
        this.renderTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.renderTextureView = this.renderTexture.createView();

        // Create intermediate texture for effect chaining
        this.intermediateTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.intermediateTextureView = this.intermediateTexture.createView();

        // Create bind group layout for post-processing (using bindGroup_gbuffer)
        this.postProcessBindGroupLayout = device.createBindGroupLayout({
            label: "post process bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        // Create sampler
        const sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Create bind group for render texture
        this.postProcessBindGroup = device.createBindGroup({
            label: "post process bind group",
            layout: this.postProcessBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView!
                },
                {
                    binding: 1,
                    resource: sampler
                }
            ]
        });

        // Create bind group for intermediate texture
        this.intermediateBindGroup = device.createBindGroup({
            label: "intermediate bind group",
            layout: this.postProcessBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.intermediateTextureView!
                },
                {
                    binding: 1,
                    resource: sampler
                }
            ]
        });

        // Create post-processing pipelines for different effects
        this.createPostProcessPipeline('gray', shaders.grayFragSrc);
        this.createPostProcessPipeline('toon', shaders.toonFragSrc);
    }

    protected createPostProcessPipeline(effectName: string, fragmentShaderCode: string) {
        const pipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({
                label: `${effectName} post process pipeline layout`,
                bindGroupLayouts: [this.postProcessBindGroupLayout!]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "post process vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: device.createShaderModule({
                    label: `${effectName} post process frag shader`,
                    code: fragmentShaderCode
                }),
                targets: [
                    {
                        format: canvasFormat
                    }
                ]
            }
        });
        this.postProcessPipelines.set(effectName, pipeline);
    }

    setPostProcessingEffects(useGray: boolean, useToon: boolean) {
        this.useGrayEffect = useGray;
        this.useToonEffect = useToon;
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract drawScene(targetView: GPUTextureView): void;

    protected draw(): void {
        const canvasTextureView = context.getCurrentTexture().createView();
        
        // Determine render target
        const targetView = this.bUsePostProcessing ? this.renderTextureView! : canvasTextureView;
        
        // Render scene to target
        this.drawScene(targetView);
        
        // Post-processing passes if enabled
        if (this.bUsePostProcessing && this.postProcessBindGroup && (this.useGrayEffect || this.useToonEffect)) {
            const encoder = device.createCommandEncoder();
            
            let currentInputBindGroup = this.postProcessBindGroup;
            let currentOutputView = canvasTextureView;
            
            // If both effects are enabled, we need to chain them
            if (this.useGrayEffect && this.useToonEffect) {
                // First pass: gray effect to intermediate texture
                const grayPipeline = this.postProcessPipelines.get('gray');
                if (grayPipeline && this.intermediateTextureView) {
                    const grayPass = encoder.beginRenderPass({
                        label: "gray post process pass",
                        colorAttachments: [
                            {
                                view: this.intermediateTextureView,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    grayPass.setPipeline(grayPipeline);
                    grayPass.setBindGroup(0, currentInputBindGroup);
                    grayPass.draw(3);
                    grayPass.end();
                    
                    // Update for second pass
                    currentInputBindGroup = this.intermediateBindGroup!;
                }
                
                // Second pass: toon effect to canvas
                const toonPipeline = this.postProcessPipelines.get('toon');
                if (toonPipeline) {
                    const toonPass = encoder.beginRenderPass({
                        label: "toon post process pass",
                        colorAttachments: [
                            {
                                view: canvasTextureView,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    toonPass.setPipeline(toonPipeline);
                    toonPass.setBindGroup(0, currentInputBindGroup);
                    toonPass.draw(3);
                    toonPass.end();
                }
            } else {
                // Single effect
                const effectName = this.useGrayEffect ? 'gray' : 'toon';
                const pipeline = this.postProcessPipelines.get(effectName);
                if (pipeline) {
                    const postProcessPass = encoder.beginRenderPass({
                        label: `${effectName} post process pass`,
                        colorAttachments: [
                            {
                                view: canvasTextureView,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    postProcessPass.setPipeline(pipeline);
                    postProcessPass.setBindGroup(0, currentInputBindGroup);
                    postProcessPass.draw(3);
                    postProcessPass.end();
                }
            }
            
            device.queue.submit([encoder.finish()]);
        }
    }

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        this.draw();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}

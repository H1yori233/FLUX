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
    protected useBloomEffect: boolean = false;
    
    protected renderTexture: GPUTexture | null = null;
    protected renderTextureView: GPUTextureView | null = null;
    protected intermediateTexture: GPUTexture | null = null;
    protected intermediateTextureView: GPUTextureView | null = null;
    protected brightTexture: GPUTexture | null = null;
    protected brightTextureView: GPUTextureView | null = null;
    protected blurredBrightTexture: GPUTexture | null = null;
    protected blurredBrightTextureView: GPUTextureView | null = null;

    protected postProcessPipelines: Map<string, GPURenderPipeline> = new Map();
    protected postProcessBindGroupLayout: GPUBindGroupLayout | null = null;
    protected postProcessBindGroup: GPUBindGroup | null = null;
    protected intermediateBindGroup: GPUBindGroup | null = null;
    
    // Gaussian blur specific resources
    protected blurBindGroupLayout: GPUBindGroupLayout | null = null;
    protected horizontalBlurBindGroup: GPUBindGroup | null = null;
    protected verticalBlurBindGroup: GPUBindGroup | null = null;
    protected horizontalUniformBuffer: GPUBuffer | null = null;
    protected verticalUniformBuffer: GPUBuffer | null = null;
    
    // Bloom specific resources
    protected extractBrightnessBindGroupLayout: GPUBindGroupLayout | null = null;
    protected extractBrightnessBindGroup: GPUBindGroup | null = null;
    protected blendBindGroupLayout: GPUBindGroupLayout | null = null;
    protected blendBindGroup: GPUBindGroup | null = null;
    protected thresholdBuffer: GPUBuffer | null = null;
    protected intensityBuffer: GPUBuffer | null = null;
    protected strengthBuffer: GPUBuffer | null = null;
    
    // Toon specific resources
    protected toonBindGroupLayout: GPUBindGroupLayout | null = null;
    protected toonBindGroup: GPUBindGroup | null = null;
    protected toonLevelsBuffer: GPUBuffer | null = null;
    protected toonEdgeThresholdBuffer: GPUBuffer | null = null;
    protected toonEdgeIntensityBuffer: GPUBuffer | null = null;
    
    // Bloom parameters
    protected bloomThreshold: number = 0.6;
    protected bloomIntensity: number = 1.0;
    protected bloomStrength: number = 0.5;
    
    // Toon parameters
    protected toonLevels: number = 4.0;
    protected toonEdgeThreshold: number = 0.15;
    protected toonEdgeIntensity: number = 1.0;

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
        
        // Create bright texture for bloom
        this.brightTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.brightTextureView = this.brightTexture.createView();
        
        // Create blurred bright texture for bloom
        this.blurredBrightTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.blurredBrightTextureView = this.blurredBrightTexture.createView();

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
        
        // Initialize Gaussian blur resources
        this.initGaussianBlur(sampler);
        
        // Initialize Bloom resources
        this.initBloom(sampler);
        
        // Initialize Toon resources
        this.initToon(sampler);
    }
    
    protected initGaussianBlur(sampler: GPUSampler) {
        // Create bind group layout for Gaussian blur
        this.blurBindGroupLayout = device.createBindGroupLayout({
            label: "gaussian blur bind group layout",
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
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        
        // Create uniform buffers for blur direction
        this.horizontalUniformBuffer = device.createBuffer({
            label: "horizontal blur uniform",
            size: 4, // u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.horizontalUniformBuffer, 0, new Uint32Array([1])); // 1 for horizontal
        
        this.verticalUniformBuffer = device.createBuffer({
            label: "vertical blur uniform",
            size: 4, // u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.verticalUniformBuffer, 0, new Uint32Array([0])); // 0 for vertical
        
        // Create bind groups for horizontal and vertical blur passes
        this.horizontalBlurBindGroup = device.createBindGroup({
            label: "horizontal blur bind group",
            layout: this.blurBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView!
                },
                {
                    binding: 1,
                    resource: sampler
                },
                {
                    binding: 2,
                    resource: { buffer: this.horizontalUniformBuffer }
                }
            ]
        });
        
        this.verticalBlurBindGroup = device.createBindGroup({
            label: "vertical blur bind group",
            layout: this.blurBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.intermediateTextureView!
                },
                {
                    binding: 1,
                    resource: sampler
                },
                {
                    binding: 2,
                    resource: { buffer: this.verticalUniformBuffer }
                }
            ]
        });
        
        // Create blur pipeline
        const blurPipeline = device.createRenderPipeline({
            label: "gaussian blur pipeline",
            layout: device.createPipelineLayout({
                label: "gaussian blur pipeline layout",
                bindGroupLayouts: [this.blurBindGroupLayout]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "blur vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: device.createShaderModule({
                    label: "blur fragment shader",
                    code: shaders.gaussianBlurFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-strip"
            }
        });
        
        this.postProcessPipelines.set('gaussian_blur', blurPipeline);
    }

    protected initBloom(sampler: GPUSampler) {
        // Create uniform buffers for bloom parameters
        this.thresholdBuffer = device.createBuffer({
            label: "bloom threshold uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.thresholdBuffer!, 0, new Float32Array([this.bloomThreshold]));
        
        this.intensityBuffer = device.createBuffer({
            label: "bloom intensity uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.intensityBuffer!, 0, new Float32Array([this.bloomIntensity]));
        
        this.strengthBuffer = device.createBuffer({
            label: "bloom strength uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.strengthBuffer!, 0, new Float32Array([this.bloomStrength]));
        
        // Create bind group layout for extract brightness
        this.extractBrightnessBindGroupLayout = device.createBindGroupLayout({
            label: "extract brightness bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });
        
        // Create bind group for extract brightness
        this.extractBrightnessBindGroup = device.createBindGroup({
            label: "extract brightness bind group",
            layout: this.extractBrightnessBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView!
                },
                {
                    binding: 1,
                    resource: { buffer: this.thresholdBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.intensityBuffer }
                },
                {
                    binding: 3,
                    resource: sampler
                }
            ]
        });
        
        // Create bind group layout for blend
        this.blendBindGroupLayout = device.createBindGroupLayout({
            label: "blend bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        
        // Create bind group for blend
        this.blendBindGroup = device.createBindGroup({
            label: "blend bind group",
            layout: this.blendBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView!
                },
                {
                    binding: 1,
                    resource: this.blurredBrightTextureView!
                },
                {
                    binding: 2,
                    resource: sampler
                },
                {
                    binding: 3,
                    resource: { buffer: this.strengthBuffer }
                }
            ]
        });
        
        // Create extract brightness pipeline
        const extractBrightnessPipeline = device.createRenderPipeline({
            label: "extract brightness pipeline",
            layout: device.createPipelineLayout({
                label: "extract brightness pipeline layout",
                bindGroupLayouts: [this.extractBrightnessBindGroupLayout]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "extract brightness vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: device.createShaderModule({
                    label: "extract brightness fragment shader",
                    code: shaders.extractBrightnessFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-strip"
            }
        });
        
        // Create blend pipeline
        const blendPipeline = device.createRenderPipeline({
            label: "blend pipeline",
            layout: device.createPipelineLayout({
                label: "blend pipeline layout",
                bindGroupLayouts: [this.blendBindGroupLayout]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "blend vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: device.createShaderModule({
                    label: "blend fragment shader",
                    code: shaders.blendFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-strip"
            }
        });
        
        this.postProcessPipelines.set('extract_brightness', extractBrightnessPipeline);
        this.postProcessPipelines.set('blend', blendPipeline);
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

    protected initToon(sampler: GPUSampler) {
        this.toonLevelsBuffer = device.createBuffer({
            label: "toon levels uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.toonLevelsBuffer, 0, new Float32Array([this.toonLevels]));
        
        this.toonEdgeThresholdBuffer = device.createBuffer({
            label: "toon edge threshold uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.toonEdgeThresholdBuffer, 0, new Float32Array([this.toonEdgeThreshold]));
        
        this.toonEdgeIntensityBuffer = device.createBuffer({
            label: "toon edge intensity uniform",
            size: 4, // f32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.toonEdgeIntensityBuffer, 0, new Float32Array([this.toonEdgeIntensity]));
        
        // 创建卡通渲染的bind group layout
        this.toonBindGroupLayout = device.createBindGroupLayout({
            label: "toon bind group layout",
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
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        
        // 创建卡通渲染的bind group
        this.toonBindGroup = device.createBindGroup({
            label: "toon bind group",
            layout: this.toonBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView!
                },
                {
                    binding: 1,
                    resource: sampler
                },
                {
                    binding: 2,
                    resource: { buffer: this.toonLevelsBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.toonEdgeThresholdBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.toonEdgeIntensityBuffer }
                }
            ]
        });
        
        // 创建卡通渲染的pipeline
        const toonPipeline = device.createRenderPipeline({
            label: "toon pipeline",
            layout: device.createPipelineLayout({
                label: "toon pipeline layout",
                bindGroupLayouts: [this.toonBindGroupLayout]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "toon vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: device.createShaderModule({
                    label: "toon fragment shader",
                    code: shaders.toonFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-strip"
            }
        });
        
        this.postProcessPipelines.set('toon', toonPipeline);
    }

    setPostProcessingEffects(useGray: boolean, useToon: boolean, useBloom: boolean = false) {
        this.useGrayEffect = useGray;
        this.useToonEffect = useToon;
        this.useBloomEffect = useBloom;
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
        if (this.bUsePostProcessing && this.postProcessBindGroup) {
            const encoder = device.createCommandEncoder();
            
            let currentInputBindGroup = this.postProcessBindGroup;
            let currentOutputView = canvasTextureView;
            
            // Apply Bloom if enabled
            if (this.useBloomEffect && this.brightTextureView && this.blurredBrightTextureView && 
                this.extractBrightnessBindGroup && this.blendBindGroup) {
                
                // 1. Extract bright areas
                const extractBrightnessPipeline = this.postProcessPipelines.get('extract_brightness');
                if (extractBrightnessPipeline) {
                    const extractPass = encoder.beginRenderPass({
                        label: "extract brightness pass",
                        colorAttachments: [
                            {
                                view: this.brightTextureView,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    
                    extractPass.setPipeline(extractBrightnessPipeline);
                    extractPass.setBindGroup(0, this.extractBrightnessBindGroup);
                    extractPass.draw(4); // quad has 4 vertices
                    extractPass.end();
                }
                
                // 2. Apply Gaussian blur to bright texture
                // 2.1 Horizontal blur
                const blurPipeline = this.postProcessPipelines.get('gaussian_blur');
                if (blurPipeline && this.horizontalBlurBindGroup && this.verticalBlurBindGroup) {
                    // Update horizontal blur bind group to use bright texture
                    this.horizontalBlurBindGroup = device.createBindGroup({
                        label: "horizontal blur bind group",
                        layout: this.blurBindGroupLayout!,
                        entries: [
                            {
                                binding: 0,
                                resource: this.brightTextureView
                            },
                            {
                                binding: 1,
                                resource: device.createSampler({
                                    magFilter: 'linear',
                                    minFilter: 'linear'
                                })
                            },
                            {
                                binding: 2,
                                resource: { buffer: this.horizontalUniformBuffer! }
                            }
                        ]
                    });
                    
                    const horizontalPass = encoder.beginRenderPass({
                        label: "horizontal blur pass",
                        colorAttachments: [
                            {
                                view: this.intermediateTextureView!,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    
                    horizontalPass.setPipeline(blurPipeline);
                    horizontalPass.setBindGroup(0, this.horizontalBlurBindGroup);
                    horizontalPass.draw(4);
                    horizontalPass.end();
                    
                    // 2.2 Vertical blur
                    // Update vertical blur bind group to use intermediate texture
                    this.verticalBlurBindGroup = device.createBindGroup({
                        label: "vertical blur bind group",
                        layout: this.blurBindGroupLayout!,
                        entries: [
                            {
                                binding: 0,
                                resource: this.intermediateTextureView!
                            },
                            {
                                binding: 1,
                                resource: device.createSampler({
                                    magFilter: 'linear',
                                    minFilter: 'linear'
                                })
                            },
                            {
                                binding: 2,
                                resource: { buffer: this.verticalUniformBuffer! }
                            }
                        ]
                    });
                    
                    const verticalPass = encoder.beginRenderPass({
                        label: "vertical blur pass",
                        colorAttachments: [
                            {
                                view: this.blurredBrightTextureView,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    
                    verticalPass.setPipeline(blurPipeline);
                    verticalPass.setBindGroup(0, this.verticalBlurBindGroup);
                    verticalPass.draw(4);
                    verticalPass.end();
                }
                
                // 3. Blend original image with blurred bright texture
                const blendPipeline = this.postProcessPipelines.get('blend');
                if (blendPipeline) {
                    const finalTarget = (this.useGrayEffect || this.useToonEffect) ? this.intermediateTextureView! : canvasTextureView;
                    
                    const blendPass = encoder.beginRenderPass({
                        label: "blend pass",
                        colorAttachments: [
                            {
                                view: finalTarget,
                                clearValue: [0, 0, 0, 0],
                                loadOp: "clear",
                                storeOp: "store"
                            }
                        ]
                    });
                    
                    blendPass.setPipeline(blendPipeline);
                    blendPass.setBindGroup(0, this.blendBindGroup);
                    blendPass.draw(4);
                    blendPass.end();
                    
                    // If we have other effects, use the intermediate texture for further processing
                    if (this.useGrayEffect || this.useToonEffect) {
                        currentInputBindGroup = this.intermediateBindGroup!;
                    } else {
                        // We're done if no other effects
                        device.queue.submit([encoder.finish()]);
                        return;
                    }
                }
            }
            
            // Handle other effects if enabled
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
                    grayPass.draw(4);
                    grayPass.end();
                    
                    // Update for second pass
                    currentInputBindGroup = this.intermediateBindGroup!;
                }
                
                // Second pass: toon effect to canvas
                const toonPipeline = this.postProcessPipelines.get('toon');
                if (toonPipeline && this.toonBindGroup) {
                    // Create custom bind group for the current input
                    const toonBindGroup = this.createToonBindGroupForCurrentInput(currentInputBindGroup);
                    
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
                    toonPass.setBindGroup(0, toonBindGroup);
                    toonPass.draw(4);
                    toonPass.end();
                }
            } else if (this.useGrayEffect || this.useToonEffect) {
                // Single effect
                if (this.useGrayEffect) {
                    const pipeline = this.postProcessPipelines.get('gray');
                    if (pipeline) {
                        const postProcessPass = encoder.beginRenderPass({
                            label: "gray post process pass",
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
                        postProcessPass.draw(4);
                        postProcessPass.end();
                    }
                } else if (this.useToonEffect && this.toonBindGroup) {
                    const pipeline = this.postProcessPipelines.get('toon');
                    if (pipeline) {
                        // Create custom bind group for the current input
                        const toonBindGroup = this.createToonBindGroupForCurrentInput(currentInputBindGroup);
                        
                        const postProcessPass = encoder.beginRenderPass({
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
                        postProcessPass.setPipeline(pipeline);
                        postProcessPass.setBindGroup(0, toonBindGroup);
                        postProcessPass.draw(4);
                        postProcessPass.end();
                    }
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

    setBloomParameters(threshold: number, intensity: number, strength: number) {
        this.bloomThreshold = threshold;
        this.bloomIntensity = intensity;
        this.bloomStrength = strength;
        
        if (this.thresholdBuffer && this.intensityBuffer && this.strengthBuffer) {
            device.queue.writeBuffer(this.thresholdBuffer, 0, new Float32Array([threshold]));
            device.queue.writeBuffer(this.intensityBuffer, 0, new Float32Array([intensity]));
            device.queue.writeBuffer(this.strengthBuffer, 0, new Float32Array([strength]));
        }
    }
    
    setToonParameters(levels: number, edgeThreshold: number, edgeIntensity: number) {
        this.toonLevels = levels;
        this.toonEdgeThreshold = edgeThreshold;
        this.toonEdgeIntensity = edgeIntensity;
        
        if (this.toonLevelsBuffer && this.toonEdgeThresholdBuffer && this.toonEdgeIntensityBuffer) {
            device.queue.writeBuffer(this.toonLevelsBuffer, 0, new Float32Array([levels]));
            device.queue.writeBuffer(this.toonEdgeThresholdBuffer, 0, new Float32Array([edgeThreshold]));
            device.queue.writeBuffer(this.toonEdgeIntensityBuffer, 0, new Float32Array([edgeIntensity]));
        }
    }

    protected createToonBindGroupForCurrentInput(currentInputBindGroup: GPUBindGroup): GPUBindGroup {
        return device.createBindGroup({
            label: "toon bind group",
            layout: this.toonBindGroupLayout!,
            entries: [
                {
                    binding: 0,
                    resource: currentInputBindGroup === this.postProcessBindGroup 
                        ? this.renderTextureView!
                        : this.intermediateTextureView!
                },
                {
                    binding: 1,
                    resource: device.createSampler({
                        magFilter: 'linear',
                        minFilter: 'linear'
                    })
                },
                {
                    binding: 2,
                    resource: { buffer: this.toonLevelsBuffer! }
                },
                {
                    binding: 3,
                    resource: { buffer: this.toonEdgeThresholdBuffer! }
                },
                {
                    binding: 4,
                    resource: { buffer: this.toonEdgeIntensityBuffer! }
                }
            ]
        });
    }
}

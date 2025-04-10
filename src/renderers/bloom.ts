import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';

export class Bloom {
    renderTexture: GPUTexture;
    renderTextureView: GPUTextureView;
    
    // Bloom parameters
    thresholdBuffer: GPUBuffer;
    intensityBuffer: GPUBuffer;
    strengthBuffer: GPUBuffer; // Assuming strength is also needed later for blur passes
    kernelSizeBuffer: GPUBuffer; // Assuming kernelSize is also needed later for blur passes
    horizontalBuffer: GPUBuffer;

    // --- Brightness Extract ---
    brightnessExtractGroupLayout: GPUBindGroupLayout;
    brightnessExtractGroup: GPUBindGroup;
    brightnessExtractPipeline: GPURenderPipeline;
    brightnessExtractTexture: GPUTexture;
    brightnessExtractTextureView: GPUTextureView;

    // --- Gaussian Blur ---
    blurGroupA: GPUBindGroup;
    blurGroupB: GPUBindGroup;
    blurGroupLayout: GPUBindGroupLayout;
    blurPipeline: GPURenderPipeline;
    blurTextureA: GPUTexture;
    blurTextureAView: GPUTextureView;
    blurTextureB: GPUTexture;
    blurTextureBView: GPUTextureView;
    sampler: GPUSampler;

    // --- Blend ---
    blendGroup : GPUBindGroup;
    blendGroupLayout: GPUBindGroupLayout;
    blendPipeline: GPURenderPipeline;

    constructor() {
        this.renderTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        this.renderTextureView = this.renderTexture.createView();
        
        // Initialize Bloom buffers
        this.thresholdBuffer = renderer.device.createBuffer({
            label: "bloom threshold buffer",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.thresholdBuffer, 0, new Float32Array([0.8])); // Default threshold

        this.intensityBuffer = renderer.device.createBuffer({
            label: "bloom intensity buffer",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.intensityBuffer, 0, new Float32Array([1.0])); // Default intensity

        this.strengthBuffer = renderer.device.createBuffer({
            label: "bloom strength buffer",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.strengthBuffer, 0, new Float32Array([1.0])); // Default strength

        this.kernelSizeBuffer = renderer.device.createBuffer({
            label: "bloom kernel size buffer",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.kernelSizeBuffer, 0, new Uint32Array([5])); // Default kernel size
        this.horizontalBuffer = renderer.device.createBuffer({ 
            size: 4, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST 
        });

        // --- Brightness Extract Resources ---
        this.brightnessExtractTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
        });
        this.brightnessExtractTextureView = this.brightnessExtractTexture.createView();

        this.brightnessExtractGroupLayout = renderer.device.createBindGroupLayout({
            label: "brightness extract bind group layout",
            entries: [
                { // Input
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Threshold
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // Intensity
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        
        this.brightnessExtractGroup = renderer.device.createBindGroup({
            label: "brightness extract bind group",
            layout: this.brightnessExtractGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView
                },
                {
                    binding: 1,
                    resource: { buffer: this.thresholdBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.intensityBuffer }
                }
            ]
        });
        
        this.brightnessExtractPipeline = renderer.device.createRenderPipeline({
            label: "brightness extract pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "brightness extract pipeline layout",
                bindGroupLayouts: [
                    this.brightnessExtractGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: []
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "extract brightness fragment shader",
                    code: shaders.extractBrightnessFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });

        // --- Gaussian Blur Resources ---
        this.blurTextureA = renderer.device.createTexture({
            label: "blur ping texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
        });
        this.blurTextureAView = this.blurTextureA.createView();
        this.blurTextureB = renderer.device.createTexture({
            label: "blur pong texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
        });
        this.blurTextureBView = this.blurTextureB.createView();
        this.sampler = renderer.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

        this.blurGroupLayout = renderer.device.createBindGroupLayout({
            label: "gaussian blur BGL",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },                   // Input Texture View
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },                   // Sampler
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },   // horizontal
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },   // kernelSize
            ]
        });
        this.blurGroupA = renderer.device.createBindGroup({
            label: "blur BG A (horizontal)",
            layout: this.blurGroupLayout,
            entries: [
                { binding: 0, resource: this.brightnessExtractTextureView }, // Input is brightness result
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.horizontalBuffer } },
                { binding: 3, resource: { buffer: this.kernelSizeBuffer } },
            ]
        });
        this.blurGroupB = renderer.device.createBindGroup({
            label: "blur BG B (vertical)",
            layout: this.blurGroupLayout,
            entries: [
                { binding: 0, resource: this.blurTextureAView }, // Input is horizontal blur result
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.horizontalBuffer } },
                { binding: 3, resource: { buffer: this.kernelSizeBuffer } },
            ]
        });

        this.blurPipeline = renderer.device.createRenderPipeline({
            label: "gaussian blur pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [this.blurGroupLayout] }),
            vertex: { 
                module: renderer.device.createShaderModule({ code: shaders.clusteredDeferredFullscreenVertSrc }),
                buffers: []
            },
            fragment: {
                module: renderer.device.createShaderModule({ code: shaders.gaussianBlurFragSrc }), // Make sure shaders.ts exports this
                targets: [{ format: renderer.canvasFormat }]
            }
        });

        // --- Blend Resources ---
        this.blendGroupLayout = renderer.device.createBindGroupLayout({
            label: "blend BGL",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },   // Input Texture View
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },   // Blur Texture View
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },   // Sampler
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            ]
        });
        this.blendGroup = renderer.device.createBindGroup({
            label: "blend BG",
            layout: this.blendGroupLayout,
            entries: [
                { binding: 0, resource: this.renderTextureView },
                { binding: 1, resource: this.blurTextureBView },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: { buffer: this.strengthBuffer } },
            ]
        });

        this.blendPipeline = renderer.device.createRenderPipeline({
            label: "blend pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [this.blendGroupLayout] }),
            vertex: { 
                module: renderer.device.createShaderModule({ code: shaders.clusteredDeferredFullscreenVertSrc }),
                buffers: []
            },
            fragment: {
                module: renderer.device.createShaderModule({ code: shaders.blendFragSrc }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    // Update Bloom parameters
    updateParams(params: {
        threshold: number;
        intensity: number;
        strength: number;
        kernelSize: number;
    }) {
        renderer.device.queue.writeBuffer(this.thresholdBuffer, 0, new Float32Array([params.threshold]));
        renderer.device.queue.writeBuffer(this.intensityBuffer, 0, new Float32Array([params.intensity]));
        renderer.device.queue.writeBuffer(this.strengthBuffer, 0, new Float32Array([params.strength]));
        renderer.device.queue.writeBuffer(this.kernelSizeBuffer, 0, new Uint32Array([params.kernelSize]));
    }

    doBloom(encoder: GPUCommandEncoder, outputView: GPUTextureView) {
        // --- Pass 1: Extract Bright ---
        const brightnessExtractPass = encoder.beginRenderPass({
            label: "brightness extract pass",
            colorAttachments: [{
                // view: outputView,
                view: this.brightnessExtractTextureView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        
        brightnessExtractPass.setPipeline(this.brightnessExtractPipeline);
        brightnessExtractPass.setBindGroup(0, this.brightnessExtractGroup);
        brightnessExtractPass.draw(3);
        brightnessExtractPass.end();

        // --- Pass 2: Gaussian Blur ---
        renderer.device.queue.writeBuffer(this.horizontalBuffer, 0, new Uint32Array([1])); // Set horizontal = true
        const horizontalBlurPass = encoder.beginRenderPass({
            label: "horizontal blur pass",
            colorAttachments: [{
                view: this.blurTextureAView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        horizontalBlurPass.setPipeline(this.blurPipeline);
        horizontalBlurPass.setBindGroup(0, this.blurGroupA);
        horizontalBlurPass.draw(3);
        horizontalBlurPass.end();

        renderer.device.queue.writeBuffer(this.horizontalBuffer, 0, new Uint32Array([0])); // Set horizontal = false
        const verticalBlurPass = encoder.beginRenderPass({
            label: "vertical blur pass",
            colorAttachments: [{
                // view: outputView,
                view: this.blurTextureBView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        verticalBlurPass.setPipeline(this.blurPipeline);
        verticalBlurPass.setBindGroup(0, this.blurGroupB);
        verticalBlurPass.draw(3);
        verticalBlurPass.end();

        // --- Pass 3: Blend ---
        const blendPass = encoder.beginRenderPass({
            label: "blend pass",
            colorAttachments: [{
                view: outputView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        blendPass.setPipeline(this.blendPipeline);
        blendPass.setBindGroup(0, this.blendGroup);
        blendPass.draw(3);
        blendPass.end();
    }
}

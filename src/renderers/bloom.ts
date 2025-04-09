import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';

export class Bloom {
    renderTexture: GPUTexture;
    renderTextureView: GPUTextureView;
    
    brightnessExtractGroupLayout: GPUBindGroupLayout;
    brightnessExtractGroup: GPUBindGroup;
    brightnessExtractPipeline: GPURenderPipeline;
    brightnessExtractTexture: GPUTexture;
    brightnessExtractTextureView: GPUTextureView;

    blurComputeLayout: GPUBindGroupLayout;
    blurHorizontalComputeGroup: GPUBindGroup;
    blurVerticalComputeGroup: GPUBindGroup;
    blurComputePipeline: GPUComputePipeline;
    horizontalBlurTexture: GPUTexture;
    horizontalBlurTextureView: GPUTextureView;
    verticalBlurTexture: GPUTexture;
    verticalBlurTextureView: GPUTextureView;
    horizontalFlagBuffer: GPUBuffer;
    verticalFlagBuffer: GPUBuffer;

    blendPipeline: GPURenderPipeline;
    blendGroupLayout: GPUBindGroupLayout;

    constructor() {
        this.renderTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        this.renderTextureView = this.renderTexture.createView();
        
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
                    resource: { buffer: renderer.bloomThresholdBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: renderer.bloomIntensityBuffer }
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
        
        this.brightnessExtractTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING
        });
        this.brightnessExtractTextureView = this.brightnessExtractTexture.createView();

        // Blur
        this.horizontalBlurTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
        });
        this.horizontalBlurTextureView = this.horizontalBlurTexture.createView();

        this.verticalBlurTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
        });
        this.verticalBlurTextureView = this.verticalBlurTexture.createView();
        
        // flag
        this.horizontalFlagBuffer = renderer.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.verticalFlagBuffer = renderer.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.horizontalFlagBuffer, 0, new Uint32Array([1])); // 1表示水平
        renderer.device.queue.writeBuffer(this.verticalFlagBuffer, 0, new Uint32Array([0])); // 0表示垂直

        this.blurComputeLayout = renderer.device.createBindGroupLayout({
            label: "blur compute bind group layout",
            entries: [
                { // Input texture
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "float" }
                },
                { // Direction flag (horizontal or vertical)
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // Kernel size
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // Output texture
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: renderer.canvasFormat
                    }
                }
            ]
        });

        this.blurHorizontalComputeGroup = renderer.device.createBindGroup({
            label: "horizontal blur compute bind group",
            layout: this.blurComputeLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.brightnessExtractTextureView
                },
                {
                    binding: 1, 
                    resource: { buffer: this.horizontalFlagBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: renderer.kernelSizeBuffer }
                },
                {
                    binding: 3,
                    resource: this.horizontalBlurTextureView
                }
            ]
        });
        this.blurVerticalComputeGroup = renderer.device.createBindGroup({
            label: "vertical blur compute bind group",
            layout: this.blurComputeLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.horizontalBlurTextureView
                },
                {
                    binding: 1,
                    resource: { buffer: this.verticalFlagBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: renderer.kernelSizeBuffer }
                },
                {
                    binding: 3,
                    resource: this.verticalBlurTextureView
                }
            ]
        });

        this.blurComputePipeline = renderer.device.createComputePipeline({
            label: "gaussian blur compute pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "gaussian blur compute pipeline layout",
                bindGroupLayouts: [
                    this.blurComputeLayout
                ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "gaussian blur compute shader",
                    code: shaders.gaussianBlurComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.blendGroupLayout = renderer.device.createBindGroupLayout({
            label: "blend bind group layout",
            entries: [
                { // Bloom result texture
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Original scene texture
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Bloom strength uniform
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.blendPipeline = renderer.device.createRenderPipeline({
            label: "blend pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "blend pipeline layout",
                bindGroupLayouts: [
                    this.blendGroupLayout
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
                    label: "blend fragment shader",
                    code: shaders.blendFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });
    }

    doBloom(encoder: GPUCommandEncoder, outputView: GPUTextureView) {
        const brightnessExtractPass = encoder.beginRenderPass({
            label: "brightness extract pass",
            colorAttachments: [{
                view: this.brightnessExtractTextureView,
                // view: outputView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        
        brightnessExtractPass.setPipeline(this.brightnessExtractPipeline);
        brightnessExtractPass.setBindGroup(0, this.brightnessExtractGroup);
        brightnessExtractPass.draw(4);
        brightnessExtractPass.end();

        const horizontalBlurPass = encoder.beginComputePass({
            label: "horizontal blur compute pass"
        });
        
        horizontalBlurPass.setPipeline(this.blurComputePipeline);
        horizontalBlurPass.setBindGroup(0, this.blurHorizontalComputeGroup);
        
        const workgroupCountX = Math.ceil(renderer.canvas.width / shaders.constants.gaussianBlurWorkgroupSize);
        const workgroupCountY = Math.ceil(renderer.canvas.height / shaders.constants.gaussianBlurWorkgroupSize);
        horizontalBlurPass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
        horizontalBlurPass.end();

        const verticalBlurPass = encoder.beginComputePass({
            label: "vertical blur compute pass"
        });
        
        verticalBlurPass.setPipeline(this.blurComputePipeline);
        verticalBlurPass.setBindGroup(0, this.blurVerticalComputeGroup);
        verticalBlurPass.dispatchWorkgroups(workgroupCountX, workgroupCountY);
        verticalBlurPass.end();
        
        // 为当前帧创建混合绑定组
        // 注意：我们使用的渲染纹理视图应该包含原始场景
        // 而verticalBlurTextureView包含模糊后的高亮区域
        const blendGroup = renderer.device.createBindGroup({
            label: "blend bind group",
            layout: this.blendGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.verticalBlurTextureView
                },
                {
                    binding: 1,
                    resource: this.renderTextureView
                },
                {
                    binding: 2,
                    resource: { buffer: renderer.bloomStrengthBuffer }
                }
            ]
        });
        
        // 最终混合通道
        const finalBlendPass = encoder.beginRenderPass({
            label: "final blend pass",
            colorAttachments: [{
                view: outputView,
                clearValue: [0, 0, 0, 0],
                loadOp: "load", // 保留之前渲染的内容
                storeOp: "store"
            }]
        });
        
        finalBlendPass.setPipeline(this.blendPipeline);
        finalBlendPass.setBindGroup(0, blendGroup);
        finalBlendPass.draw(4); // 绘制全屏四边形
        finalBlendPass.end();
    }
}

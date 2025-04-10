import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';

export class Toon {
    renderTexture: GPUTexture;
    renderTextureView: GPUTextureView;
    
    toonPipeline: GPURenderPipeline;
    toonGroupLayout: GPUBindGroupLayout;
    toonGroup: GPUBindGroup;
    
    intensityBuffer: GPUBuffer;
    thresholdBuffer: GPUBuffer;

    constructor() {
        this.renderTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        this.renderTextureView = this.renderTexture.createView();
        
        // Create uniform buffer
        this.intensityBuffer = renderer.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.intensityBuffer, 0, new Float32Array([5.0]));
        this.thresholdBuffer = renderer.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.thresholdBuffer, 0, new Float32Array([0.08]));

        // Create toon bind group layout
        this.toonGroupLayout = renderer.device.createBindGroupLayout({
            label: "toon bind group layout",
            entries: [
                { // Input texture
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                { // Intensity
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // Threshold
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });
        
        // Create toon bind group
        this.toonGroup = renderer.device.createBindGroup({
            label: "toon bind group",
            layout: this.toonGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.renderTextureView
                },
                {
                    binding: 1,
                    resource: { buffer: this.intensityBuffer }
                }
                ,
                {
                    binding: 2,
                    resource: { buffer: this.thresholdBuffer }
                }
            ]
        });
        
        // Create toon render pipeline
        this.toonPipeline = renderer.device.createRenderPipeline({
            label: "toon pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "toon pipeline layout",
                bindGroupLayouts: [
                    this.toonGroupLayout
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
                    label: "toon fragment shader",
                    code: shaders.toonFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });
    }

    // Update the toon intensity parameter
    updateIntensity(intensity: number, threshold: number) {
        renderer.device.queue.writeBuffer(this.intensityBuffer, 0, new Float32Array([intensity]));
        renderer.device.queue.writeBuffer(this.thresholdBuffer, 0, new Float32Array([threshold]));
    }

    // Apply toon effect
    doToon(encoder: GPUCommandEncoder, outputView: GPUTextureView) {
        const toonPass = encoder.beginRenderPass({
            label: "toon pass",
            colorAttachments: [{
                view: outputView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        
        toonPass.setPipeline(this.toonPipeline);
        toonPass.setBindGroup(0, this.toonGroup);
        toonPass.draw(4);
        toonPass.end();
    }
}

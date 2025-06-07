import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredVisibilityRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    // G-buffer textures and related views
    gBufferTextures: {
        pack: GPUTexture;
    };
    gBufferTextureViews: {
        pack: GPUTextureView;
    };

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;
    
    gBufferRenderBundle: GPURenderBundle;
    fullscreenRenderBundle: GPURenderBundle;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });
        
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        // Create G-buffer textures
        const textureSize = {
            width: renderer.canvas.width,
            height: renderer.canvas.height
        };
        
        this.gBufferTextures = {
            pack: renderer.device.createTexture({
                label: "pack G-buffer",
                size: textureSize,
                format: "rgba32uint",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
        };
        this.gBufferTextureViews = {
            pack: this.gBufferTextures.pack.createView()
        };
        
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                { // pack
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "uint" }
                }
            ]
        });
        
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferTextureViews.pack
                }
            ]
        });
        
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "G-buffer render pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vertex shader",
                    code: shaders.naiveVertSrc  // Reuse naive vertex shader
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer fragment shader",
                    code: shaders.clusteredDeferredOptimizationFragSrc
                }),
                targets: [
                    { format: "rgba32uint" }
                ]
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            },
            primitive: {
                cullMode: "back"
            }
        });
        
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "fullscreen render pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen fragment shader",
                    code: shaders.clusteredDeferredOptimizationFullscreenFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });

        // Create G-buffer render bundle
        let gBufferBundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: ["rgba32uint"],
            depthStencilFormat: "depth24plus",
        });
          
        gBufferBundleEncoder.setPipeline(this.gBufferPipeline);
        gBufferBundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            gBufferBundleEncoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferBundleEncoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferBundleEncoder.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferBundleEncoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferBundleEncoder.drawIndexed(primitive.numIndices);
        });

        this.gBufferRenderBundle = gBufferBundleEncoder.finish();

        // Create fullscreen render bundle
        let fullscreenBundleEncoder = renderer.device.createRenderBundleEncoder({
            colorFormats: [renderer.canvasFormat]
        });
          
        fullscreenBundleEncoder.setPipeline(this.fullscreenPipeline);
        fullscreenBundleEncoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenBundleEncoder.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gBufferBindGroup);
        fullscreenBundleEncoder.draw(4);

        this.fullscreenRenderBundle = fullscreenBundleEncoder.finish();
    }

    encodeGBufferRenderCommands(gBufferPass: GPURenderPassEncoder) {
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        
        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });
    }

    encodeFullscreenRenderCommands(fullscreenPass: GPURenderPassEncoder) {
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gBufferBindGroup);
        fullscreenPass.draw(4);
    }

    encodeGBufferPass(encoder: GPUCommandEncoder)
    {
        const gBufferPass = encoder.beginRenderPass({
            label: "G-buffer rendering",
            colorAttachments: [
                {
                    view: this.gBufferTextureViews.pack,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        
        if (this.bUseRenderBundles) {
            gBufferPass.executeBundles([this.gBufferRenderBundle]);
        }
        else {
            this.encodeGBufferRenderCommands(gBufferPass);
        }
        
        gBufferPass.end();
    }

    encodeFullscreenPass(encoder: GPUCommandEncoder, targetView: GPUTextureView)
    {
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen lighting calculation",
            colorAttachments: [
                {
                    view: targetView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        
        if (this.bUseRenderBundles) {
            fullscreenPass.executeBundles([this.fullscreenRenderBundle]);
        }
        else {
            this.encodeFullscreenRenderCommands(fullscreenPass);
        }
        
        fullscreenPass.end();
    }

    override drawScene(targetView: GPUTextureView) {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);
        this.encodeGBufferPass(encoder);
        this.encodeFullscreenPass(encoder, targetView);

        renderer.device.queue.submit([encoder.finish()]);
    }
} 
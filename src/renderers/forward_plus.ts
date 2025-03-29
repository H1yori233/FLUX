import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    // clusterParams: {
    //     numTilesX: number;
    //     numTilesY: number;
    //     numSlices: number;
    //     screenWidth: number;
    //     screenHeight: number;
    //     nearZ: number;
    //     farZ: number;
    // };

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    // pipeline: GPURenderPipeline;

    depthPrePassPipeline: GPURenderPipeline;
    forwardPlusPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // cameraSet
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
                },
                { // clusterParams
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
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
                },
                {
                    binding: 3,
                    resource: { buffer: this.lights.clusterParamsUniformBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        // this.pipeline = renderer.device.createRenderPipeline({
        //     layout: renderer.device.createPipelineLayout({
        //         label: "naive pipeline layout",
        //         bindGroupLayouts: [
        //             this.sceneUniformsBindGroupLayout,
        //             renderer.modelBindGroupLayout,
        //             renderer.materialBindGroupLayout
        //         ]
        //     }),
        //     depthStencil: {
        //         depthWriteEnabled: true,
        //         depthCompare: "less",
        //         format: "depth24plus"
        //     },
        //     vertex: {
        //         module: renderer.device.createShaderModule({
        //             label: "naive vert shader",
        //             code: shaders.naiveVertSrc
        //         }),
        //         buffers: [renderer.vertexBufferLayout]
        //     },
        //     fragment: {
        //         module: renderer.device.createShaderModule({
        //             label: "depth shader",
        //             code: shaders.depthFragSrc,
        //         }),
        //         targets: [
        //             {
        //                 format: renderer.canvasFormat,
        //             }
        //         ]
        //     }
        // });

        this.depthPrePassPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "depth pre-pass pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            }
        });

        this.forwardPlusPipeline = renderer.device.createRenderPipeline({
            label: "forward plus pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward plus pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward plus vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus fragment shader",
                    // code: shaders.depthFragSrc
                    code: shaders.forwardPlusFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less-equal"  // Pre-Depth
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // 1st Pass
        const depthPrePass = encoder.beginRenderPass({
            label: "depth pre pass",
            colorAttachments: [],   // No Need For Color
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        depthPrePass.setPipeline(this.depthPrePassPipeline);

        depthPrePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            depthPrePass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            depthPrePass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            depthPrePass.setVertexBuffer(0, primitive.vertexBuffer);
            depthPrePass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            depthPrePass.drawIndexed(primitive.numIndices);
        });

        depthPrePass.end();

        // 2nd Pass
        this.lights.doLightClustering(encoder);

        // 3rd Pass
        const forwardPlusPass = encoder.beginRenderPass({
            label: "forward plus pass",
            colorAttachments: [{
                view: canvasTextureView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthLoadOp: "load",     // Pre-Depth
                depthStoreOp: "store"
            }
        });

        forwardPlusPass.setPipeline(this.forwardPlusPipeline);
        forwardPlusPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            forwardPlusPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            forwardPlusPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            forwardPlusPass.setVertexBuffer(0, primitive.vertexBuffer);
            forwardPlusPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            forwardPlusPass.drawIndexed(primitive.numIndices);
        });

        forwardPlusPass.end();

        // Submit
        renderer.device.queue.submit([encoder.finish()]);
    }
}

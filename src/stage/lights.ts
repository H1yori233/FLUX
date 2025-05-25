import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights = 50;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    clusterSetStorageBuffer: GPUBuffer;
    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;

    // Light sorting
    bitonicSortComputeBindGroupLayout: GPUBindGroupLayout;
    bitonicSortComputeBindGroup: GPUBindGroup;
    bitonicSortComputePipelines: GPUComputePipeline[];

    // Z-binning
    zBinsArray: Float32Array;
    zBinSetStorageBuffer: GPUBuffer;
    zBinningComputeBindGroupLayout: GPUBindGroupLayout;
    zBinningComputeBindGroup: GPUBindGroup;
    zBinningComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.timeUniformBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [ this.moveLightsComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
    
        // Light sorting
        this.bitonicSortComputeBindGroupLayout = device.createBindGroupLayout({
            label: "bitonic sort compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.bitonicSortComputeBindGroup = device.createBindGroup({
            label: "bitonic sort compute bind group",
            layout: this.bitonicSortComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                }
            ]
        });

        this.bitonicSortComputePipelines = [];
        this.initBitonicSortPipelines();

        // Z-binning
        this.zBinsArray = new Float32Array(shaders.constants.numClustersZ);

        this.zBinSetStorageBuffer = device.createBuffer({
            label: "z-bin set",
            size: shaders.constants.numClustersZ * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.zBinningComputeBindGroupLayout = device.createBindGroupLayout({
            label: "z binning compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // zBinSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.zBinningComputeBindGroup = device.createBindGroup({
            label: "z binning compute bind group",
            layout: this.zBinningComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.zBinSetStorageBuffer }
                }
            ]
        });

        this.zBinningComputePipeline = device.createComputePipeline({
            label: "z binning compute pipeline",
            layout: device.createPipelineLayout({
                label: "z binning compute pipeline layout",
                bindGroupLayouts: [ this.zBinningComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "z binning compute shader",
                    code: shaders.zBinningComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // Light clustering
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "cluster set",
            size: (shaders.constants.numClustersX * 
                   shaders.constants.numClustersY * 
                   shaders.constants.numClustersZ * 
                  (shaders.constants.maxNumLights + 1)) * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        
        this.clusteringComputeBindGroupLayout = device.createBindGroupLayout({
            label: "clustering compute bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // zBinSet
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "clustering compute bind group",
            layout: this.clusteringComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.zBinSetStorageBuffer }
                }
            ]
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "clustering compute pipeline layout",
                bindGroupLayouts: [ this.clusteringComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    private initBitonicSortPipelines() {
        const powerOfTwo = 1 << Math.ceil(Math.log2(this.numLights));
        const maxStep = Math.log2(powerOfTwo);

        for (let step = 1; step <= maxStep; ++step) {
            for (let stage = 0; stage < step; ++stage) {
                const module = device.createShaderModule({
                    label: `bitonic cs step=${step} stage=${stage}`,
                    code: shaders.bitonicSortLightsComputeSrc
                });

                const pipeline = device.createComputePipeline({
                    label: `bitonic pipeline step=${step} stage=${stage}`,
                    layout: device.createPipelineLayout({
                        label: "bitonic pipeline layout",
                        bindGroupLayouts: [
                            this.bitonicSortComputeBindGroupLayout,
                        ],
                    }),
                    compute: {
                        module,
                        entryPoint: "main",
                        constants: {
                            0: step,
                            1: stage,
                        },
                    }
                });

                this.bitonicSortComputePipelines.push(pipeline);
            }
        }
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    private doLightSorting(encoder: GPUCommandEncoder) {
        const workgroupCount = Math.ceil(this.numLights / 2 / 
                                         shaders.constants.moveLightsWorkgroupSize);

        const computePass = encoder.beginComputePass({
            label: "bitonic sort pass",
        });
        computePass.setBindGroup(0, this.bitonicSortComputeBindGroup);

        for (const pipeline of this.bitonicSortComputePipelines) {
            computePass.setPipeline(pipeline);
            computePass.dispatchWorkgroups(workgroupCount);
        }

        computePass.end();
    }

    private doZBinning(encoder: GPUCommandEncoder) {
        // clear z-bin set
        device.queue.writeBuffer(this.zBinSetStorageBuffer, 0, 
            new Uint32Array(shaders.constants.numClustersZ).fill(0));

        const computePass = encoder.beginComputePass({
            label: "z-binning pass"
        });

        computePass.setPipeline(this.zBinningComputePipeline);

        computePass.setBindGroup(0, this.zBinningComputeBindGroup);
        
        computePass.dispatchWorkgroups(shaders.constants.numClustersZ);

        computePass.end();
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        
        this.doLightSorting(encoder);
        this.doZBinning(encoder);
        
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusteringComputePipeline);

        computePass.setBindGroup(0, this.clusteringComputeBindGroup);
        
        const workgroupCountX = Math.ceil(shaders.constants.numClustersX / 
                                          shaders.constants.workgroupSizeX);
        const workgroupCountY = Math.ceil(shaders.constants.numClustersY / 
                                          shaders.constants.workgroupSizeY);
        const workgroupCountZ = Math.ceil(shaders.constants.numClustersZ / 
                                          shaders.constants.workgroupSizeZ);
        computePass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);

        computePass.end();
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }
}

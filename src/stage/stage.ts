import { Camera } from "./camera";
import { Lights } from "./lights";
import { Scene } from "./scene";
import { Bloom } from "../renderers/bloom";
import { Toon } from "../renderers/toon";

export class Stage {
    scene: Scene;
    lights: Lights;
    camera: Camera;
    stats: Stats;
    bloom: Bloom;
    toon: Toon;

    constructor(scene: Scene, lights: Lights, camera: Camera, stats: Stats, bloom: Bloom, toon: Toon) {
        this.scene = scene;
        this.lights = lights;
        this.camera = camera;
        this.stats = stats;
        this.bloom = bloom;
        this.toon = toon;
    }
}

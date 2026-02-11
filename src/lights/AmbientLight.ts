import { Container, Color, type ColorSource } from 'pixi.js';

/**
 * 环境光（AmbientLight）的创建选项。
 */
export interface AmbientLightOptions {
    /** 环境光的颜色。默认为白色。 */
    color?: ColorSource;
    /** 环境光的强度。默认为 0.1。 */
    intensity?: number;
}

/**
 * 2D 环境光组件。
 * 与点光源不同，它通过向所有像素添加恒定的颜色来均匀地影响整个场景。
 */
export class AmbientLight extends Container {
    /** 光源颜色。 */
    public lightColor: Color;
    /** 光源强度。 */
    public intensity: number;

    constructor(options: AmbientLightOptions = {}) {
        super();
        this.lightColor = new Color(options.color ?? 0xffffff);
        this.intensity = options.intensity ?? 0.1;
        this.label = 'AmbientLight';
    }
}

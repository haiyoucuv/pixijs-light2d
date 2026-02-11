import { Container, Color, type ColorSource } from 'pixi.js';

/**
 * 点光源（PointLight）的创建选项。
 */
export interface PointLightOptions {
    /** 光源的 x 坐标。 */
    x?: number;
    /** 光源的 y 坐标。 */
    y?: number;
    /** 光源的颜色。默认为白色。 */
    color?: ColorSource;
    /** 光源的强度。默认为 1.0。 */
    intensity?: number;
    /** 光源的影响半径（像素）。默认为 500。 */
    radius?: number;
}

/**
 * 2D 点光源组件。
 * 从场景中的特定位置发出光线。
 * 光照强度随距离光源的增加而衰减。
 */
export class PointLight extends Container {
    /** 光源颜色。 */
    public lightColor: Color;
    /** 光源强度。 */
    public intensity: number;
    /** 光源影响半径。 */
    public radius: number;

    constructor(options: PointLightOptions = {}) {
        super();
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.lightColor = new Color(options.color ?? 0xffffff);
        this.intensity = options.intensity ?? 1.0;
        this.radius = options.radius ?? 500;
        this.label = 'PointLight';
    }
}

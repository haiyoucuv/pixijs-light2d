import { State, Texture, Sprite, type SpriteOptions, type Instruction } from 'pixi.js';

/**
 * LightSprite 的创建选项。
 */
export interface LightSpriteOptions extends SpriteOptions {
    /**
     * 用于光照计算的法线贴图。
     * 红色通道：X 轴法线 [-1, 1]
     * 绿色通道：Y 轴法线 [-1, 1]
     * 蓝色通道：Z 轴法线 [0, 1]
     */
    normalMap?: Texture;
}

/** 
 * 一个可以受 2D 光照系统影响的 Sprite。
 * 需要法线贴图来进行漫反射光照计算。
 * 如果未提供法线贴图，则使用默认的“平坦”法线贴图（直接指向观察者）。
 */
export class LightSprite extends Sprite implements Instruction {
    /** 2D 光照系统的渲染管线 ID。 */
    public override readonly renderPipeId: string = 'lightSprite';

    /** 用于光照的法线贴图。 */
    public normalMap: Texture;

    /** 该 Sprite 的 WebGL 状态。 */
    public state: State = State.for2d();

    private static _DEFAULT_NORMAL: Texture;

    /**
     * 返回默认的平坦法线贴图（中性蓝：RGB 128, 128, 255）。
     * 这使得 Sprite 对光照的反应就像是一个面对摄像机的平坦表面。
     */
    public static get DEFAULT_NORMAL(): Texture {
        if (!this._DEFAULT_NORMAL) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // 中性法线：[0.5, 0.5, 1.0] -> RGB(128, 128, 255)
                ctx.fillStyle = 'rgb(128, 128, 255)';
                ctx.fillRect(0, 0, 1, 1);
            }
            this._DEFAULT_NORMAL = Texture.from(canvas);
        }
        return this._DEFAULT_NORMAL;
    }

    constructor(options: LightSpriteOptions | Texture) {
        if (options instanceof Texture) {
            options = { texture: options };
        }

        super(options);

        this.normalMap = (options as LightSpriteOptions).normalMap || LightSprite.DEFAULT_NORMAL;
    }
}

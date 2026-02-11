import { Spine, SpineOptions, SpineFromOptions } from '@esotericsoftware/spine-pixi-v8';
import { Texture, Assets, Cache } from 'pixi.js';
import {
    AtlasAttachmentLoader,
    SkeletonBinary,
    SkeletonJson,
    SkeletonData,
    TextureAtlas,
} from '@esotericsoftware/spine-core';

/**
 * LightSpine 的创建选项。
 */
export interface LightSpineOptions extends SpineOptions {
    /** 用于该骨骼动画所有插槽的光照法线图。 */
    normalMap?: Texture;
}

/**
 * 通过配置创建 LightSpine 的静态选项。
 */
export interface LightSpineFromOptions extends SpineFromOptions {
    /** 法线贴图。 */
    normalMap?: Texture;
}

/**
 * 一个可以受 2D 光照系统影响的 Spine 骨骼动画对象。
 */
export class LightSpine extends Spine {
    /** 告诉渲染系统使用定制的 lightSpine 管线。 */
    // @ts-ignore
    public override readonly renderPipeId = 'lightSpine';

    /** 该 Spine 实例使用的法线贴图。 */
    public normalMap: Texture;

    private static _DEFAULT_NORMAL: Texture;

    /**
     * 返回默认的平坦法线贴图（中性蓝：RGB 128, 128, 255）。
     * 这使得 Spine 对光照的反应就像是一个面对摄像机的平坦表面。
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

    constructor(options: LightSpineOptions) {
        super(options);
        this.normalMap = options.normalMap || LightSpine.DEFAULT_NORMAL;
    }

    /**
     * 静态方法：从资源 ID 创建 LightSpine 实例。
     */
    static override from({
        skeleton,
        atlas,
        scale = 1,
        darkTint,
        autoUpdate = true,
        boundsProvider,
        normalMap,
    }: LightSpineFromOptions) {
        const cacheKey = `${skeleton}-${atlas}-${scale}`;

        let skeletonData: SkeletonData;

        // 优先从缓存读取已解析的骨骼数据
        if (Cache.has(cacheKey)) {
            skeletonData = Cache.get<SkeletonData>(cacheKey);
        } else {
            const skeletonAsset = Assets.get(skeleton) as string | Uint8Array;
            const atlasAsset = Assets.get<TextureAtlas>(atlas);
            const attachmentLoader = new AtlasAttachmentLoader(atlasAsset);

            // 根据文件类型（二进制或 JSON）选择对应的解析器
            if (skeletonAsset instanceof Uint8Array) {
                const parser = new SkeletonBinary(attachmentLoader);
                parser.scale = scale;
                skeletonData = parser.readSkeletonData(skeletonAsset);
            } else {
                const parser = new SkeletonJson(attachmentLoader);
                parser.scale = scale;
                skeletonData = parser.readSkeletonData(skeletonAsset);
            }
            Cache.set(cacheKey, skeletonData);
        }

        return new LightSpine({
            skeletonData,
            darkTint,
            autoUpdate,
            boundsProvider,
            normalMap: normalMap || LightSpine.DEFAULT_NORMAL,
        });
    }
}

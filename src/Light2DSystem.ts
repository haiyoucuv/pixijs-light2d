import { UniformGroup, Color, ExtensionType, type Application, extensions } from 'pixi.js';
import type { PointLight } from './lights/PointLight';
import type { AmbientLight } from './lights/AmbientLight';

/**
 * PixiJS 2D 光照系统的核心管理类。
 * 注册为 Application 插件，自动挂载生命周期。
 */
export class Light2DSystem {
    /** 插件配置：作为 Application 扩展 */
    public static extension = {
        type: ExtensionType.Application,
        name: 'light2dSystem',
    } as const;

    /** 插件初始化：自动绑定 Ticker */
    public static init(this: Application) {
        // 在 Application 插件中，this 指向 app 实例
        this.ticker.add((ticker) => {
            light2DSystem.update(ticker.lastTime);
        });
    }

    // 状态锁
    private _lastUpdateTime = -1;

    /** 着色器支持的最大点光源数量。 */
    public static readonly MAX_LIGHTS = 32;

    /** 场景中激活的点光源列表。 */
    public lights: PointLight[] = [];
    /** 场景中激活的环境光源列表。 */
    public ambientLights: AmbientLight[] = [];
    /** 如果没有添加 AmbientLight 组件时的默认环境光颜色。 */
    public ambientColor: Color = new Color(0x333333);
    /** 默认环境光强度。 */
    public ambientIntensity: number = 1.0;

    // GPU Uniforms 的打包数组。
    // 使用 Float32Array 确保二进制兼容性，并直接绑定到 UniformGroup。
    public readonly uAmbientColor = new Float32Array([0.2, 0.2, 0.2]);
    public readonly uAmbientIntensity = new Float32Array([1.0]);
    public readonly uLightPos = new Float32Array(Light2DSystem.MAX_LIGHTS * 2);
    public readonly uLightColor = new Float32Array(Light2DSystem.MAX_LIGHTS * 3);
    public readonly uLightRadius = new Float32Array(Light2DSystem.MAX_LIGHTS);
    public readonly uLightIntensity = new Float32Array(Light2DSystem.MAX_LIGHTS);
    public readonly uLightCount = new Float32Array([0]);

    /** 所有光照着色器共享的 uniform 组。 */
    public readonly uniformGroup: UniformGroup;

    constructor() {
        this.uniformGroup = new UniformGroup({
            uAmbientColor: { value: this.uAmbientColor, type: 'vec3<f32>' },
            uAmbientIntensity: { value: this.uAmbientIntensity, type: 'f32' },
            uLightPos: { value: this.uLightPos, type: 'vec2<f32>', size: 32 },
            uLightColor: { value: this.uLightColor, type: 'vec3<f32>', size: 32 },
            uLightRadius: { value: this.uLightRadius, type: 'f32', size: 32 },
            uLightIntensity: { value: this.uLightIntensity, type: 'f32', size: 32 },
            uLightCount: { value: this.uLightCount, type: 'f32' },
        });
    }

    /**
     * 注册一个新的点光源到系统中。
     * @param light 要添加的 PointLight 实例。
     */
    public addLight(light: PointLight) {
        if (!this.lights.includes(light)) this.lights.push(light);
    }

    /**
     * 注册一个新的环境光源，用于全局场景照明。
     * @param light 要添加的 AmbientLight 实例。
     */
    public addAmbientLight(light: AmbientLight) {
        if (!this.ambientLights.includes(light)) this.ambientLights.push(light);
    }

    /**
     * 同步所有光照属性到 GPU 缓冲区。
     * 通常在每帧渲染前调用一次。
     */
    public update(time?: number) {
        // 1. 帧去重：如果同一帧已经被 Render Pass 触发过，则跳过
        // (虽然 Ticker 只有一次，但保留此检查以防万一其他 Runner 触发)
        if (time !== undefined && time === this._lastUpdateTime) return;
        this._lastUpdateTime = time || -1;

    // 确定激活的光源数量（上限为 MAX_LIGHTS）
        const count = this.lights.length > Light2DSystem.MAX_LIGHTS ? 
                      Light2DSystem.MAX_LIGHTS : this.lights.length;

        // 2. 累加所有注册来源的环境光
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;

        if (this.ambientLights.length > 0) {
            for (const light of this.ambientLights) {
                totalR += light.lightColor.red * light.intensity;
                totalG += light.lightColor.green * light.intensity;
                totalB += light.lightColor.blue * light.intensity;
            }
        } else {
            // 如果不存在环境光实例，则回退到系统默认设置
            totalR = this.ambientColor.red * this.ambientIntensity;
            totalG = this.ambientColor.green * this.ambientIntensity;
            totalB = this.ambientColor.blue * this.ambientIntensity;
        }

        // 更新打包的环境光缓冲区
        this.uAmbientColor[0] = totalR;
        this.uAmbientColor[1] = totalG;
        this.uAmbientColor[2] = totalB;
        this.uAmbientIntensity[0] = 1.0; // 强度已预乘到颜色中
        this.uLightCount[0] = count;

        // 3. 更新各个点光源数据
        for (let i = 0; i < count; i++) {
            const light = this.lights[i];


            // 获取最新的全局坐标（避免 worldTransform 滞后）
            const globalPos = light.getGlobalPosition();
            
            // 光源位置（世界坐标系）
            this.uLightPos[i * 2] = globalPos.x;
            this.uLightPos[i * 2 + 1] = globalPos.y;
            
            // 光源颜色（归一化的 RGB）
            this.uLightColor[i * 3] = light.lightColor.red;
            this.uLightColor[i * 3 + 1] = light.lightColor.green;
            this.uLightColor[i * 3 + 2] = light.lightColor.blue;
            
            // 光源参数
            this.uLightRadius[i] = light.radius;
            this.uLightIntensity[i] = light.intensity;
        }

        // 通知 Pixi 更新缓冲区数据
        this.uniformGroup.update();
    }
}

/** 2D 光照系统的全局单例实例。 */
export const light2DSystem = new Light2DSystem();

// 注册插件
extensions.add(Light2DSystem);

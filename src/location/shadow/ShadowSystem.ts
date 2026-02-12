import { RenderTexture, Container, GlProgram, Mesh, MeshGeometry, Renderer, Shader, Graphics, Point, UniformGroup, Rectangle } from "pixi.js";
import { ShadowCaster } from './caster/ShadowCaster';

/**
 * 简单的全屏 Quad Shader，用于执行 1D Raymarching
 */
const shadowMapVert = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
    vUV = (aPosition + 1.0) * 0.5;
}
`;

const shadowMapFrag = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uOcclusionTexture;
uniform vec4 uOcclusionBounds; // x, y, width, height

// Support up to 4 lights in one pass
uniform vec2 uLightPos[4];     // World Position
uniform float uLightRadius[4]; // World Radius
uniform int uLightCount;       // Active light count

#define PI 3.14159265359

float raymarch(vec2 lightPos, float radius, vec2 boundsPos, vec2 boundsSize, float angle) {
    vec2 dir = vec2(cos(angle), sin(angle));
    float dist = 0.0;
    float stepSize = radius / 256.0; // Reduce steps for performance (4 lights * 256 = 1024 taps max)
    float finalDist = 1.0;

    for(float i=0.0; i<256.0; i++) {
        dist += stepSize;
        if(dist >= radius) {
            dist = radius;
            break;
        }
        
        vec2 worldPos = lightPos + dir * dist;
        vec2 occUV = (worldPos - boundsPos) / boundsSize;

        if(occUV.x < 0.0 || occUV.x > 1.0 || occUV.y < 0.0 || occUV.y > 1.0) {
            continue;
        }

        float occlusion = texture(uOcclusionTexture, occUV).r; 
        if(occlusion > 0.1) {
            finalDist = dist / radius;
            break; 
        }
    }
    return finalDist;
}

void main() {
    float angle = vUV.x * 2.0 * PI;
    vec2 boundsPos = uOcclusionBounds.xy;
    vec2 boundsSize = uOcclusionBounds.zw;

    vec4 result = vec4(0.0);

    // Unroll loop for 4 channels
    if (0 < uLightCount) result.r = raymarch(uLightPos[0], uLightRadius[0], boundsPos, boundsSize, angle);
    if (1 < uLightCount) result.g = raymarch(uLightPos[1], uLightRadius[1], boundsPos, boundsSize, angle);
    if (2 < uLightCount) result.b = raymarch(uLightPos[2], uLightRadius[2], boundsPos, boundsSize, angle);
    if (3 < uLightCount) result.a = raymarch(uLightPos[3], uLightRadius[3], boundsPos, boundsSize, angle);

    fragColor = result;
}
`;


export class ShadowSystem {
    // 私有成员变量
    private _resolution: number = 1024; // ShadowMap 的宽度 (X轴 angular resolution)
    private _occlusionSize: number = 2048; // 遮挡图的大小 (2D texture size)

    private _casters: ShadowCaster[] = [];
    public get casters() { return this._casters; }
    private _casterContainer: Container; // 用于渲染所有 ShadowCaster 的容器

    // 渲染纹理
    public occlusionTexture: RenderTexture;    // 全局遮挡图
    public shadowMapTexture: RenderTexture; // 1D Shadow Map
    private _occlusionGraphics: Graphics;
    
    public lastBounds = new Rectangle();

    // 用于生成 ShadowMap 的 Mesh 和 Shader
    private _shadowMapShader: GlProgram;
    private _shadowMapMesh: Mesh<MeshGeometry, Shader>;

    constructor() {
        // 1. 初始化纹理
        this.occlusionTexture = RenderTexture.create({
            width: this._occlusionSize,
            height: this._occlusionSize
        });
        this.occlusionTexture.source.style.scaleMode = 'linear';
        this.occlusionTexture.source.style.addressMode = 'clamp-to-edge';

        // 1D ShadowMap 保持 1024 宽
        this.shadowMapTexture = RenderTexture.create({
            width: this._resolution,
            height: 1,
        });
        this.shadowMapTexture.source.style.scaleMode = 'linear';
        this.shadowMapTexture.source.style.addressMode = 'repeat';

        // 2. 初始化容器
        this._casterContainer = new Container();
        // 专门用于绘制遮挡形状的 Graphics
        this._occlusionGraphics = new Graphics();
        this._casterContainer.addChild(this._occlusionGraphics);

        // 3. 初始化生成 Shader 的 Mesh
        const geometry = new MeshGeometry({
            positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            indices: new Uint32Array([0, 1, 2, 0, 2, 3])
        });

        this._shadowMapShader = new GlProgram({
            vertex: shadowMapVert,
            fragment: shadowMapFrag,
            name: 'shadow-map-gen'
        });

        // Mesh 稍后在 update 时绑定 Uniforms
        this._shadowMapMesh = new Mesh({
            geometry,
            shader: this._shadowMapShader as any
        });
        // 不再需要 additive blend，因为一次写入 RGBA
        this._shadowMapMesh.blendMode = 'normal';
    }

    public addCaster(caster: ShadowCaster) {
        if (!this._casters.includes(caster)) {
            this._casters.push(caster);
        }
    }

    public removeCaster(caster: ShadowCaster) {
        const index = this._casters.indexOf(caster);
        if (index >= 0) {
            this._casters.splice(index, 1);
        }
    }

    /**
     * 为指定光源生成 ShadowMap (Global Occlusion Version - Single Pass)
     * @param renderer Pixi 渲染器
     * @param lights 光源列表 (最多支持4个)
     */
    public update(renderer: Renderer, lights: Array<{ position: Point, radius: number }>) {
        if (lights.length === 0) return;

        // 1. 计算全局遮挡区域 (Bounds)
        // 我们只关心由光源覆盖的区域。为了简化，我们计算所有光源的包围盒。

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // 至少包含所有光源中心
        for (const light of lights) {
            minX = Math.min(minX, light.position.x - light.radius);
            minY = Math.min(minY, light.position.y - light.radius);
            maxX = Math.max(maxX, light.position.x + light.radius);
            maxY = Math.max(maxY, light.position.y + light.radius);
        }

        const boundsWidth = maxX - minX;
        const boundsHeight = maxY - minY;
        
        // 防止区域过小或无效
        if (boundsWidth <= 0 || boundsHeight <= 0) return;

        // 2. 渲染全局遮挡图
        
        // 增加 Padding
        const padding = 100;
        let neededWidth = boundsWidth + padding;
        let neededHeight = boundsHeight + padding;
        
        // 关键修复 2: 锁定缩放级别 (Quantize Scale)
        // 我们不希望 Scale 每一帧都在微变。我们将世界覆盖范围锁定在 512 的倍数。
        // 这样 Scale 只会在覆盖范围跨越 512 阈值时才会发生跳变。
        const worldStep = 512;
        // 强制使用正方形覆盖区域以保持宽高比一致 (1:1 texture) 并简化计算
        let worldSize = Math.max(neededWidth, neededHeight);
        worldSize = Math.ceil(worldSize / worldStep) * worldStep;

        // 如果计算出的尺寸比之前的小，但差别不大，可以考虑保持不变以避免"缩回"抖动？
        // 暂时先只做向上取整。
        
        const renderWidth = worldSize;
        const renderHeight = worldSize;
        
        const scale = this._occlusionSize / worldSize; 

        // 中心对齐
        let centerX = (minX + maxX) / 2;
        let centerY = (minY + maxY) / 2;
        
        let worldLeft = centerX - renderWidth / 2;
        let worldTop = centerY - renderHeight / 2;

        // 关键修复 1: 纹理像素对齐 (Texel Snapping)
        const worldTexelSize = 1.0 / scale;
        worldLeft = Math.floor(worldLeft / worldTexelSize) * worldTexelSize;
        worldTop = Math.floor(worldTop / worldTexelSize) * worldTexelSize;
        
        // 记录 debug 信息
        this.lastBounds.x = worldLeft;
        this.lastBounds.y = worldTop;
        this.lastBounds.width = renderWidth;
        this.lastBounds.height = renderHeight;

        this._casterContainer.position.set(0, 0);
        this._casterContainer.scale.set(1, 1);
        
        this._occlusionGraphics.clear();

        for (const caster of this._casters) {
            const vertices = caster.shape;
            const transform = caster.worldTransform;

            const points: Point[] = [];
            for (const pt of vertices) {
                // Local -> World -> Texture Pixel Space
                const wp = new Point();
                transform.apply(pt, wp);

                // 2. World -> Texture Pixel Space
                // x = (wp.x - worldLeft) * scale
                const tx = (wp.x - worldLeft) * scale;
                const ty = (wp.y - worldTop) * scale;

                points.push(new Point(tx, ty));
            }

            // 绘制白色多边形
            this._occlusionGraphics.poly(points);
            this._occlusionGraphics.fill({ color: 0xffffff });
        }

        // 渲染到 Occlusion Texture (Global)
        renderer.render({
            container: this._casterContainer,
            target: this.occlusionTexture,
            clear: true,
            clearColor: [0, 0, 0, 0]
        });


        // 3. 生成 Shadow Map (Raymarch on Global Texture)

        // 初始化/清空 ShadowMap
        renderer.render({
            container: new Container(),
            target: this.shadowMapTexture,
            clear: true,
            clearColor: [0, 0, 0, 0]
        });

        if (!this._shadowMapMesh.shader || !(this._shadowMapMesh.shader instanceof Shader)) {
            this._shadowMapMesh.shader = new Shader({
                glProgram: this._shadowMapShader,
                resources: {
                    uOcclusionTexture: this.occlusionTexture.source,
                    shadow_uniforms: new UniformGroup({
                        uOcclusionBounds: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
                        uLightPos: { value: new Float32Array(8), type: 'vec2<f32>', size: 4 }, // 4 * vec2
                        uLightRadius: { value: new Float32Array(4), type: 'f32', size: 4 }, // 4 * float
                        uLightCount: { value: 0, type: 'i32' },
                    })
                }
            });
        }

        const shader = this._shadowMapMesh.shader as Shader;
        const uniforms = shader.resources.shadow_uniforms.uniforms;

        // Update Bounds
        uniforms.uOcclusionBounds[0] = worldLeft;
        uniforms.uOcclusionBounds[1] = worldTop;
        uniforms.uOcclusionBounds[2] = renderWidth;
        uniforms.uOcclusionBounds[3] = renderHeight;

        // Update Lights
        const maxLights = Math.min(lights.length, 4);
        uniforms.uLightCount = maxLights;

        // Prepare data arrays
        // We can write directly to Float32Arrays if we had references, but re-assigning value is safer in Pixi v8 for now
        const posData = uniforms.uLightPos as Float32Array; // Assumption: Pixi makes this a typed array
        const radiusData = uniforms.uLightRadius as Float32Array;

        for (let i = 0; i < maxLights; i++) {
            const light = lights[i];
            posData[i * 2] = light.position.x;
            posData[i * 2 + 1] = light.position.y;
            radiusData[i] = light.radius;
        }

        // Render ONCE
        renderer.render({
            container: this._shadowMapMesh,
            target: this.shadowMapTexture,
            clear: true,
            clearColor: [0, 0, 0, 0] // Clear is needed now
        });
    }
}

export const shadowSystem = new ShadowSystem();


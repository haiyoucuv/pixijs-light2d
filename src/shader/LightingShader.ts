import { Shader, GlProgram, Texture, UniformGroup } from 'pixi.js';
import { light2DSystem } from '../Light2DSystem';
import { shadowSystem } from '../location/shadow/ShadowSystem';

/**
 * 通用的 2D 光照着色器类。
 * 核心逻辑：结合扩散贴图（diffuse）和法线贴图（normal），计算全局环境光和多个点光源对像素的影响。
 */
export class LightingShader extends Shader {
    /**
     * @param diffuse 扩散贴图（对象的基础颜色贴图）。
     * @param normal 法线贴图（存储表面凹凸信息的贴图）。
     */
    constructor(diffuse: Texture, normal: Texture) {
        
        // 1. 顶点着色器 (GLSL 300 es)
        const glVertex = `#version 300 es
            precision highp float;
            in vec2 aPosition;
            in vec2 aUV;
            in vec4 aColor;
            
            // 基础变换矩阵
            uniform mat3 uTransformMatrix;
            uniform mat4 uProjectionMatrix;
            
            out vec2 vUV;
            out vec2 vWorldPos;
            out vec4 vColor;
            
            void main() {
                vUV = aUV;
                vColor = aColor;
                // 计算投影坐标
                vec4 pos = uProjectionMatrix * vec4(uTransformMatrix * vec3(aPosition, 1.0), 1.0);
                gl_Position = pos;
                
                // 将变换后的位置传回片元着色器，用于计算光照方向
                vWorldPos = (uTransformMatrix * vec3(aPosition, 1.0)).xy;
            }
        `;

        // 2. 片元着色器 (GLSL 300 es)
        const glFragment = `#version 300 es
            precision highp float;
            in vec2 vUV;
            in vec2 vWorldPos;
            in vec4 vColor;
            
            uniform sampler2D uDiffuse;
            uniform sampler2D uNormal;
            
            // 来自 Light2DSystem 的动态光照参数
            uniform vec3 uAmbientColor;
            uniform float uAmbientIntensity;
            uniform vec2 uLightPos[32];
            uniform vec3 uLightColor[32];
            uniform float uLightRadius[32];
            uniform float uLightIntensity[32];
            uniform float uLightCount;
            
            // 阴影图（来自 ShadowSystem，暂时只支持光照索引 0）
            uniform sampler2D uShadowMap;

            #define PI 3.14159265359

            out vec4 finalColor;
            
            void main() {
                vec4 diffuseColor = texture(uDiffuse, vUV);
                vec3 normalData = texture(uNormal, vUV).rgb;
                // 法线解码：从 [0, 1] 映射到 [-1, 1]
                vec3 normal = normalize(normalData * 2.0 - 1.0);
                
                vec3 diffuseTotal = vec3(0.0);
                
                // 遍历并累加所有点光源的影响
                for (int i = 0; i < 32; i++) {
                    if (float(i) >= uLightCount) break;
                    
                    vec2 lightPos = uLightPos[i];
                    vec2 dir2d = lightPos - vWorldPos; // 指向光源
                    // 注意：这里的 dir2d 是从像素指向光源

                    float dist = length(dir2d);
                    float radius = uLightRadius[i];
                    
                    if (dist < radius) {
                        float shadowFactor = 1.0;

                        // 简单的硬编码：只有前 4 个光源产生阴影 (RGBA通道对应 0-3)
                        if (i < 4) {
                            // 计算从光源指向像素的角度
                            // dir2d 是 像素->光源，我们需要 光源->像素 = -dir2d
                            vec2 lightToPixel = -dir2d;
                            // 翻转 Y 轴以匹配 Texture 坐标系 (Y 向下 vs 数学逆时针)
                            float angle = atan(lightToPixel.y, lightToPixel.x);
                            // 将角度 [-PI, PI] 映射到 UV [0, 1]
                            // 注意：需要跟 ShadowMap 生成时的方向一致
                            if (angle < 0.0) angle += 2.0 * PI;
                            float shadowUV = angle / (2.0 * PI);

                            // 采样 Shadow Map (RGBA通道存储归一化距离)
                            vec4 shadowData = texture(uShadowMap, vec2(shadowUV, 0.5));
                            float shadowDistNorm = 0.0;

                            // 简单的通道选择 (GLSL 300 es 确保性能)
                            if (i == 0) shadowDistNorm = shadowData.r;
                            else if (i == 1) shadowDistNorm = shadowData.g;
                            else if (i == 2) shadowDistNorm = shadowData.b;
                            else if (i == 3) shadowDistNorm = shadowData.a;

                            float shadowDist = shadowDistNorm * radius; // 还原为世界距离

                            // 距离比较 (加一点偏差防止自遮挡)
                            // 注意: 边缘处可能有插值 artifacts，但在 1D map usually fine
                            if (dist > shadowDist + 1.0) {
                                shadowFactor = 0.0;
                            }
                        }

                        if (shadowFactor > 0.0) {
                            // 平滑的光照距离衰减
                            float atten = pow(1.0 - (dist / radius), 2.0);
                            // 构造半虚拟 3D 光照方向：Z 轴设为 100 以获得柔和顶光效果
                            vec3 lightDir = normalize(vec3(dir2d, 100.0));
                            // 兰伯特漫反射分量 (N dot L)
                            float diff = max(dot(normal, lightDir), 0.0);

                            diffuseTotal += uLightColor[i] * uLightIntensity[i] * diff * atten * shadowFactor;
                        }
                    }
                }
                
                // 计算全局环境光
                vec3 ambient = uAmbientColor * uAmbientIntensity;
                vec3 lightSum = ambient + diffuseTotal;
                
                // 处理基础色（贴图颜色 * 顶点颜色 Tint）
                vec4 baseColor = diffuseColor * vColor;

                // 输出最终带光照色彩的像素
                finalColor = vec4(baseColor.rgb * lightSum, baseColor.a);
            }
        `;

        super({
            glProgram: new GlProgram({ vertex: glVertex, fragment: glFragment, name: 'simple-lighting' }),
            resources: {
                // 每个指令批次的独立 Uniform
                localUniforms: new UniformGroup({
                    uProjectionMatrix: { value: new Float32Array(16), type: 'mat4x4<f32>' },
                    uTransformMatrix: { value: new Float32Array(9), type: 'mat3x3<f32>' },
                }),
                // 纹理插槽定义
                uDiffuse: diffuse.source,
                uDiffuseSampler: diffuse.source.style,
                uNormal: normal.source,
                uNormalSampler: normal.source.style,
                // 全局光照 Uniform 分组（共享 Light2DSystem 资源）
                lighting: light2DSystem.uniformGroup,
                // 阴影图资源
                uShadowMap: shadowSystem.shadowMapTexture.source,
                uShadowMapSampler: shadowSystem.shadowMapTexture.source.style,
            }
        });
    }
}

import { Shader, GlProgram, Texture, UniformGroup } from 'pixi.js';
import { light2DSystem } from '../Light2DSystem';

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
                    vec2 dir2d = lightPos - vWorldPos;
                    float dist = length(dir2d);
                    float radius = uLightRadius[i];
                    
                    if (dist < radius) {
                        // 平滑的光照距离衰减
                        float atten = pow(1.0 - (dist / radius), 2.0);
                        // 构造半虚拟 3D 光照方向：Z 轴设为 100 以获得柔和顶光效果
                        vec3 lightDir = normalize(vec3(dir2d, 100.0));
                        // 兰伯特漫反射分量 (N dot L)
                        float diff = max(dot(normal, lightDir), 0.0);
                        diffuseTotal += uLightColor[i] * uLightIntensity[i] * diff * atten;
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
            }
        });
    }
}

import { type LightSprite } from './LightSprite';
import { LightingShader } from '../../shader/LightingShader';
import {
    ExtensionType,
    Geometry,
    Buffer,
    BufferUsage,
    State,
    type Matrix,
    type BatcherPipe,
    type WebGLRenderer,
    type WebGPURenderer,
    type InstructionSet,
    type InstructionPipe,
    type RenderPipe,
    type Renderer,
} from 'pixi.js';

/**
 * 内部用于存储待渲染 Sprite 批次的数据接口。
 */
interface LightBatch {
    renderPipeId: string;
    /** 该批次中的 Sprite 列表。 */
    sprites: LightSprite[];
    /** 是否可以被打包（指令集复用相关）。 */
    canBundle: boolean;
}

// 批处理相关的常量定义
const MAX_SPRITES = 2048; // 每个批次的最大 Sprite 数量
const VERTICES_PER_SPRITE = 4; // 每个 Sprite 4 个顶点
const INDICES_PER_SPRITE = 6; // 每个 Sprite 6 个索引 (2 个三角形)
const FLOATS_PER_VERTEX = 8; // 每个顶点的 float 数量: x, y (pos) + u, v (uv) + r, g, b, a (color)

/**
 * 官方光照系统合批渲染管线 (LightSpritePipe)。
 * 核心原理：手动构建几何体缓冲区（Geometry Buffer），将使用相同材质（Diffuse + Normal）的 Sprite 合并为一个 DrawCall 提交。
 *
 * 性能优化点：
 * 1. 使用 aColor 属性传递 Tint，改变颜色不再导致合批中断。
 * 2. 只有当 Texture 或 NormalMap 变化时才执行 Flush 提交绘制。
 * 3. 预分配大块 Buffer，避免在渲染过程中频繁创建对象。
 */
export class LightSpritePipe implements RenderPipe<LightSprite>, InstructionPipe<LightBatch> {
    public static extension = {
        type: [ExtensionType.WebGLPipes, ExtensionType.WebGPUPipes],
        name: 'lightSprite',
    } as const;

    private _renderer: WebGLRenderer | WebGPURenderer;
    /** 缓存已创建的 LightingShader，Key 为纹理和法线图的叠加 UID。 */
    private readonly _shaderCache: Map<string, LightingShader> = new Map();

    // --- 合批状态数据 ---
    private _geometry!: Geometry;
    private _vertexBuffer!: Buffer;
    private _indexBuffer!: Buffer;

    /** 顶点数据视图，映射到 ViewableBuffer。 */
    private _vertexArray!: Float32Array;
    /** 索引数据视图。 */
    private _indexArray!: Uint16Array;

    /** 当前批次已填充的 Sprite 数量。 */
    private _batchSize = 0;
    /** 当前批次使用的着色器。 */
    private _currentShader: LightingShader | null = null;
    /** 当前批次的扩散贴图 UID。 */
    private _currentTextureUid: number = -1;
    /** 当前批次的法线贴图 UID。 */
    private _currentNormalUid: number = -1;
    /** 当前批次的基础渲染状态。 */
    private _activeSpriteState: State | null = null;

    constructor(renderer: Renderer) {
        this._renderer = renderer as WebGLRenderer | WebGPURenderer;
        this._initBatchGeometry();
    }

    /**
     * 初始化用于合批的几何体和 GPU 缓冲区。
     */
    private _initBatchGeometry() {
        this._vertexArray = new Float32Array(MAX_SPRITES * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);
        this._indexArray = new Uint16Array(MAX_SPRITES * INDICES_PER_SPRITE);

        // 预计算索引数据 (0, 1, 2, 0, 2, 3)，每个 Sprite 两个三角形
        for (let i = 0; i < MAX_SPRITES; i++) {
            const indexOffset = i * INDICES_PER_SPRITE;
            const vertexOffset = i * VERTICES_PER_SPRITE;
            this._indexArray[indexOffset + 0] = vertexOffset + 0;
            this._indexArray[indexOffset + 1] = vertexOffset + 1;
            this._indexArray[indexOffset + 2] = vertexOffset + 2;
            this._indexArray[indexOffset + 3] = vertexOffset + 0;
            this._indexArray[indexOffset + 4] = vertexOffset + 2;
            this._indexArray[indexOffset + 5] = vertexOffset + 3;
        }

        // 创建 GPU 顶点缓冲区
        this._vertexBuffer = new Buffer({
            data: this._vertexArray,
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            label: 'LightSprite-Vertices'
        });

        // 创建 GPU 索引缓冲区
        this._indexBuffer = new Buffer({
            data: this._indexArray,
            usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
            label: 'LightSprite-Indices'
        });

        // 构建几何体描述，关联属性到缓冲区
        this._geometry = new Geometry({
            attributes: {
                aPosition: { buffer: this._vertexBuffer, size: 2, stride: FLOATS_PER_VERTEX * 4, offset: 0 },
                aUV: { buffer: this._vertexBuffer, size: 2, stride: FLOATS_PER_VERTEX * 4, offset: 2 * 4 },
                aColor: { buffer: this._vertexBuffer, size: 4, stride: FLOATS_PER_VERTEX * 4, offset: 4 * 4 },
            },
            indexBuffer: this._indexBuffer
        });
    }

    /**
     * 将 LightSprite 添加到当前的渲染指令集中。
     * 这决定了 Sprite 属于哪个绘制指令。
     */
    public addRenderable(sprite: LightSprite, instructionSet: InstructionSet) {
        const batchPipe = this._renderer.renderPipes.batch as BatcherPipe;

        // 必须先打断 Pixi 默认 Batcher，确保之前的普通 Sprite 被提交为渲染指令。
        // 这样我们才能正确判断当前光照 Sprite 是否可以与“紧邻”的上一个光照指令合并。
        batchPipe.break(instructionSet);

        // 尝试合并到上一个指令
        const lastInstruction = instructionSet.instructions[instructionSet.instructionSize - 1] as LightBatch;

        if (lastInstruction && lastInstruction.renderPipeId === 'lightSprite' && lastInstruction.sprites) {
            lastInstruction.sprites.push(sprite);
        } else {
            // 无法合并，创建新的光照绘制指令批次
            instructionSet.add({
                renderPipeId: 'lightSprite',
                sprites: [sprite],
                canBundle: true
            } as LightBatch);
        }
    }

    public updateRenderable() {
    }

    public validateRenderable() {
        return false;
    }

    public destroyRenderable() {
    }

    private readonly _projArray = new Float32Array(16);

    /**
     * 将 2D 矩阵转换为 WebGL 兼容的 4x4 mat4 数组。
     */
    private _setMat4(target: Float32Array, source: Matrix) {
        target[0] = source.a;
        target[1] = source.b;
        target[2] = 0;
        target[3] = 0;

        target[4] = source.c;
        target[5] = source.d;
        target[6] = 0;
        target[7] = 0;

        target[8] = 0;
        target[9] = 0;
        target[10] = 1;
        target[11] = 0;

        target[12] = source.tx;
        target[13] = source.ty;
        target[14] = 0;
        target[15] = 1;
    }

    /**
     * 执行具体的渲染绘制逻辑。
     * 遍历批次中的所有 Sprite，并根据材质状态决定何时渲染。
     */
    public execute(instruction: LightBatch) {
        const sprites = instruction.sprites;
        if (!sprites) return;

        const BATCH_LIMIT = MAX_SPRITES;

        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            const texture = sprite.texture;

            if (!sprite.renderable || !texture) continue;

            // 1. 状态检查：如果纹理、法线图改变或缓冲区满了，必须先提交之前的绘制
            const isTextureChanged = (texture.uid !== this._currentTextureUid) ||
                (sprite.normalMap.uid !== this._currentNormalUid);
            const isBufferFull = this._batchSize >= BATCH_LIMIT;

            if ((isTextureChanged || isBufferFull) && this._batchSize > 0) {
                this._flush();
            }

            // 2. 更新并获取当前材质对应的着色器
            if (isTextureChanged) {
                const cacheKey = `${texture.uid}-${sprite.normalMap.uid}`;
                let shader = this._shaderCache.get(cacheKey);

                if (!shader) {
                    shader = new LightingShader(texture, sprite.normalMap);
                    this._shaderCache.set(cacheKey, shader);
                }

                // 确保着色器引用的是当前纹理最新的 Source
                shader.resources.uDiffuse = texture.source;
                shader.resources.uNormal = sprite.normalMap.source;

                this._currentShader = shader;
                this._currentTextureUid = texture.uid;
                this._currentNormalUid = sprite.normalMap.uid;
                this._activeSpriteState = sprite.state;
            }

            // 3. 将当前 Sprite 及其变换数据填充进顶点缓冲区
            this._packSpriteToBuffer(sprite, this._batchSize);
            this._batchSize++;
        }

        // 本组指令结束，执行真正的 GPU 绘制
        this._flush();
    }

    /**
     * 提交真正的 DrawCall 到 GPU。
     */
    private _flush() {
        if (this._batchSize === 0) return;

        const shader = this._currentShader;
        if (!shader) return;

        // 1. 更新着色器 Uniforms (投影矩阵 & 光照参数)
        const uniforms = shader.resources.localUniforms.uniforms;

        // 设置投影矩阵
        const proj = this._renderer.renderTarget.projectionMatrix;
        this._setMat4(this._projArray, proj);
        uniforms.uProjectionMatrix = this._projArray;

        // 由于顶点已通过世界变换，这里使用单位矩阵作为 TransformMatrix
        const mat3Identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        uniforms.uTransformMatrix = mat3Identity;

        // 更新 Uniform 指数数据
        shader.resources.localUniforms.update();
        shader.resources.lighting.update();

        // 2. 将数据上传到 GPU 顶点缓冲区
        // 只上传当前批次用到的部分数据，以提高性能
        const usedFloatCount = this._batchSize * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX;
        const view = this._vertexArray.slice(0, usedFloatCount);
        this._vertexBuffer.data = view;
        this._vertexBuffer.update();

        // 3. 执行绘制指令 (Draw Call)
        this._renderer.encoder.draw({
            geometry: this._geometry,
            shader: shader,
            state: this._activeSpriteState || undefined,
            start: 0,
            size: this._batchSize * INDICES_PER_SPRITE
        });

        // 重置批次计数
        this._batchSize = 0;
    }

    /**
     * 手动计算 Sprite 顶点位置并写入 Float32 缓冲区。
     * 该逻辑模拟了 Pixi 标准 WebGL 合批器的顶点生成行为。
     */
    private _packSpriteToBuffer(sprite: LightSprite, index: number) {
        const texture = sprite.texture;
        const wt = sprite.groupTransform; // 世界变换矩阵

        // 读取 Anchor 并计算本地四个顶点的坐标偏移
        const anchorX = sprite.anchor.x;
        const anchorY = sprite.anchor.y;
        const w0 = texture.width * (1 - anchorX);
        const w1 = texture.width * -anchorX;
        const h0 = texture.height * (1 - anchorY);
        const h1 = texture.height * -anchorY;

        // 将本地坐标通过 2D 世界矩阵变换到屏幕空间
        const a = wt.a;
        const b = wt.b;
        const c = wt.c;
        const d = wt.d;
        const tx = wt.tx;
        const ty = wt.ty;

        // 按 TL, TR, BR, BL 顺序计算顶点世界坐标
        const x0 = a * w1 + c * h1 + tx;
        const y0 = b * w1 + d * h1 + ty; // Top-Left
        const x1 = a * w0 + c * h1 + tx;
        const y1 = b * w0 + d * h1 + ty; // Top-Right
        const x2 = a * w0 + c * h0 + tx;
        const y2 = b * w0 + d * h0 + ty; // Bottom-Right
        const x3 = a * w1 + c * h0 + tx;
        const y3 = b * w1 + d * h0 + ty; // Bottom-Left

        // 提取颜色和透明度并转换为归一化的浮点数
        const color = sprite.groupColor;
        const alpha = sprite.groupAlpha;
        const r = (color & 0xFF) / 255.0;
        const g = ((color >> 8) & 0xFF) / 255.0;
        const b_col = ((color >> 16) & 0xFF) / 255.0;

        // 获取该纹理子区域的 UV 值
        const uvs = texture.uvs;

        // 计算当前 Sprite 在大缓冲区中的偏移量 (Stride = 8 floats)
        let offset = index * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX;

        // 填充 4 个顶点的数据
        // Vertex 0 (TL)
        this._vertexArray[offset++] = x0;
        this._vertexArray[offset++] = y0;
        this._vertexArray[offset++] = uvs.x0;
        this._vertexArray[offset++] = uvs.y0;
        this._vertexArray[offset++] = r;
        this._vertexArray[offset++] = g;
        this._vertexArray[offset++] = b_col;
        this._vertexArray[offset++] = alpha;

        // Vertex 1 (TR)
        this._vertexArray[offset++] = x1;
        this._vertexArray[offset++] = y1;
        this._vertexArray[offset++] = uvs.x1;
        this._vertexArray[offset++] = uvs.y1;
        this._vertexArray[offset++] = r;
        this._vertexArray[offset++] = g;
        this._vertexArray[offset++] = b_col;
        this._vertexArray[offset++] = alpha;

        // Vertex 2 (BR)
        this._vertexArray[offset++] = x2;
        this._vertexArray[offset++] = y2;
        this._vertexArray[offset++] = uvs.x2;
        this._vertexArray[offset++] = uvs.y2;
        this._vertexArray[offset++] = r;
        this._vertexArray[offset++] = g;
        this._vertexArray[offset++] = b_col;
        this._vertexArray[offset++] = alpha;

        // Vertex 3 (BL)
        this._vertexArray[offset++] = x3;
        this._vertexArray[offset++] = y3;
        this._vertexArray[offset++] = uvs.x3;
        this._vertexArray[offset++] = uvs.y3;
        this._vertexArray[offset++] = r;
        this._vertexArray[offset++] = g;
        this._vertexArray[offset++] = b_col;
        this._vertexArray[offset++] = alpha;
    }

    /**
     * 清理资源并从渲染链中移除。
     */
    public destroy() {
        this._shaderCache.clear();
        this._renderer = null!;
    }
}

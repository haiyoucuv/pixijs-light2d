import {
    ExtensionType,
    Texture,
    Buffer,
    BufferUsage,
    Geometry,
    State,
    type InstructionSet,
    type WebGLRenderer,
    type WebGPURenderer,
    type RenderPipe,
    type BLEND_MODES,
} from 'pixi.js';
import { LightSpine } from './LightSpine';
import { LightingShader } from '../../shader/LightingShader';
import { RegionAttachment, MeshAttachment } from '@esotericsoftware/spine-core';

/**
 * 2D 矩阵转换的简单接口定义。
 */
interface MatrixLike {
    a: number; b: number; c: number; d: number;
    tx: number; ty: number;
}

/**
 * 内部辅助类：表示一个可合批的 Spine 插槽数据。
 */
class BatchableLightSpineSlot {
    public texture: Texture;
    public normalTexture: Texture;
    public vertices: Float32Array;
    public uvs: Float32Array;
    public indices: number[] | Uint16Array;
    public blendMode: BLEND_MODES;
    public color: number; // 打包后的 ARGB 颜色
    public renderable: LightSpine;

    constructor() {
        this.texture = Texture.EMPTY;
        this.normalTexture = Texture.EMPTY;
        this.vertices = new Float32Array(0);
        this.uvs = new Float32Array(0);
        this.indices = [];
        this.blendMode = 'normal';
        this.color = 0xFFFFFFFF;
        this.renderable = null!;
    }
}

/**
 * 光照 Spine 渲染批次的内部接口。
 */
interface LightSpineBatch {
    renderPipeId: string;
    /** 批次中包含的所有插槽。 */
    slots: BatchableLightSpineSlot[];
    /** 是否可被打包（指令集复用相关）。 */
    canBundle: boolean;
}

/**
 * Spine 混合模式 ID 到 Pixi 混合模式字符串的映射。
 */
const spineBlendModeMap: Record<number, BLEND_MODES> = {
    0: 'normal',
    1: 'add',
    2: 'multiply',
    3: 'screen'
};

const MAX_VERTICES = 65535; // 单个批次最大的顶点数量
const FLOATS_PER_VERTEX = 8; // 每个顶点的 float 数量
const VERTEX_STRIDE = 8; // 顶点跨度

/**
 * 用于处理 LightSpine 对象的渲染管线。
 * 该类继承并实现了 Spine 在光照系统下的合批逻辑。
 */
export class LightSpinePipe implements RenderPipe<LightSpine> {
    /** 插件扩展元数据。 */
    public static extension = {
        type: [
            ExtensionType.WebGLPipes,
            ExtensionType.WebGPUPipes,
            ExtensionType.CanvasPipes,
        ],
        name: 'lightSpine',
    } as const;

    private _renderer: WebGLRenderer | WebGPURenderer;
    /** 为每个 Spine 实例存储的 GPU 相关数据缓存。 */
    private _gpuSpineData: Record<string, { slotBatches: Record<string, BatchableLightSpineSlot> }> = {};

    /** 用于绘制的通用光照着色器。 */
    private _shader: LightingShader;
    private _vertexBuffer: Buffer;
    private _indexBuffer: Buffer;
    private _vertexData: Float32Array;
    private _indexData: Uint16Array;

    private _vertexCount: number = 0;
    private _indexCount: number = 0;
    /** 默认的 2D 状态。 */
    private _defaultState: State;

    private readonly _projArray = new Float32Array(16);
    /** 动态构建的几何体对象。 */
    private _geometry: Geometry | null = null;

    constructor(renderer: WebGLRenderer | WebGPURenderer) {
        this._renderer = renderer;
        this._shader = new LightingShader(Texture.EMPTY, Texture.EMPTY);

        // 初始化缓冲区空间（约支持 6.5 万个顶点数据）
        this._vertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);
        this._indexData = new Uint16Array(MAX_VERTICES * 3);

        this._vertexBuffer = new Buffer({
            data: this._vertexData,
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
        });

        this._indexBuffer = new Buffer({
            data: this._indexData,
            usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
        });

        // 创建默认状态，确保混合模式等设置符合 2D 标准
        this._defaultState = State.for2d();
    }

    /**
     * 将 LightSpine 对象添加到渲染指令集中。
     * 遍历 Spine 的绘制顺序（drawOrder），将每个有效插槽作为可合批单元记录。
     */
    public addRenderable(spine: LightSpine, instructionSet: InstructionSet) {
        const gpuSpine = this._getSpineData(spine);

        // 验证并更新 Spine 内部附件变换
        spine._validateAndTransformAttachments();
        spine.spineAttachmentsDirty = false;
        spine.spineTexturesDirty = false;

        const drawOrder = spine.skeleton.drawOrder;

        // 尝试合并到现有的 lightSpine 指令，或者创建新指令
        let batch: LightSpineBatch;
        const lastInstruction = instructionSet.instructions[instructionSet.instructionSize - 1];

        if (lastInstruction && lastInstruction.renderPipeId === 'lightSpine') {
            batch = lastInstruction as LightSpineBatch;
        } else {
            batch = {
                renderPipeId: 'lightSpine',
                slots: [],
                canBundle: true
            };
            instructionSet.add(batch);
        }

        // 遍历插槽并将附件数据转化为可合批插槽
        for (let i = 0, n = drawOrder.length; i < n; i++) {
            const slot = drawOrder[i];
            const attachment = slot.getAttachment();

            if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
                const cacheData = spine._getCachedData(slot, attachment);

                if (cacheData.skipRender) continue;

                const slotId = cacheData.id;
                let batchableSlot = gpuSpine.slotBatches[slotId];

                if (!batchableSlot) {
                    batchableSlot = new BatchableLightSpineSlot();
                    gpuSpine.slotBatches[slotId] = batchableSlot;
                }

                // 填充当前状态数据
                batchableSlot.renderable = spine;
                batchableSlot.texture = cacheData.texture;
                batchableSlot.normalTexture = spine.normalMap;

                // 处理剪裁数据或标准顶点/UV 数据
                if (cacheData.clipped && cacheData.clippedData) {
                    batchableSlot.vertices = cacheData.clippedData.vertices;
                    batchableSlot.uvs = cacheData.clippedData.uvs;
                    batchableSlot.indices = cacheData.clippedData.indices;
                } else {
                    batchableSlot.vertices = cacheData.vertices;
                    batchableSlot.uvs = cacheData.uvs;
                    batchableSlot.indices = cacheData.indices;
                }

                // 计算并打包插槽颜色
                const slotColor = cacheData.color;
                const alpha = slotColor.a * spine.groupAlpha;
                const r = slotColor.r * 255;
                const g = slotColor.g * 255;
                const b = slotColor.b * 255;
                const a = alpha * 255;
                batchableSlot.color = (a << 24) | (b << 16) | (g << 8) | r;

                batchableSlot.blendMode = spineBlendModeMap[slot.data.blendMode] || 'normal';

                batch.slots.push(batchableSlot);
            }
        }
    }

    public updateRenderable(spine: LightSpine) {
        spine._validateAndTransformAttachments();
        spine.spineAttachmentsDirty = false;
        spine.spineTexturesDirty = false;
    }

    public destroyRenderable(spine: LightSpine) {
        delete this._gpuSpineData[spine.uid];
    }

    public validateRenderable(spine: LightSpine): boolean {
        spine._validateAndTransformAttachments();
        return spine.spineAttachmentsDirty || spine.spineTexturesDirty;
    }

    /**
     * 执行具体的 GPU 绘制。
     * 遍历批次中的所有插槽，在纹理或混合模式变化时切换 DrawCall。
     */
    public execute(batch: LightSpineBatch) {
        if (batch.slots.length === 0) return;

        this._vertexCount = 0;
        this._indexCount = 0;

        let currentTexture: Texture = Texture.EMPTY;
        let currentNormal: Texture = Texture.EMPTY;
        let currentBlendMode: BLEND_MODES = 'normal';

        for (let i = 0; i < batch.slots.length; i++) {
            const slot = batch.slots[i];

            const textureChanged = (slot.texture.uid !== currentTexture.uid);
            const normalChanged = (slot.normalTexture.uid !== currentNormal.uid);
            const blendChanged = (slot.blendMode !== currentBlendMode);

            // 材质状态改变，执行一次绘制提交
            if (this._vertexCount > 0 && (textureChanged || normalChanged || blendChanged)) {
                this._flush(currentTexture, currentNormal);
            }

            currentTexture = slot.texture;
            currentNormal = slot.normalTexture;
            currentBlendMode = slot.blendMode;

            this._packSlot(slot);
        }

        // 提交最后一批剩余数据
        if (this._vertexCount > 0) {
            this._flush(currentTexture, currentNormal);
        }
    }

    /**
     * 辅助方法：设置 4x4 矩阵。
     */
    private _setMat4(target: Float32Array, source: MatrixLike) {
        target[0] = source.a; target[1] = source.b; target[2] = 0; target[3] = 0;
        target[4] = source.c; target[5] = source.d; target[6] = 0; target[7] = 0;
        target[8] = 0; target[9] = 0; target[10] = 1; target[11] = 0;
        target[12] = source.tx; target[13] = source.ty; target[14] = 0; target[15] = 1;
    }

    /**
     * 将单个插槽的顶点数据（位置、UV、颜色）写入渲染缓冲区。
     */
    private _packSlot(slot: BatchableLightSpineSlot) {
        const wt = slot.renderable.groupTransform;
        const a = wt.a; const b = wt.b; const c = wt.c; const d = wt.d;
        const tx = wt.tx; const ty = wt.ty;

        const vertices = slot.vertices;
        const uvs = slot.uvs;
        const indices = slot.indices;
        const packedColor = slot.color;

        // 解码颜色分量
        const alpha = ((packedColor >> 24) & 0xFF) / 255.0;
        const blue  = ((packedColor >> 16) & 0xFF) / 255.0;
        const green = ((packedColor >> 8) & 0xFF) / 255.0;
        const red   = (packedColor & 0xFF) / 255.0;

        const vCount = vertices.length / 2;
        const iCount = indices.length;

        // 缓冲区溢出保护
        if (this._vertexCount + vCount > MAX_VERTICES) return;

        const baseVertexIndex = this._vertexCount;
        let dataIndex = this._vertexCount * FLOATS_PER_VERTEX;

        for (let j = 0; j < vCount; j++) {
            const x = vertices[j * 2];
            const y = vertices[j * 2 + 1];

            // 应用世界变换
            const wx = (a * x) + (c * y) + tx;
            const wy = (b * x) + (d * y) + ty;

            this._vertexData[dataIndex++] = wx;
            this._vertexData[dataIndex++] = wy;
            this._vertexData[dataIndex++] = uvs[j * 2];
            this._vertexData[dataIndex++] = uvs[j * 2 + 1];
            this._vertexData[dataIndex++] = red;
            this._vertexData[dataIndex++] = green;
            this._vertexData[dataIndex++] = blue;
            this._vertexData[dataIndex++] = alpha;
        }

        // 填充索引数据并应用顶点偏置
        let indexIndex = this._indexCount;
        for (let j = 0; j < iCount; j++) {
            this._indexData[indexIndex++] = baseVertexIndex + indices[j];
        }

        this._vertexCount += vCount;
        this._indexCount += iCount;
    }

    /**
     * 正式向 GPU 提交渲染命令。
     */
    private _flush(texture: Texture, normal: Texture) {
        if (this._vertexCount === 0) return;

        // 设置纹理和法线图资源
        this._shader.resources.uDiffuse = texture.source;
        this._shader.resources.uNormal = normal.source;

        // 同步 Uniform 投影矩阵和全局光照系统
        const uniforms = this._shader.resources.localUniforms.uniforms;
        const proj = this._renderer.renderTarget.projectionMatrix;
        this._setMat4(this._projArray, proj);
        uniforms.uProjectionMatrix = this._projArray;
        uniforms.uTransformMatrix = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

        this._shader.resources.localUniforms.update();
        this._shader.resources.lighting.update();

        // 更新并上传动态顶点和索引数据
        const usedFloats = this._vertexCount * FLOATS_PER_VERTEX;
        const vertexView = this._vertexData.subarray(0, usedFloats);
        this._vertexBuffer.data = vertexView;
        this._vertexBuffer.update();

        const usedIndices = this._indexCount;
        const indexView = this._indexData.subarray(0, usedIndices);
        this._indexBuffer.data = indexView;
        this._indexBuffer.update();

        // 几何体延迟初始化
        if (!this._geometry) {
             this._geometry = new Geometry({
                attributes: {
                    aPosition: { buffer: this._vertexBuffer, size: 2, stride: VERTEX_STRIDE * 4, offset: 0 },
                    aUV: { buffer: this._vertexBuffer, size: 2, stride: VERTEX_STRIDE * 4, offset: 2 * 4 },
                    aColor: { buffer: this._vertexBuffer, size: 4, stride: VERTEX_STRIDE * 4, offset: 4 * 4 },
                },
                indexBuffer: this._indexBuffer
            });
        }

        // 执行 Draw Call
        this._renderer.encoder.draw({
            geometry: this._geometry,
            shader: this._shader,
            state: this._defaultState,
            start: 0,
            size: this._indexCount
        });

        // 重置计数准备下一批
        this._vertexCount = 0;
        this._indexCount = 0;
    }

    /**
     * 获取或初始化 Spine 对象的 GPU 缓存数据。
     */
    private _getSpineData(spine: LightSpine) {
        const id = spine.uid;
        if (!this._gpuSpineData[id]) {
            this._gpuSpineData[id] = { slotBatches: {} };
            spine.on('destroyed', () => this.destroyRenderable(spine));
        }
        return this._gpuSpineData[id];
    }

    public destroy() {
        this._shader?.destroy(true);
        this._renderer = null!;
    }
}

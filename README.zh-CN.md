# pixijs-light2d

[Choose Language: [English](README.md) | 中文]

为 PixiJS v8 设计的高性能 2D 光照系统，为 2D 游戏带来动态光照、法线贴图和实时阴影。

![Demo Preview](https://github.com/haiyoucuv/pixijs-light2d/raw/master/public/preview.png)

## 特性

- **动态点光源**: 支持多个点光源，可调节颜色、强度和半径。
- **环境光**: 全局环境光控制，定义场景整体氛围。
- **法线贴图**: 完整支持 Sprite 与 Spine 动画的法线贴图，实现逼真的表面细节。
- **实时阴影**: 基于 1D Shadow Map 的阴影生成，支持多种遮挡物。
  - 全局遮挡图：所有遮挡物统一渲染到一张共享纹理，提高效率。
  - 多光源单次渲染：利用 RGBA 通道打包，一次 Draw Call 同时为最多 4 个光源生成阴影。
  - Texel Snapping + 量化包围盒：确保光源移动时阴影边缘稳定、无抖动。
- **Spine 支持**: 无缝集成 `@esotericsoftware/spine-pixi-v8`，骨骼动画也能拥有动态光照。
- **批处理渲染器**: 自定义批渲染管线（`LightSpritePipe`），即使大量受光物体也能保持高帧率。
- **WebGPU 就绪**: 基于 PixiJS v8 架构构建，为未来的 Web 图形做好准备。

## 安装

```bash
npm install pixijs-light2d
```

请确保已安装对等依赖：

```bash
npm install pixi.js @esotericsoftware/spine-pixi-v8
```

## 使用方法

### 1. 注册插件

在初始化应用程序之前，向 PixiJS 注册自定义渲染管线。

```typescript
import { extensions } from 'pixi.js';
import { LightSpritePipe, LightSpinePipe } from 'pixijs-light2d';

extensions.add(LightSpritePipe);
extensions.add(LightSpinePipe);
```

### 2. 初始化光照系统

创建 `Application` 实例，向 `light2DSystem` 添加光源。

```typescript
import { Application } from 'pixi.js';
import { light2DSystem, AmbientLight, PointLight } from 'pixijs-light2d';

const app = new Application();
await app.init({ preference: 'webgl' });

// 添加全局环境光
const ambient = new AmbientLight({ color: 0xffffff, intensity: 0.3 });
light2DSystem.addAmbientLight(ambient);

// 添加动态点光源
const light = new PointLight({ color: 0xff0000, intensity: 2.0, radius: 500 });
light.x = 400;
light.y = 300;
app.stage.addChild(light);
light2DSystem.addLight(light);

// 每帧更新着色器 Uniform 数据
app.ticker.add(() => {
    light2DSystem.update();
});
```

### 3. 创建受光物体

#### LightSprite

使用 `LightSprite` 替代标准的 `Sprite`。它需要一个 `normalMap` 纹理来实现光照效果。

```typescript
import { Assets } from 'pixi.js';
import { LightSprite } from 'pixijs-light2d';

const texture = await Assets.load('path/to/texture.png');
const normalMap = await Assets.load('path/to/normal.png');

const sprite = new LightSprite({
    texture,
    normalMap
});
app.stage.addChild(sprite);
```

#### LightSpine

Spine 动画请使用 `LightSpine`。如果您的 atlas 配置正确，它会自动处理法线贴图，也可以手动提供。

```typescript
import { LightSpine } from 'pixijs-light2d';

const spine = LightSpine.from({
    skeleton: 'path/to/skeleton.json',
    atlas: 'path/to/skeleton.atlas',
    normalMap: normalMapTexture // 可选：为该 Spine 手动指定全局法线贴图
});
app.stage.addChild(spine);
```

### 4. 阴影（可选）

添加阴影遮挡物，并在每帧更新阴影系统。

```typescript
import { ShadowCaster, shadowSystem } from 'pixijs-light2d';

// 创建遮挡物
const caster = new ShadowCaster();
caster.setBox(0, 0, 100, 100);  // 矩形遮挡物
caster.position.set(300, 300);
app.stage.addChild(caster);
shadowSystem.addCaster(caster);

// 也支持圆形遮挡物
const circle = new ShadowCaster();
circle.setCircle(0, 0, 50);     // 圆形遮挡物（多边形逼近）
circle.position.set(500, 200);
app.stage.addChild(circle);
shadowSystem.addCaster(circle);

// 在 Ticker 中更新阴影系统
app.ticker.add(() => {
    shadowSystem.update(app.renderer, lights.map(l => ({
        position: l.position,
        radius: l.radius
    })));
});
```

## 项目结构

```
src/
├── index.ts                  # 公开 API 导出
├── Light2DSystem.ts          # 核心光照 Uniform 管理器（单例）
├── lights/
│   ├── AmbientLight.ts       # 全局环境光组件
│   └── PointLight.ts         # 点光源组件
├── scene/
│   ├── sprite/
│   │   ├── LightSprite.ts    # 受光 Sprite（漫反射 + 法线贴图）
│   │   └── LightSpritePipe.ts# 自定义批渲染管线
│   └── spine/
│       ├── LightSpine.ts     # 受光 Spine 动画
│       └── LightSpinePipe.ts # 自定义 Spine 渲染管线
├── shader/
│   └── LightingShader.ts     # GLSL 光照片段着色器
└── location/
    └── shadow/
        ├── ShadowSystem.ts   # 阴影贴图生成（遮挡图 + 光线步进）
        └── caster/
            └── ShadowCaster.ts # 阴影投射体（遮挡物）
```

## 开发指引

1. 克隆仓库：
   ```bash
   git clone https://github.com/haiyoucuv/pixijs-light2d.git
   ```
2. 安装依赖：
   ```bash
   npm install
   ```
3. 运行演示：
   ```bash
   npm run dev
   ```

## 开源协议

MIT License。详情请见 [LICENSE](LICENSE) 文件。

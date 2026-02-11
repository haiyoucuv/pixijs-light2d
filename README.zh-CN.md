# @pixi/light2d

[Choose Language: [English](README.md) | 中文]

为 PixiJS v8 打造的高性能 2D 光照系统，旨在为您的 2D 游戏带来动态光照、法线贴图和柔和阴影效果。

## 特性

- **动态点光源**：支持多个具有不同颜色、强度和半径的可调点光源。
- **环境光照**：全局环境光控制，轻松设定场景氛围。
- **法线贴图**：完全支持 Sprite 和 Spine 动画的法线贴图，渲染逼真的表面细节。
- **Spine 支持**：与 `@esotericsoftware/spine-pixi-v8` 无缝集成，实现骨骼动画的动态光照效果。
- **批量渲染**：针对性能优化的自定义批量渲染器 (`LightSpritePipe`)，确保在大量光照对象下仍保持高帧率。
- **WebGPU 就绪**：基于 PixiJS v8 架构构建，为未来的 Web 图形技术做好准备。

## 安装

```bash
npm install @pixi/light2d
```

请确保您也安装了必要的对等依赖：

```bash
npm install pixi.js @esotericsoftware/spine-pixi-v8
```

## 使用方法

### 1. 注册插件

在初始化应用程序之前，先向 PixiJS 注册自定义的渲染管线。

```typescript
import { extensions } from 'pixi.js';
import { LightSpritePipe, LightSpinePipe } from '@pixi/light2d';

extensions.add(LightSpritePipe);
extensions.add(LightSpinePipe);
```

### 2. 初始化光照系统

初始化您的 `Application` 并将光源添加到 `light2dSystem` 中。

```typescript
import { Application } from 'pixi.js';
import { light2DSystem, AmbientLight, PointLight } from '@pixi/light2d';

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

// 每帧更新着色器 uniform 数据
app.ticker.add(() => {
    light2DSystem.update();
});
```

### 3. 创建受光物体

#### LightSprite

使用 `LightSprite` 替代标准的 `Sprite`。它需要一个 `normalMap` 纹理来实现光照效果。

```typescript
import { Assets } from 'pixi.js';
import { LightSprite } from '@pixi/light2d';

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
import { LightSpine } from '@pixi/light2d';

const spine = LightSpine.from({
    skeleton: 'path/to/skeleton.json',
    atlas: 'path/to/skeleton.atlas',
    normalMap: normalMapTexture // 可选：为该 spine 手动指定全局法线贴图
});
app.stage.addChild(spine);
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

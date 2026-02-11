# pixijs-light2d

[Choose Language: English | [中文](README.zh-CN.md)]

A high-performance 2D lighting system for PixiJS v8, designed to bring dynamic lighting, normal mapping, and soft shadows to your 2D games.

![Demo Preview](https://github.com/haiyoucuv/pixijs-light2d/raw/master/public/preview.png)
*(Note: Replace with an actual preview image if available)*

## Features

- **Dynamic Point Lights**: Support for multiple point lights with adjustable color, intensity, and radius.
- **Ambient Lighting**: Global ambient light control to set the mood of your scene.
- **Normal Mapping**: Full support for normal maps on Sprites and Spine animations for realistic surface details.
- **Spine Support**: Seamless integration with `@esotericsoftware/spine-pixi-v8`, enabling dynamic lighting on skeletal animations.
- **Batch Renderer**: Custom batch renderer (`LightSpritePipe`) optimized for performance, ensuring high frame rates even with many lit objects.
- **WebGPU Ready**: Built on PixiJS v8 architecture, ready for the future of web graphics.

## Installation

```bash
npm install pixijs-light2d
```

Ensure you also have the peer dependencies installed:

```bash
npm install pixi.js @esotericsoftware/spine-pixi-v8
```

## Usage

### 1. Register Plugins

Register the custom render pipes with PixiJS before initializing your application.

```typescript
import { extensions } from 'pixi.js';
import { LightSpritePipe, LightSpinePipe } from 'pixijs-light2d';

extensions.add(LightSpritePipe);
extensions.add(LightSpinePipe);
```

### 2. Setup Lighting System

Initialize your `Application` and add lights to the `light2dSystem`.

```typescript
import { Application } from 'pixi.js';
import { light2DSystem, AmbientLight, PointLight } from 'pixijs-light2d';

const app = new Application();
await app.init({ preference: 'webgl' });

// Add global ambient light
const ambient = new AmbientLight({ color: 0xffffff, intensity: 0.3 });
light2DSystem.addAmbientLight(ambient);

// Add a dynamic point light
const light = new PointLight({ color: 0xff0000, intensity: 2.0, radius: 500 });
light.x = 400;
light.y = 300;
app.stage.addChild(light);
light2DSystem.addLight(light);

// Update shader uniforms every frame
app.ticker.add(() => {
    light2DSystem.update();
});
```

### 3. Create Lit Objects

#### LightSprite

Use `LightSprite` instead of standard `Sprite`. It requires a `normalMap` texture for lighting effects.

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

Use `LightSpine` for Spine animations. It automatically handles normal maps if your atlas is configured correctly or manually provided.

```typescript
import { LightSpine } from 'pixijs-light2d';

const spine = LightSpine.from({
    skeleton: 'path/to/skeleton.json',
    atlas: 'path/to/skeleton.atlas',
    normalMap: normalMapTexture // Optional: Global normal map for the spine
});
app.stage.addChild(spine);
```

## Development

1. Clone the repository:
   ```bash
   git clone https://github.com/haiyoucuv/pixijs-light2d.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the demo:
   ```bash
   npm run dev
   ```

## License

MIT License. See [LICENSE](LICENSE) for details.

import { Application, Assets, Sprite, Graphics, Container } from 'pixi.js';
import {
    light2DSystem,
    AmbientLight,
    PointLight,
    LightSprite,
    LightSpine,
    ShadowCaster,
    shadowSystem
} from 'pixijs-light2d';
import GUI from 'lil-gui';

export class ShadowDemo {
    private app: Application;
    private gui: GUI | null = null;
    private tickerFn: ((ticker: any) => void) | null = null;

    constructor(app: Application) {
        this.app = app;
        this.setup();
    }

    private async setup() {
        const app = this.app;
        const stage = app.stage;

        // 获取资源 (假设已经在 main.ts 加载完成)
        const bgTexture = Assets.get('bg/wall7_resized.png');
        const bgNormal = Assets.get('bg/wall7_normal_resized.png');
        const spineNormalMap = Assets.get('spine/raptor/raptor_normal.png');
        const geckoTexture = Assets.get('test/gecko.png');
        const geckoNormal = Assets.get('test/gecko_normal.png');

        // 背景
        const bg = new LightSprite({
            texture: bgTexture,
            normalMap: bgNormal,
        });
        bg.anchor.set(0.5);
        bg.x = app.screen.width / 2;
        bg.y = app.screen.height / 2;
        bg.scale.set(2.0);
        stage.addChild(bg);

        // 壁虎
        const gecko = new LightSprite({
            texture: geckoTexture,
            normalMap: geckoNormal,
        });
        gecko.anchor.set(0.5);
        gecko.x = app.screen.width / 2;
        gecko.y = app.screen.height / 2;
        gecko.scale.set(1.5);
        stage.addChild(gecko);

        // Spine
        const skeleton = LightSpine.from({
            skeleton: 'spine/raptor/raptor.json',
            atlas: 'spine/raptor/raptor.atlas',
            normalMap: spineNormalMap,
            scale: 0.5,
        });
        skeleton.x = app.screen.width / 2;
        skeleton.y = app.screen.height * 0.85;
        skeleton.state.setAnimation(0, 'walk', true);
        stage.addChild(skeleton);

        // 创建可拖拽的光源
        const lights: PointLight[] = [];
        const handleContainer = new Container(); // Handles go here to be on top
        const colors = [0xffffff, 0xff0000, 0x00ff00, 0x0000ff];
        const initialPos = [
            { x: app.screen.width * 0.3, y: app.screen.height * 0.3 },
            { x: app.screen.width * 0.7, y: app.screen.height * 0.3 },
            { x: app.screen.width * 0.3, y: app.screen.height * 0.7 },
            { x: app.screen.width * 0.7, y: app.screen.height * 0.7 },
        ];

        for (let i = 0; i < 4; i++) {
            // Light
            const light = new PointLight({
                color: colors[i],
                intensity: 1.0,
                radius: 1000,
            });
            light.position.set(initialPos[i].x, initialPos[i].y);
            stage.addChild(light);
            light2DSystem.addLight(light);
            lights.push(light);

            // Handle (Visual representation)
            const handle = new Graphics()
                .circle(0, 0, 15)
                .fill({ color: colors[i] })
                .stroke({ color: 0xffffff, width: 2 });
            handle.position.copyFrom(light.position);
            handle.eventMode = 'static';
            handle.cursor = 'pointer';
            
            // Drag Logic
            handle.on('pointerdown', (e) => {
                console.log('Handle Down', i);
                handle.alpha = 0.8;
                e.stopPropagation();

                const onGlobalMove = (moveEvent: any) => {
                    const newPos = moveEvent.global;
                    handle.position.copyFrom(newPos);
                    light.position.copyFrom(newPos);
                };

                const onGlobalUp = () => {
                    handle.alpha = 1.0;
                    stage.off('pointermove', onGlobalMove);
                    stage.off('pointerup', onGlobalUp);
                    stage.off('pointerupoutside', onGlobalUp);
                };

                stage.on('pointermove', onGlobalMove);
                stage.on('pointerup', onGlobalUp);
                stage.on('pointerupoutside', onGlobalUp);
            });

            handleContainer.addChild(handle);
        }

        // 环境光
        const ambient = new AmbientLight({
            color: 0xffaa44,
            intensity: 0.05, // 极低环境光，让阴影更明显
        });
        light2DSystem.addAmbientLight(ambient);

        // GUI
        const gui = new GUI({ title: 'Shadow Demo Settings' });
        this.gui = gui;

        const ambientFolder = gui.addFolder('Ambient Light');
        ambientFolder.add(ambient, 'intensity', 0, 1).name('Intensity');
        const ambientColor = { color: ambient.lightColor.toHex() };
        ambientFolder.addColor(ambientColor, 'color').name('Color').onChange((value: number) => {
            ambient.lightColor.setValue(value);
        });

        const lightsFolder = gui.addFolder('All Lights');
        const lightParams = { intensity: 1.0, radius: 1000 };
        lightsFolder.add(lightParams, 'intensity', 0, 10).name('Intensity').onChange((v: number) => {
            lights.forEach(l => l.intensity = v);
        });
        lightsFolder.add(lightParams, 'radius', 100, 2000).name('Radius').onChange((v: number) => {
            lights.forEach(l => l.radius = v);
        });
        
        // Remove mouse event listener for light (handles serve this purpose now)
        stage.eventMode = 'static'; 
        stage.hitArea = app.screen;
        
        // Shadow Caster 1 (Middle Box)
        const caster1 = new ShadowCaster();
        caster1.setBox(0, 0, 100, 100);
        caster1.position.set(app.screen.width / 2 - 50, app.screen.height / 2 - 50);
        caster1.eventMode = 'none'; 
        stage.addChild(caster1);
        caster1.drawDebug();
        shadowSystem.addCaster(caster1);

        // Shadow Caster 2 (Top Left Circle)
        const caster2 = new ShadowCaster();
        caster2.setCircle(0, 0, 40);
        caster2.position.set(app.screen.width / 2 - 150, app.screen.height / 2 - 150);
        caster2.eventMode = 'none';
        stage.addChild(caster2);
        caster2.drawDebug();
        shadowSystem.addCaster(caster2);

        // Shadow Caster 3 (Bottom Right Box)
        const caster3 = new ShadowCaster();
        caster3.setBox(0, 0, 60, 150);
        caster3.position.set(app.screen.width / 2 + 150, app.screen.height / 2 + 150);
        caster3.rotation = Math.PI / 4;
        caster3.eventMode = 'none';
        stage.addChild(caster3);
        caster3.drawDebug();
        shadowSystem.addCaster(caster3);

        // Debug Sprites
        const debugOcclusion = new Sprite(shadowSystem.occlusionTexture);
        debugOcclusion.anchor.set(0); // Top-left for matching bounds
        debugOcclusion.alpha = 0.5;
        debugOcclusion.tint = 0xff0000;
        debugOcclusion.eventMode = 'none'; // Pass through clicks
        stage.addChild(debugOcclusion);

        const debugShadowMap = new Sprite(shadowSystem.shadowMapTexture);
        debugShadowMap.position.set(10, 280);
        debugShadowMap.width = 256;
        debugShadowMap.height = 32;
        debugShadowMap.eventMode = 'none'; // Pass through clicks
        stage.addChild(debugShadowMap);
        
        // Add handles ON TOP of everything
        stage.addChild(handleContainer);

        // 渲染循环 (标准自动模式)
        app.ticker.maxFPS = 60;
        app.ticker.autoStart = true;
        app.ticker.start();
        
        this.tickerFn = () => {
             // 更新 Shadow (Pass all 4 lights)
             shadowSystem.update(app.renderer, lights.map(l => ({
                 position: l.position,
                 radius: l.radius
             })));
             
             // 修正 Debug 图位置：使其与 ShadowSystem 的实际世界包围盒对齐
             const bounds = shadowSystem.lastBounds;
             debugOcclusion.position.set(bounds.x, bounds.y);
             debugOcclusion.width = bounds.width;
             debugOcclusion.height = bounds.height;
        };
        app.ticker.add(this.tickerFn);
        
    }

    public destroy() {
        if (this.gui) {
            this.gui.destroy();
            this.gui = null;
        }
        if (this.tickerFn) {
            this.app.ticker.remove(this.tickerFn);
            this.tickerFn = null;
        }

        const stage = this.app.stage;
       
        stage.removeChildren();

        // 清理系统数据
        light2DSystem.lights.length = 0;
        light2DSystem.ambientLights.length = 0;
        shadowSystem.casters.length = 0;
    }
}

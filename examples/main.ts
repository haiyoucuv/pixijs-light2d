import { Application, Assets, extensions } from 'pixi.js';
import {
    light2DSystem,
    AmbientLight,
    PointLight,
    LightSpritePipe,
    LightSpinePipe,
    LightSprite,
    LightSpine
} from '@pixi/light2d';
import GUI from 'lil-gui'; 

// 注册自定义渲染管线
extensions.add(LightSpritePipe);
extensions.add(LightSpinePipe);

async function init() {
    const app = new Application();

    await app.init({
        preference: 'webgl',
        background: '#020202',
        resizeTo: window,
    });
    document.body.appendChild(app.canvas);

    // 加载资源
    const bgTexture = await Assets.load('bg/wall7_resized.png');
    const bgNormal = await Assets.load('bg/wall7_normal_resized.png');
    const spineNormalMap = await Assets.load('spine/raptor/raptor_normal.png');
    // 加载壁虎资源
    const geckoTexture = await Assets.load('test/gecko.png');
    const geckoNormal = await Assets.load('test/gecko_normal.png');

    await Assets.load('spine/raptor/raptor.json');
    await Assets.load('spine/raptor/raptor.atlas');

    // 背景 (居中铺满)
    const bg = new LightSprite({
        texture: bgTexture,
        normalMap: bgNormal,
    });
    bg.anchor.set(0.5);
    bg.x = app.screen.width / 2;
    bg.y = app.screen.height / 2;
    bg.scale.set(2.0);
    app.stage.addChild(bg);

    // 壁虎 (位于背景和 Spine 之间)
    const gecko = new LightSprite({
        texture: geckoTexture,
        normalMap: geckoNormal,
    });
    gecko.anchor.set(0.5);
    gecko.x = app.screen.width / 2;
    gecko.y = app.screen.height / 2;
    gecko.scale.set(1.5); // 稍微放大一点
    app.stage.addChild(gecko);

    // Spine (居中, 4倍大小)
    const skeleton = LightSpine.from({
        skeleton: 'spine/raptor/raptor.json',
        atlas: 'spine/raptor/raptor.atlas',
        normalMap: spineNormalMap,
        scale: 0.5,
    });
    skeleton.x = app.screen.width / 2;
    skeleton.y = app.screen.height * 0.85;
    skeleton.state.setAnimation(0, 'walk', true);
    app.stage.addChild(skeleton);

    // 鼠标跟随光源
    const mouseLight = new PointLight({
        color: 0xffffff,
        intensity: 3.0,
        radius: 800,
    });

    // 环绕蓝光
    const blueLight = new PointLight({
        color: 0x0088ff,
        intensity: 2.0,
        radius: 500,
    });

    app.stage.addChild(mouseLight);
    app.stage.addChild(blueLight);
    light2DSystem.addLight(mouseLight);
    light2DSystem.addLight(blueLight);

    // 环境光
    const ambient = new AmbientLight({
        color: 0xffaa44,
        intensity: 0.3,
    });
    light2DSystem.addAmbientLight(ambient);

    // 环境光控制
    const gui = new GUI();

    const ambientFolder = gui.addFolder('Ambient Light');
    ambientFolder.add(ambient, 'intensity', 0, 1).name('Intensity');
    const ambientColor = { color: ambient.lightColor.toHex() };
    ambientFolder.addColor(ambientColor, 'color').name('Color').onChange((value: number) => {
        ambient.lightColor.setValue(value);
    });

    // 鼠标光源控制
    const mouseLightFolder = gui.addFolder('Mouse Light');
    mouseLightFolder.add(mouseLight, 'intensity', 0, 10).name('Intensity');
    mouseLightFolder.add(mouseLight, 'radius', 100, 2000).name('Radius');
    const mouseLightColor = { color: mouseLight.lightColor.toHex() };
    mouseLightFolder.addColor(mouseLightColor, 'color').name('Color').onChange((value: number) => {
        mouseLight.lightColor.setValue(value);
    });

    // 蓝光控制
    const blueLightFolder = gui.addFolder('Blue Light');
    blueLightFolder.add(blueLight, 'intensity', 0, 10).name('Intensity');
    blueLightFolder.add(blueLight, 'radius', 100, 2000).name('Radius');
    const blueLightColor = { color: blueLight.lightColor.toHex() };
    blueLightFolder.addColor(blueLightColor, 'color').name('Color').onChange((value: number) => {
        blueLight.lightColor.setValue(value);
    });

    // 每帧更新
    app.ticker.add(() => {
        // 鼠标光源跟随
        const mousePos = app.renderer.events.pointer?.global;
        if (mousePos && !isNaN(mousePos.x) && !isNaN(mousePos.y)) {
            mouseLight.x = mousePos.x;
            mouseLight.y = mousePos.y;
        }

        // 蓝光环绕
        const t = performance.now() * 0.002;
        blueLight.x = (app.screen.width / 2) + Math.cos(t) * 300;
        blueLight.y = (app.screen.height / 2) + Math.sin(t) * 200;

        // 同步光照数据到 GPU
        light2DSystem.update();
    });

    console.log('LightSpine Demo Initialized!');
}

init().catch(console.error);

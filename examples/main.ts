import { Application, Assets, extensions, Ticker } from 'pixi.js';
import { LightSpritePipe, LightSpinePipe } from 'pixijs-light2d';
import { ShadowDemo } from './ShadowDemo';
import { BatchDemo } from './BatchDemo';
import { Stats } from 'pixi-stats';

// 注册自定义渲染管线
extensions.add(LightSpritePipe);
extensions.add(LightSpinePipe);

let app: Application;
let currentDemo: ShadowDemo | BatchDemo | null = null;

async function init() {
    // 1. 初始化 Application
    app = new Application();
    await app.init({
        preference: 'webgl',
        background: '#050505',
        resizeTo: window,
        eventMode: 'static'
    });
    document.body.appendChild(app.canvas);

    // 性能监控
    const stats = new Stats(app.renderer, Ticker.shared, document.body);
    const statsDom = stats.domElement as HTMLElement;

    // 强制显示在顶层
    statsDom.style.position = 'absolute';
    statsDom.style.left = '0px';
    statsDom.style.top = '0px';
    statsDom.style.zIndex = '99999';

    // 2. 预加载所有 Demo 所需资源
    console.log('Loading resources...');
    await Assets.load([
        'bg/wall7_resized.png',
        'bg/wall7_normal_resized.png',
        'spine/raptor/raptor_normal.png',
        'test/gecko.png',
        'test/gecko_normal.png',
        'spine/raptor/raptor.json',
        'spine/raptor/raptor.atlas',
    ]);
    console.log('Resources loaded.');

    // 3. 创建切换 UI
    createSwitcherUI();

    // 4. 启动默认 Demo
    switchDemo('shadow');
}

function createSwitcherUI() {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '10px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.zIndex = '9999';
    div.style.fontFamily = 'Arial, sans-serif';

    const btnStyle = 'margin: 0 5px; padding: 8px 16px; cursor: pointer; background: #333; color: white; border: 1px solid #555; border-radius: 4px;';

    const btn1 = document.createElement('button');
    btn1.innerText = "Shadow Debug Demo";
    btn1.style.cssText = btnStyle;
    btn1.onclick = () => switchDemo('shadow');

    const btn2 = document.createElement('button');
    btn2.innerText = "Batch Performance Demo";
    btn2.style.cssText = btnStyle;
    btn2.onclick = () => switchDemo('batch');

    div.appendChild(btn1);
    div.appendChild(btn2);
    document.body.appendChild(div);
}

function switchDemo(type: 'shadow' | 'batch') {
    if (currentDemo) {
        console.log(`Destroying current demo.`);
        currentDemo.destroy();
        currentDemo = null;
    }

    // 清理可能残留的舞台内容 (双重保险)
    app.stage.removeChildren();

    console.log(`Switching to ${type} demo.`);
    if (type === 'shadow') {
        currentDemo = new ShadowDemo(app);
    } else {
        currentDemo = new BatchDemo(app);
    }
}

init().catch(console.error);

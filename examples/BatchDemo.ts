import { Application, Assets, Container } from 'pixi.js';
import { LightSprite, light2DSystem, PointLight, AmbientLight } from 'pixijs-light2d';
import GUI from 'lil-gui';

export class BatchDemo {
    private app: Application;
    private gui: GUI | null = null;
    private tickerFn: ((ticker: any) => void) | null = null;
    private container: Container;

    constructor(app: Application) {
        this.app = app;
        this.container = new Container();
        app.stage.addChild(this.container);
        this.setup();
    }

    private setup() {
        const app = this.app;

        // 资源 (假设 main.ts 已加载)
        const geckoTexture = Assets.get('test/gecko.png');
        const geckoNormal = Assets.get('test/gecko_normal.png');

        // 创建光源 (自动移动)
        const light = new PointLight({ color: 0xffffff, intensity: 2, radius: 600 });
        app.stage.addChild(light);
        light2DSystem.addLight(light);

        const ambient = new AmbientLight({ color: 0x444444, intensity: 0.5 });
        light2DSystem.addAmbientLight(ambient);

        // GUI
        this.gui = new GUI({ title: 'Batching Test' });
        const params = { count: 111 };

        const createSprites = (count: number) => {
            this.container.removeChildren();
            for(let i=0; i<count; i++) {
                const s = new LightSprite({ texture: geckoTexture, normalMap: geckoNormal });
                s.anchor.set(0.5);
                s.x = Math.random() * app.screen.width;
                s.y = Math.random() * app.screen.height;
                s.rotation = Math.random() * Math.PI * 2;
                s.scale.set(0.3 + Math.random() * 0.3);
                this.container.addChild(s);
            }
            console.log(`Created ${count} sprites.`);
        };

        this.gui.add(params, 'count', 100, 10000, 100).name('Sprite Count').onChange(createSprites);

        // 初始创建
        createSprites(params.count);

        // Ticker (animate light)
        this.tickerFn = () => {
            const t = performance.now() * 0.001;
            light.x = app.screen.width/2 + Math.cos(t) * 400;
            light.y = app.screen.height/2 + Math.sin(t) * 300;
        };
        app.ticker.add(this.tickerFn);
        app.ticker.start();
        app.ticker.maxFPS = 60;
    }

    public destroy() {
        if(this.gui) {
            this.gui.destroy();
            this.gui = null;
        }
        if(this.tickerFn) {
            this.app.ticker.remove(this.tickerFn);
            this.tickerFn = null;
        }
        this.app.stage.removeChildren();

        // 清理系统
        light2DSystem.lights.length = 0;
        light2DSystem.ambientLights.length = 0;
    }
}

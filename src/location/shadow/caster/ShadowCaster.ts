import { Container, Graphics, Point } from 'pixi.js';

export interface ShadowCasterOptions {
    /** 遮挡多边形的顶点数组（相对于 ShadowCaster 的局部坐标） */
    shape?: Point[];
}

/**
 * 阴影投射体。
 * 表示一个不透明物体，会阻挡光线并产生阴影。
 * 目前支持简单的凸多边形。
 */
export class ShadowCaster extends Container {
    /** 遮挡形状（多边形顶点） */
    public shape: Point[] = [];
    
    /** 用于可视化调试的图形对象 */
    private _debugGraphics: Graphics;

    constructor(options?: ShadowCasterOptions) {
        super();
        
        if (options?.shape) {
            this.shape = options.shape;
        }

        this._debugGraphics = new Graphics();
        this.addChild(this._debugGraphics);
        this.drawDebug();
    }

    /**
     * 设置遮挡形状
     * @param shape 多边形顶点数组
     */
    public setShape(shape: Point[]) {
        this.shape = shape;
        this.drawDebug();
    }

    /**
     * 设置为矩形遮挡
     */
    public setBox(x: number, y: number, width: number, height: number) {
        this.shape = [
            new Point(x, y),
            new Point(x + width, y),
            new Point(x + width, y + height),
            new Point(x, y + height)
        ];
        this.drawDebug();
    }

    /**
     * 设置为圆形遮挡 (使用多边形逼近)
     */
    public setCircle(x: number, y: number, radius: number, segments: number = 16) {
        const points: Point[] = [];
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new Point(
                x + Math.cos(angle) * radius,
                y + Math.sin(angle) * radius
            ));
        }
        this.shape = points;
        this.drawDebug();
    }

    /**
     * 绘制调试图形（黄色半透明多边形）
     */
    public drawDebug() {
        this._debugGraphics.clear();
        if (this.shape.length < 3) return;

        this._debugGraphics.poly(this.shape);
        this._debugGraphics.fill({ color: 0xffff00, alpha: 0.5 });
        this._debugGraphics.stroke({ color: 0xffff00, width: 2 });
    }
}

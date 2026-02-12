import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    root: './',
    publicDir: process.env.NODE_ENV === 'production' ? false : 'public',
    resolve: {
        alias: {
            'pixijs-light2d': path.resolve(__dirname, './src/index.ts'),
        },
    },
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            name: 'PixiLight2D',
            fileName: (format) => `pixi-light2d.${format}.js`,
        },
        rollupOptions: {
            external: ['pixi.js', '@esotericsoftware/spine-pixi-v8'],
            output: {
                globals: {
                    'pixi.js': 'PIXI',
                    '@esotericsoftware/spine-pixi-v8': 'spine',
                },
            },
        },
    },
    plugins: [
        {
            name: 'pixi-worker-resolver',
            resolveId(id, importer) {
                if (id.startsWith('worker:')) {
                    const relativePath = id.replace('worker:', '');
                    const absolutePath = path.resolve(path.dirname(importer!), relativePath);

                    return `pixi-worker:${absolutePath}`;
                }

                return null;
            },
            load(id) {
                if (id.startsWith('pixi-worker:')) {
                    const workerPath = id.replace('pixi-worker:', '');
                    // 将 Windows 路径转换为 posix 格式，防止反斜杠在字符串中被转义
                    const posixPath = workerPath.replace(/\\/g, '/');

                    return `
                        import WorkerConstructor from "${posixPath}?worker";
                        export default class {
                            constructor() {
                                this.worker = new WorkerConstructor();
                            }
                            static revokeObjectURL() {}
                        }
                    `;
                }

                return null;
            },
            transform(code, id) {
                if (id.endsWith('.vert') || id.endsWith('.frag') || id.endsWith('.wgsl')) {
                    return {
                        code: `export default ${JSON.stringify(code)}`,
                        map: null
                    };
                }
                return undefined;
            }
        }
    ]
});

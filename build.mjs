/**
 * 独立客户端 bundle 构建脚本（方法二：esbuild）
 *
 * 对齐 DSH 加载器契约（packages/client/modules/src/client/manifest.ts + system.ts）：
 *   window.__ModuleLoader__.load({ id, factory: (require) => {
 *     var module = { exports: {} }; var exports = module.exports;
 *     /* bundle body: CJS, externals 走 require() *​/
 *     return module.exports;
 *   } });
 *
 * 外部模块清单与官方 PLATFORM_MODULES（packages/client/web/src/platform.ts）一致，
 * 外加 runtime 豁免项（tsdown.client.ts 的 RUNTIME_STORE_EXEMPTION）。
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 从 DSH 仓库 node_modules 解析 esbuild（本项目暂不单独安装依赖；
// esbuild 是传递依赖，实际在 .pnpm 目录下）
const ESBUILD_MAIN = 'E:/DeepSeek Harness/node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/lib/main.js'
const { build } = createRequire(ESBUILD_MAIN)(ESBUILD_MAIN)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const requirePkg = createRequire(import.meta.url)
const pkg = requirePkg(path.join(__dirname, 'package.json'))
const id = pkg.name

/** 外部模块：加载器模块表（平台模块 + runtime 豁免），bundle 内保留 require() 调用 */
const EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client', // RUNTIME_STORE_EXEMPTION
]

// 宿主半：lib/index.js（DSH loader 需要可 import 的主入口；ESM）
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  logLevel: 'info',
})

// 客户端半：lib/client.js（浏览器 bundle，__ModuleLoader__ 契约）
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: EXTERNALS,
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  sourcemap: false,
  logLevel: 'info',
})

console.log('[build] lib/index.js 与 lib/client.js 均已生成')

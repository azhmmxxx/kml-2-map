import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 子路径部署的 base（如 GitHub Pages 项目站 https://user.github.io/kml-2-map/）。
// 构建时注入：PUBLIC_BASE_PATH=/kml-2-map pnpm build；本地开发不设即根路径。
// 先剥掉多余的头部斜杠再统一补一个，保证结果是 '' 或 '/xxx'——as 仅为满足该模板字面量类型
const rawBase = (process.env.PUBLIC_BASE_PATH ?? '').trim().replace(/^\/+/, '');
const PUBLIC_BASE_PATH = (rawBase === '' ? '' : `/${rawBase}`) as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// 强制开启 runes 模式（库文件除外），Svelte 6 后可移除
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// 纯静态 SPA：所有路由客户端渲染，fallback 页面兜底任意路径
			// 产物 build/ 可直接部署到任意静态托管（Cloudflare Pages 等）
			adapter: adapter({ fallback: 'index.html' }),
			paths: { base: PUBLIC_BASE_PATH }
		})
	]
});

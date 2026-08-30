import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
			adapter: adapter({ fallback: 'index.html' })
		})
	]
});

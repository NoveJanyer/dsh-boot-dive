#!/usr/bin/env node
/**
 * Build standalone previews of both splash modes: open preview/index.html
 * (video, the default) or preview/code.html (pure CSS whale) in any browser,
 * no DSH needed. They render the exact rows the host injects, followed by a
 * stand-in for the app so the handover is visible.
 *
 *   node tools/build-preview.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 2800;
const CAP = 14000;
const TAIL = 800;

const read = (name) => readFileSync(join(ROOT, 'assets', name), 'utf8');
const fill = (text, tokens) => {
	let out = text;
	for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);
	return out;
};

const appCss = `
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
	margin: 0;
	background: #f7f8fb;
	color: #1d2433;
	font-family: "Segoe UI Variable Display", "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
}
#root { height: 100%; }
.fake-boot { height: 100%; display: grid; place-items: center; color: #6b7488; font-size: 13px; letter-spacing: .12em; }
.app { display: flex; height: 100%; background: #fbfcfe; }
.side {
	width: 262px;
	flex: 0 0 262px;
	background: #f2f4f8;
	border-right: 1px solid #e4e8f0;
	padding: 18px 14px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.side-brand { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 600; }
.side-brand .mark { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(145deg, #4d6bfe, #7aa2ff); color: #fff; display: grid; place-items: center; font-size: 10px; letter-spacing: .04em; }
.new { all: unset; cursor: pointer; background: #fff; border: 1px solid #e2e7f0; border-radius: 10px; padding: 9px 12px; font-size: 12.5px; color: #31405e; box-shadow: 0 1px 2px rgba(24, 38, 72, .04); }
.new:hover { border-color: #c9d6ee; }
.side-label { font-size: 10.5px; letter-spacing: .12em; color: #98a1b5; margin-top: 6px; }
.side-item { padding: 8px 10px; border-radius: 8px; font-size: 12.5px; color: #4a5568; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side-item.active { background: #e7ecf7; color: #22304d; font-weight: 600; }
.side-foot { margin-top: auto; font-size: 11.5px; color: #8d96a8; display: flex; gap: 12px; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.top { height: 52px; display: flex; align-items: center; justify-content: space-between; padding: 0 26px; border-bottom: 1px solid #eef1f6; font-size: 12px; color: #7c8699; }
.pill { border: 1px solid #e2e7f0; background: #fff; border-radius: 999px; padding: 4px 10px; font-size: 10.5px; letter-spacing: .06em; color: #5a6a86; }
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; text-align: center; }
.empty .glyph { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; color: #fff; font-size: 17px; font-weight: 600; letter-spacing: .02em; background: linear-gradient(145deg, #4d6bfe, #83a8ff); box-shadow: 0 18px 40px -18px rgba(77, 107, 254, .65); }
.empty h1 { margin: 6px 0 0; font-size: clamp(22px, 2.4vw, 30px); font-weight: 600; letter-spacing: .01em; color: #1b2538; }
.empty p { margin: 0; font-size: 12.5px; color: #8b95a8; }
.composer { width: min(620px, 72vw); margin-top: 20px; background: #fff; border: 1px solid #e2e7f0; border-radius: 16px; padding: 16px 18px; display: flex; align-items: center; justify-content: space-between; color: #9aa3b4; font-size: 13px; box-shadow: 0 10px 30px -22px rgba(24, 38, 72, .35); }
.composer kbd { font-family: "Cascadia Code", Consolas, monospace; font-size: 10px; color: #8792a6; border: 1px solid #e6eaf2; border-radius: 6px; padding: 3px 6px; background: #f7f9fc; }
`;

const appHtml = `
<div class="app">
	<aside class="side">
		<div class="side-brand"><span class="mark">DS</span>DeepSeek Harness</div>
		<button class="new">＋ 新建对话</button>
		<div class="side-label">今天</div>
		<div class="side-item active">深潜启动序列怎么做</div>
		<div class="side-item">开机动画为什么不能等插件加载</div>
		<div class="side-item">index-inject 的三行注入</div>
		<div class="side-label">昨天</div>
		<div class="side-item">桌面端和 dsh web 的差别</div>
		<div class="side-item">把首帧挡在 Loading 卡片前面</div>
		<div class="side-foot"><span>设置</span><span>插件</span><span>关于</span></div>
	</aside>
	<main class="main">
		<header class="top"><span>DeepSeek Harness</span><span class="pill">deepseek-flash</span></header>
		<section class="empty">
			<div class="glyph">DS</div>
			<h1>今天想聊点什么？</h1>
			<p>打开软件的那两秒，也可以很好看。</p>
			<div class="composer"><span>给 DeepSeek 发送消息…</span><kbd>Enter</kbd></div>
		</section>
	</main>
</div>`;

const page = (title, css, html, js, extra) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
${appCss}
</style>
<style>
${css}
</style>
</head>
<body>
${html}
<div id="root"><div class="fake-boot">BOOTING DEEPSEEK HARNESS…</div></div>
<template id="app-template">${appHtml}</template>
<script>
(function () {
	var params = new URLSearchParams(location.search);
	var boot = document.querySelector('[data-dsbd]');
	if (boot !== null && params.has('hold')) {
		boot.setAttribute('data-min', '600000');
		boot.setAttribute('data-cap', '600000');
	}
	var video = document.querySelector('.dsbdv-video');
	var videoRoot = document.querySelector('[data-dsbdv]');
	if (videoRoot !== null && params.get('sound') === '0') videoRoot.setAttribute('data-sound', '0');
	if (video !== null && params.has('t')) {
		video.addEventListener('loadedmetadata', function () {
			video.currentTime = Number(params.get('t')) || 0;
			video.pause();
		});
	}
	window.setTimeout(function () {
		var root = document.getElementById('root');
		var template = document.getElementById('app-template');
		if (root !== null && template !== null) root.innerHTML = template.innerHTML;
	}, 900);
})();
</script>
${extra}
</body>
</html>
`;

/* ---- code mode ---- */
const codeCss = fill(read('boot.css'), { __ACCENT__: '#5b8cff', __FAILSAFE_MS__: String(CAP + 1500) });
const codeHtml = fill(read('boot.html'), {
	'{{MIN}}': String(MIN),
	'{{CAP}}': String(CAP),
	'{{SKIP}}': '1',
	'{{WORDMARK}}': 'DEEPSEEK',
	'{{TAGLINE}}': 'DIVE SEQUENCE'
});
const codeJs = read('boot.js');
const codePage = page('dsh-boot-dive · 纯代码版预览', codeCss, codeHtml, codeJs, `<script>\n${codeJs}\n</script>`);

/* ---- video mode ---- */
const videoB64 = readFileSync(join(ROOT, 'assets', 'video', 'boot.mp4')).toString('base64');
const videoCss = fill(read('boot-video.css'), {
	__ACCENT__: '#5b8cff',
	__TAIL_MS__: String(TAIL),
	__FAILSAFE_MS__: String(CAP + 1500)
});
const videoHtml = fill(read('boot-video.html'), {
	'{{VIDEO}}': `data:video/mp4;base64,${videoB64}`,
	'{{DUR}}': '8.10',
	'{{TAIL}}': String(TAIL),
	'{{CAP}}': String(CAP),
	'{{SKIP}}': '1',
	'{{SOUND}}': '1'
});
const videoJs = read('boot-video.js');
const videoPage = page('dsh-boot-dive · 视频版预览', videoCss, videoHtml, videoJs, `<script>\n${videoJs}\n</script>`);

mkdirSync(join(ROOT, 'preview'), { recursive: true });
writeFileSync(join(ROOT, 'preview', 'index.html'), videoPage, 'utf8');
writeFileSync(join(ROOT, 'preview', 'code.html'), codePage, 'utf8');
console.log(`preview/index.html (video) ${(videoPage.length / 1024 / 1024).toFixed(2)} MiB`);
console.log(`preview/code.html  (code)  ${(codePage.length / 1024).toFixed(1)} KiB`);

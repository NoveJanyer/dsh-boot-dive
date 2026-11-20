#!/usr/bin/env node
/**
 * Static self-check for both splash modes, zero dependencies:
 *
 *   node tools/check.mjs
 *
 * Verifies the injected rows, placeholder substitution, class coverage, that
 * the inline assets make no network requests, that the film is a real
 * faststart mp4, and that every timeout/failsafe still outlives the paths that
 * depend on it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(ROOT, 'assets', name), 'utf8');
const readBin = (name) => readFileSync(join(ROOT, 'assets', name));

const failures = [];
const notes = [];
const check = (condition, message) => {
	if (condition) notes.push(`ok   ${message}`);
	else failures.push(`FAIL ${message}`);
};

const css = read('boot.css');
const html = read('boot.html');
const js = read('boot.js');
const vCss = read('boot-video.css');
const vHtml = read('boot-video.html');
const vJs = read('boot-video.js');
const lib = readFileSync(join(ROOT, 'lib', 'index.js'), 'utf8');

check(!(css + html + js + vCss + vHtml + vJs).match(/https?:\/\/(?!www\.w3\.org)/i), 'no external URL in the inline assets');
check(!/<script\s+src=/i.test(html + vHtml), 'no external <script src> (desktop rejects failed loads at boot)');
check(!/fetch\s*\(/.test(js + vJs), 'handover does not fetch anything');

/* ------------------------------------------------------------------ code mode */

check(/__ACCENT__/.test(css) && /__FAILSAFE_MS__/.test(css), 'code css has its placeholders');
check(html.match(/\{\{(MIN|CAP|SKIP|WORDMARK|TAGLINE)\}\}/g)?.length === 5, 'code markup has five placeholders');
check(/data-dsh-boot/.test(js) && /getElementById\('root'\)/.test(js), 'code handover watches the boot card and #root');
check(/Escape/.test(js) && /pointerdown/.test(js), 'code skip works from keyboard and pointer');
check(/setTimeout\(release, CAP\)/.test(js), 'code hard cap releases the layer');

/* ----------------------------------------------------------------- video mode */

const video = readBin(join('video', 'boot.mp4'));
check(video.length > 100_000 && video.length < 4 * 1024 * 1024, `film is a sane inline size (${(video.length / 1024 / 1024).toFixed(2)} MiB)`);
check(video.subarray(4, 8).toString('ascii') === 'ftyp', 'film starts with an mp4 ftyp box');

/** Walk the top-level mp4 boxes and confirm moov precedes mdat (faststart). */
function boxOrder(buffer) {
	const order = {};
	let offset = 0;
	while (offset + 8 <= buffer.length) {
		const size = buffer.readUInt32BE(offset);
		const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
		if (size < 8) break;
		if (type === 'moov' || type === 'mdat') order[type] = offset;
		offset += size;
	}
	return order;
}
const boxes = boxOrder(video);
check(boxes.moov !== undefined && boxes.mdat !== undefined && boxes.moov < boxes.mdat, 'film is faststart (moov before mdat)');

check(vHtml.match(/\{\{(VIDEO|DUR|TAIL|CAP|SKIP|SOUND)\}\}/g)?.length === 6, 'video markup has six placeholders');
check(!/\bposter=/.test(vHtml), 'no poster attribute (a late poster frame flashed before playback)');
check(/__ACCENT__/.test(vCss) && /__TAIL_MS__/.test(vCss) && /__FAILSAFE_MS__/.test(vCss), 'video css has its placeholders');
check(/dsbdv-video/.test(vHtml) && /\.dsbdv-video/.test(vCss), 'film element has a style');
check(!/dsbdv-(brand|selfcheck|caption)/.test(vHtml + vCss), 'brand / self-check / caption chrome removed');
check(/data-dsbdv/.test(vJs) && /duration\(\)/.test(vJs), 'video handover reads the film duration');
check(/time >= total - 0\.02/.test(vJs) && !/total - time <= TAIL/.test(vJs), 'fade starts only after the film reaches its last frame');
check(/beginExit\(true\)/.test(vJs) && /Escape/.test(vJs), 'video skip works from keyboard and pointer');
check(/setTimeout\(function \(\) \{\s*if \(!exiting\) beginExit\(false, true\);\s*\}, CAP\)/.test(vJs), 'video hard cap releases the layer');
check(/data-dsbdv-error/.test(vHtml + vCss + vJs), 'a broken film has an explicit fallback');
check(/data-sound/.test(vHtml) && /unlockSound/.test(vJs) && /soundBlocked/.test(vJs), 'sound has an unmute-on-click fallback');
check(/fadeSound/.test(vJs) && /video\.volume/.test(vJs), 'audio follows the exit ramp');
check(video.includes(Buffer.from('mp4a')), 'film carries an AAC audio track');
check(/durationMs: 8100/.test(lib), 'host fallback duration matches the film');

/* --------------------------------------------------------------- both modes */

for (const [label, markup, style] of [
	['code', html, css],
	['video', vHtml, vCss]
]) {
	const classes = new Set();
	for (const match of markup.matchAll(/class="([^"]+)"/g)) {
		for (const name of match[1].split(/\s+/)) if (name !== '') classes.add(name);
	}
	for (const name of classes) {
		if (label === 'code' && (name === 'a1' || name === 'a2')) continue;
		check(style.includes(`.${name}`), `${label} class .${name} has a style rule`);
	}
}

check(/prefers-reduced-motion:\s*reduce/.test(css) && /prefers-reduced-motion:\s*reduce/.test(vCss), 'both modes have a reduced-motion path');
check(/dsbd-failsafe/.test(css) && /dsbdv-failsafe/.test(vCss), 'both modes have a CSS failsafe');
check(/FAILSAFE_MARGIN_MS = 1500/.test(lib) && /maxShowMs \+ FAILSAFE_MARGIN_MS/.test(lib), 'failsafe outlives the hard cap in both modes');
check(/mode === 'video'/.test(lib) && /buildVideoRows/.test(lib) && /buildCodeRows/.test(lib), 'host selects video or code mode');
check(/data:video\/mp4;base64/.test(lib) && !/poster\.jpg/.test(lib), 'host inlines the film and no poster');

/* ------------------------------------------------------- placed tokens clean */

const filled = {
	codeCss: css.replaceAll('__ACCENT__', '#5b8cff').replaceAll('__FAILSAFE_MS__', '15500'),
	codeHtml: html.replaceAll('{{MIN}}', '2800').replaceAll('{{CAP}}', '14000').replaceAll('{{SKIP}}', '1').replaceAll('{{WORDMARK}}', 'DEEPSEEK').replaceAll('{{TAGLINE}}', 'DIVE SEQUENCE'),
	videoCss: vCss.replaceAll('__ACCENT__', '#5b8cff').replaceAll('__TAIL_MS__', '1600').replaceAll('__FAILSAFE_MS__', '15500'),
	videoHtml: vHtml.replaceAll('{{VIDEO}}', 'data:video/mp4;base64,AA==').replaceAll('{{DUR}}', '8.10').replaceAll('{{TAIL}}', '1600').replaceAll('{{CAP}}', '14000').replaceAll('{{SKIP}}', '1').replaceAll('{{SOUND}}', '1')
};
for (const [name, text] of Object.entries(filled)) {
	check(!/\{\{[A-Z_]+\}\}|__[A-Z_]+__(?:MS)?/.test(text), `${name} has no unplaced token`);
}

for (const note of notes) console.log(note);
if (failures.length > 0) {
	for (const failure of failures) console.error(failure);
	console.error(`\n${failures.length} check(s) failed`);
	process.exitCode = 1;
} else {
	console.log(`\nall ${notes.length} checks passed`);
}

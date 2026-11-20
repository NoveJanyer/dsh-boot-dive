/**
 * dsh-boot-dive — host half, and the whole plugin.
 *
 * A boot splash must exist before the application mounts, and the only
 * supported place for that is the boot document itself. This plugin therefore
 * contributes inline rows to `webserver/index-inject`:
 *
 *   style  → the visual shell, head
 *   html   → the overlay (film + HUD), first thing in <body>, before #root
 *   script → the handover (tail crossfade / cap / skip), body
 *
 * Default mode is `video`: an 8s 720p film inlined as a data URI, muted, with
 * the last 1.6s crossfading into the app. `mode: 'code'` keeps the original
 * pure-CSS whale sequence as an alternative.
 *
 * Inline rows are deliberate:
 *
 * - `dsh web` renders them straight into index.html;
 * - DSH Desktop receives the same rows over IPC and applies them page-side
 *   before `__DSH_BOOT_READY__` settles, so the splash also covers the
 *   `dsh-app://` shell — no `tapIndex`, no <script src>, nothing to 404.
 *
 * If an asset cannot be read the plugin injects nothing (or falls back to the
 * code sequence) and the app boots normally; a splash must never be able to
 * keep the application shut.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAILSAFE_MARGIN_MS = 1500;

const DEFAULTS = {
	enabled: true,
	/** 'video' (default) or 'code'. */
	mode: 'video',
	accent: '#5b8cff',
	/** code mode: how long the drawing is guaranteed to stay, in ms. */
	minShowMs: 2800,
	/** Hard cap; for video it also bounds "film ended, app not ready yet". */
	maxShowMs: 14000,
	/** video mode: fade-out length after the film has fully ended, in ms. */
	tailMs: 800,
	/** video mode: fallback duration when metadata is unavailable. */
	durationMs: 8100,
	/** video mode: try the film's own audio (falls back to muted + one click). */
	sound: true,
	allowSkip: true,
	wordmark: 'DEEPSEEK',
	tagline: 'DIVE SEQUENCE'
};

function readField(source, key) {
	if (source === null || typeof source !== 'object') return undefined;
	const field = source[key];
	if (field === null || field === undefined) return undefined;
	return typeof field.get === 'function' ? field.get() : field;
}

function readFlag(source, key, fallback) {
	const value = readField(source, key);
	return typeof value === 'boolean' ? value : fallback;
}

function readNumber(source, key, fallback, min, max) {
	const value = Number(readField(source, key));
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

function readText(source, key, fallback, limit) {
	const value = readField(source, key);
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	if (trimmed === '') return fallback;
	return trimmed.slice(0, limit);
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function readOptions(config) {
	const minShowMs = readNumber(config, 'minShowMs', DEFAULTS.minShowMs, 800, 15000);
	const maxShowMs = Math.max(readNumber(config, 'maxShowMs', DEFAULTS.maxShowMs, 2000, 60000), minShowMs + 400);
	const accent = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(readField(config, 'accent') ?? ''))
		? String(readField(config, 'accent'))
		: DEFAULTS.accent;
	const mode = readField(config, 'mode') === 'code' ? 'code' : 'video';

	return {
		enabled: readFlag(config, 'enabled', DEFAULTS.enabled),
		mode,
		accent,
		minShowMs,
		maxShowMs,
		tailMs: readNumber(config, 'tailMs', DEFAULTS.tailMs, 400, 5000),
		durationMs: readNumber(config, 'durationMs', DEFAULTS.durationMs, 1000, 60000),
		sound: readFlag(config, 'sound', DEFAULTS.sound),
		allowSkip: readFlag(config, 'allowSkip', DEFAULTS.allowSkip),
		wordmark: readText(config, 'wordmark', DEFAULTS.wordmark, 24),
		tagline: readText(config, 'tagline', DEFAULTS.tagline, 32)
	};
}

function fill(text, tokens) {
	let out = text;
	for (const [token, value] of Object.entries(tokens)) out = out.split(token).join(value);
	return out;
}

const readAsset = (name) => readFileSync(join(ROOT, 'assets', name), 'utf8');

/** The original pure-CSS whale sequence. */
function buildCodeRows(options) {
	const style = fill(readAsset('boot.css'), {
		__ACCENT__: options.accent,
		__FAILSAFE_MS__: String(options.maxShowMs + FAILSAFE_MARGIN_MS)
	});
	const html = fill(readAsset('boot.html'), {
		'{{MIN}}': String(options.minShowMs),
		'{{CAP}}': String(options.maxShowMs),
		'{{SKIP}}': options.allowSkip ? '1' : '0',
		'{{WORDMARK}}': escapeHtml(options.wordmark),
		'{{TAGLINE}}': escapeHtml(options.tagline)
	});
	const script = readAsset('boot.js');

	return [
		{ kind: 'style', text: style },
		{ kind: 'html', placement: 'body', html },
		{ kind: 'script', placement: 'body', text: script }
	];
}

/** The film, inlined so desktop and web both get it without a route. */
function buildVideoRows(options) {
	const video = readFileSync(join(ROOT, 'assets', 'video', 'boot.mp4')).toString('base64');

	const style = fill(readAsset('boot-video.css'), {
		__ACCENT__: options.accent,
		__TAIL_MS__: String(options.tailMs),
		__FAILSAFE_MS__: String(options.maxShowMs + FAILSAFE_MARGIN_MS)
	});
	const html = fill(readAsset('boot-video.html'), {
		'{{VIDEO}}': `data:video/mp4;base64,${video}`,
		'{{DUR}}': String(options.durationMs / 1000),
		'{{TAIL}}': String(options.tailMs),
		'{{CAP}}': String(options.maxShowMs),
		'{{SKIP}}': options.allowSkip ? '1' : '0',
		'{{SOUND}}': options.sound ? '1' : '0'
	});
	const script = readAsset('boot-video.js');

	return [
		{ kind: 'style', text: style },
		{ kind: 'html', placement: 'body', html },
		{ kind: 'script', placement: 'body', text: script }
	];
}

function buildRows(options) {
	if (options.mode === 'video') {
		try {
			return buildVideoRows(options);
		} catch (error) {
			// Film missing or unreadable: fall back to the drawing, never to a dead screen.
			return buildCodeRows(options);
		}
	}
	return buildCodeRows(options);
}

/**
 * Contribute the opening sequence to every boot document the host renders.
 * A failure here means "no splash", never "no app".
 * @param ctx - Host plugin context.
 * @param config - Optional per-surface overrides from the profile patch.
 */
export function apply(ctx, config) {
	let rows;
	try {
		const options = readOptions(config);
		if (!options.enabled) return;
		rows = buildRows(options);
	} catch (error) {
		ctx.logger?.('dsh-boot-dive')?.warn?.(`boot splash skipped: ${error instanceof Error ? error.message : String(error)}`);
		return;
	}

	ctx.on('webserver/index-inject', (table) => {
		table.push(...rows);
	});
}

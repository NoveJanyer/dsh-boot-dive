/*
 * dsh-boot-dive — handover
 *
 * The visual sequence is pure CSS: this script only counts the percentage and
 * decides when the layer may leave:
 *
 *   1. the app mounted (its own [data-dsh-boot] card is gone, or #root filled),
 *      but never before minShowMs — the opening motion gets to finish;
 *   2. the hard cap — a slow or broken app can never be locked out;
 *   3. the user skipped — click / Esc / Space / Enter.
 *
 * If this script never runs, the CSS failsafe in boot.css hides the layer at
 * cap + 1.5s anyway.
 */
(function () {
	var root = document.querySelector('[data-dsbd]');
	if (root === null || root.getAttribute('data-dsbd-active') === '1') return;
	root.setAttribute('data-dsbd-active', '1');

	var MIN = clamp(Number(root.getAttribute('data-min')) || 2600, 300, 20000);
	var CAP = clamp(Number(root.getAttribute('data-cap')) || 9000, 1000, 60000);
	var ALLOW_SKIP = root.getAttribute('data-skip') === '1';

	var started = Date.now();
	var released = false;
	var sawBootCard = false;
	var fill = root.querySelector('.dsbd-bar i');
	var pct = root.querySelector('.dsbd-pct');
	var phase = root.querySelector('.dsbd-phase');

	var pollId = 0;
	var capId = 0;
	var minId = 0;
	var rafId = 0;

	var PHASES = [
		[0, '初始化内核'],
		[46, '装载插件图'],
		[74, '恢复会话'],
		[93, '链路握手']
	];
	var lastPhase = '';

	function clamp(value, low, high) {
		return Math.min(high, Math.max(low, value));
	}

	function setProgress(value) {
		var rounded = Math.round(clamp(value, 0, 100));
		if (fill !== null) fill.style.width = rounded + '%';
		if (pct !== null && pct.firstChild !== null) pct.firstChild.nodeValue = String(rounded);
	}

	function setPhase(value) {
		var label = PHASES[0][1];
		for (var i = 0; i < PHASES.length; i++) {
			if (value >= PHASES[i][0]) label = PHASES[i][1];
		}
		if (phase !== null && label !== lastPhase) {
			lastPhase = label;
			phase.textContent = label;
		}
	}

	function tick() {
		if (released) return;
		var t = Math.min(1, (Date.now() - started) / MIN);
		var eased = t * t * (3 - 2 * t);
		var value = 92 * eased;
		setProgress(value);
		setPhase(value);
		rafId = window.requestAnimationFrame(tick);
	}

	function appMounted() {
		var card = document.querySelector('[data-dsh-boot]');
		if (card !== null) {
			sawBootCard = true;
			return false;
		}
		var host = document.getElementById('root');
		if (host === null || host.firstElementChild === null) return false;
		if (!sawBootCard && Date.now() - started < MIN) return false;
		return true;
	}

	function check() {
		if (released) return;
		if (appMounted()) requestRelease();
	}

	function requestRelease() {
		if (released || minId !== 0) return;
		var remain = MIN - (Date.now() - started);
		if (remain <= 0) release();
		else minId = window.setTimeout(release, remain);
	}

	function release() {
		if (released) return;
		released = true;

		window.clearInterval(pollId);
		window.clearTimeout(capId);
		window.clearTimeout(minId);
		window.cancelAnimationFrame(rafId);

		setProgress(100);
		if (phase !== null) phase.textContent = '就绪 · READY';

		root.setAttribute('data-dsbd-exit', '');
		root.style.animation = 'none';

		var drop = function () {
			if (root.parentNode !== null) root.parentNode.removeChild(root);
		};
		var onEnd = function (event) {
			if (event.target !== root || event.propertyName !== 'opacity') return;
			root.removeEventListener('transitionend', onEnd);
			drop();
		};
		root.addEventListener('transitionend', onEnd);
		window.setTimeout(drop, 900);
	}

	if (ALLOW_SKIP) {
		root.addEventListener('pointerdown', release);
		window.addEventListener(
			'keydown',
			function (event) {
				if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
					event.preventDefault();
					release();
				}
			},
			true
		);
	}

	setProgress(0);
	tick();
	pollId = window.setInterval(check, 120);
	check();
	capId = window.setTimeout(release, CAP);
})();

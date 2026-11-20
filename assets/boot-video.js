/*
 * dsh-boot-dive — video handover
 *
 * The film is 8.1s long and carries its own audio track. The layer leaves in
 * one of three ways:
 *
 *   1. the film enters its last `tailMs` AND the app has mounted → crossfade
 *      out over exactly that remaining time, so the app arrives as it ends;
 *   2. the film ends before the app is ready → hold the last frame until the
 *      app mounts, then fade (or until the hard cap);
 *   3. the user skips — click / Esc / Space / Enter.
 *
 * Sound: an unmuted autoplay is attempted first. Chromium usually answers
 * "no user gesture" and rejects; then playback continues muted and the hint
 * asks for one click to unlock the audio (that click does not exit). A second
 * click, or Esc, exits. The volume follows the same tail ramp as the picture.
 *
 * A hard cap and the CSS failsafe both outlive every script path, so a broken
 * film can only mean "no splash", never "no app".
 */
(function () {
	var root = document.querySelector('[data-dsbdv]');
	if (root === null || root.getAttribute('data-dsbdv-active') === '1') return;
	root.setAttribute('data-dsbdv-active', '1');

	var video = root.querySelector('.dsbdv-video');
	var fill = root.querySelector('.dsbdv-meter i');
	var pct = root.querySelector('.dsbdv-pct');
	var phase = root.querySelector('.dsbdv-phase');
	var hint = root.querySelector('.dsbdv-skip');

	var DURATION = clamp(Number(root.getAttribute('data-dur')) || 8.1, 1, 120);
	var TAIL = clamp(Number(root.getAttribute('data-tail')) || 1600, 400, 5000);
	var CAP = clamp(Number(root.getAttribute('data-cap')) || 14000, 2000, 60000);
	var ALLOW_SKIP = root.getAttribute('data-skip') === '1';
	var WANT_SOUND = root.getAttribute('data-sound') !== '0';
	var REDUCED = false;
	try {
		REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch (error) {
		REDUCED = false;
	}

	var started = Date.now();
	var ready = false;
	var exiting = false;
	var failed = false;
	var sawBootCard = false;
	var soundOn = false;
	var soundBlocked = false;
	var pollId = 0;
	var capId = 0;
	var rafId = 0;

	function clamp(value, low, high) {
		return Math.min(high, Math.max(low, value));
	}

	function duration() {
		var value = video !== null ? Number(video.duration) : NaN;
		return Number.isFinite(value) && value > 0.5 ? value : DURATION;
	}

	function setProgress(value) {
		var rounded = Math.round(clamp(value, 0, 100));
		if (fill !== null) fill.style.width = rounded + '%';
		if (pct !== null && pct.firstChild !== null) pct.firstChild.nodeValue = String(rounded);
	}

	function setPhase(value) {
		if (phase === null) return;
		phase.textContent = value < 16 ? '唤醒视觉' : value < 56 ? '载入界面' : value < 86 ? '恢复会话' : '即将就绪';
	}

	function updateHint() {
		if (hint === null) return;
		if (soundBlocked && !soundOn) {
			hint.textContent = '点击开启声音 · ESC 跳过';
			hint.style.animation = 'none';
			hint.style.opacity = '1';
			root.setAttribute('data-dsbdv-muted', '');
		} else {
			hint.textContent = '点击任意处 或 ESC 跳过';
			root.removeAttribute('data-dsbdv-muted');
		}
		root.setAttribute('data-dsbdv-sound', soundOn ? 'on' : soundBlocked ? 'blocked' : 'off');
	}

	function fadeSound(ms) {
		if (video === null || video.muted || !soundOn || video.ended) return;
		var from = video.volume;
		var start = window.performance.now();
		var step = function () {
			var ratio = Math.min(1, (window.performance.now() - start) / ms);
			try {
				video.volume = Math.max(0, from * (1 - ratio));
			} catch (error) {
				return;
			}
			if (ratio < 1) {
				window.requestAnimationFrame(step);
			} else {
				try {
					video.pause();
				} catch (error) {
					/* already gone */
				}
			}
		};
		window.requestAnimationFrame(step);
	}

	function tick() {
		if (exiting) return;

		var total = duration();
		var time = video !== null ? Number(video.currentTime) : 0;
		if (!Number.isFinite(time) || time < 0) time = 0;

		var progress = total > 0 ? Math.min(100, (time / total) * 100) : 0;
		setProgress(progress);
		setPhase(progress);

		if (ready && time >= total - 0.02 && time > 0.4) {
			// The film has reached its last frame: hold it, then fade out.
			beginExit(false);
			return;
		}
		if (video !== null && video.ended && ready) {
			beginExit(false);
			return;
		}
		if (video !== null && video.ended && !ready) setPhase(100);

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
		if (!sawBootCard && Date.now() - started < 900) return false;
		return true;
	}

	function check() {
		if (exiting) return;
		if (!ready && appMounted()) ready = true;
		if (ready && video !== null) {
			var total = duration();
			var time = Number(video.currentTime);
			// The rAF loop is throttled in background tabs; this poll still lets
			// the held last frame fade once the app is ready.
			if (video.ended || (Number.isFinite(time) && time >= total - 0.02)) beginExit(false);
		}
	}

	function beginExit(skipped, fadeAudio) {
		if (exiting) return;
		exiting = true;

		window.clearInterval(pollId);
		window.clearTimeout(capId);
		window.cancelAnimationFrame(rafId);

		// A normal ending is never faded by us: the audio track ends with the
		// film and must not be attenuated early. Only a skip (or a hard cap)
		// ramps the volume down before the element is removed.
		if (skipped || fadeAudio) fadeSound(skipped ? 380 : 500);
		setProgress(100);
		if (fill !== null && !skipped && !REDUCED) fill.style.transitionDuration = TAIL + 'ms';
		if (phase !== null) phase.textContent = skipped ? '跳过 · SKIP' : failed ? '继续 · CONTINUE' : '就绪 · READY';

		if (skipped || REDUCED) root.style.transitionDuration = '420ms';
		root.setAttribute('data-dsbdv-exit', '');
		root.style.animation = 'none';

		var wait = skipped || REDUCED ? 520 : TAIL + 100;
		var drop = function () {
			if (root.parentNode !== null) root.parentNode.removeChild(root);
		};
		var onEnd = function (event) {
			if (event.target !== root || event.propertyName !== 'opacity') return;
			root.removeEventListener('transitionend', onEnd);
			drop();
		};
		root.addEventListener('transitionend', onEnd);
		window.setTimeout(drop, wait + 500);
	}

	function fail() {
		if (failed) return;
		failed = true;
		root.setAttribute('data-dsbdv-error', '');
		// No film: keep the shell for a beat, then let the app through.
		var wait = ready ? 500 : 1600;
		window.setTimeout(function () {
			if (!exiting) beginExit(true);
		}, wait);
	}

	function playMuted() {
		if (video === null) return;
		video.muted = true;
		var started = video.play();
		if (started !== undefined && typeof started.catch === 'function') started.catch(fail);
	}

	function startPlayback() {
		if (video === null) {
			fail();
			return;
		}
		video.volume = 0.9;
		if (!WANT_SOUND) {
			playMuted();
			updateHint();
			return;
		}

		video.muted = false;
		var attempt = video.play();
		if (attempt === undefined || typeof attempt.then !== 'function') {
			soundOn = true;
			updateHint();
			return;
		}
		attempt.then(
			function () {
				soundOn = true;
				updateHint();
			},
			function () {
				// Autoplay with sound was refused; keep the picture, ask for one click.
				soundBlocked = true;
				updateHint();
				playMuted();
			}
		);
	}

	function unlockSound() {
		if (video === null) {
			beginExit(true);
			return;
		}
		video.muted = false;
		video.volume = 0.9;
		var attempt = video.play();
		if (attempt === undefined || typeof attempt.then !== 'function') {
			soundOn = true;
			soundBlocked = false;
			updateHint();
			return;
		}
		attempt.then(
			function () {
				soundOn = true;
				soundBlocked = false;
				updateHint();
			},
			function () {
				// Still refused: don't trap the user on a silent splash.
				beginExit(true);
			}
		);
	}

	if (video !== null) {
		video.addEventListener('error', fail);
		video.addEventListener('stalled', function () {
			if (video.readyState === 0) fail();
		});
	}

	if (ALLOW_SKIP) {
		root.addEventListener('pointerdown', function () {
			if (!soundOn && soundBlocked) {
				unlockSound();
				return;
			}
			beginExit(true);
		});
		window.addEventListener(
			'keydown',
			function (event) {
				if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
					event.preventDefault();
					beginExit(true);
				}
			},
			true
		);
	}

	updateHint();
	setProgress(0);
	startPlayback();
	tick();
	pollId = window.setInterval(check, 120);
	check();
	capId = window.setTimeout(function () {
		if (!exiting) beginExit(false, true);
	}, CAP);
})();

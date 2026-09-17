// track-player.js
// Handles play/pause for the library tracks and draws an animated
// waveform per track.
//
// Waveform bars are shown as soon as the page loads by fetching a
// tiny precomputed peaks file per track (assets/waveforms/<name>.json,
// a few hundred bytes — see generate_waveforms.py). The actual mp3 is
// only downloaded when the user presses play, so the page never has
// to pull down the full audio library just to draw bars.

document.addEventListener('DOMContentLoaded', () => {
    const PLAY_SRC = 'assets/icons/play.svg';
    const PAUSE_SRC = 'assets/icons/pause.svg';
    const SEGMENTS = 64;
    const BAR_WIDTH = 4;
    const BAR_SPACING = 4;
    const MAX_BAR_HEIGHT = 35;

    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    // assets/audio/water.mp3 -> assets/waveforms/water.json
    function peaksUrlFor(audioSrc) {
        const file = audioSrc.split('/').pop().replace(/\.[^.]+$/, '.json');
        return audioSrc.replace(/assets\/audio\/[^/]+$/, `assets/waveforms/${file}`);
    }

    class TrackWaveform {
        constructor(container, audio) {
            this.audio = audio;
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'waveform';
            container.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.data = null;
            this.loadingPeaks = null;
            this.decodingFull = false;

            audio.addEventListener('timeupdate', () => {
                if (audio.duration) this.draw(audio.currentTime / audio.duration);
            });

            this._bindSeeking();
            this._bindResize(container);
            this._loadPeaks();
        }

        // Loads the small precomputed peaks file so bars are visible
        // immediately on page load — no audio download required.
        _loadPeaks() {
            const src = this.audio.querySelector('source')?.src || this.audio.src;
            this.loadingPeaks = fetch(peaksUrlFor(src))
                .then((res) => {
                    if (!res.ok) throw new Error('Failed to fetch waveform peaks');
                    return res.json();
                })
                .then((peaks) => {
                    this.data = peaks;
                    this.draw(0);
                })
                .catch((err) => {
                    console.warn('Precomputed waveform missing; will fall back to decoding on play', err);
                });
        }

        // Only used as a fallback if a track has no precomputed peaks
        // file (e.g. a newly added track before the build step runs).
        // Fetches and decodes the full mp3 the first time it's played.
        ensureLoaded() {
            if (this.data || this.decodingFull) return;
            this.decodingFull = true;
            const src = this.audio.querySelector('source')?.src || this.audio.src;

            fetch(src)
                .then((res) => {
                    if (!res.ok) throw new Error('Failed to fetch audio');
                    return res.arrayBuffer();
                })
                .then((buf) => getAudioContext().decodeAudioData(buf))
                .then((decoded) => {
                    this.data = this._amplitudesFrom(decoded);
                    this.draw(0);
                })
                .catch((err) => {
                    console.warn('Waveform generation failed; using placeholder data', err);
                    this.data = Array.from({ length: SEGMENTS }, () => Math.random() * 0.5 + 0.5);
                    this.draw(0);
                })
                .finally(() => {
                    this.decodingFull = false;
                });
        }

        _amplitudesFrom(decodedAudio) {
            const channelData = decodedAudio.getChannelData(0);
            const blockSize = Math.floor(channelData.length / SEGMENTS);
            const amplitudes = [];
            for (let i = 0; i < SEGMENTS; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(channelData[i * blockSize + j]);
                }
                amplitudes.push(sum / blockSize);
            }
            const maxVal = Math.max(...amplitudes) || 1;
            return amplitudes.map((v) => v / maxVal);
        }

        _calcLayout(width, bars) {
            let bw = BAR_WIDTH;
            let sp = BAR_SPACING;
            if (!width || !bars) return { bw, sp, totalWidth: 0, offsetX: 0 };
            let total = bars * bw + (bars - 1) * sp;
            if (total > width && bars > 1) {
                const unit = width / (2 * bars - 1);
                bw = Math.max(1, unit);
                sp = bw;
                total = bars * bw + (bars - 1) * sp;
            }
            const offsetX = Math.max((width - total) / 2, 0);
            return { bw, sp, totalWidth: total, offsetX };
        }

        draw(progress = 0) {
            const canvas = this.canvas;
            const ctx = this.ctx;
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = MAX_BAR_HEIGHT;
            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);
            if (!this.data) return;

            const bars = this.data.length;
            const { bw, sp, offsetX } = this._calcLayout(width, bars);
            const p = Math.min(1, Math.max(0, progress));
            const highlightIndex = Math.floor(p * bars);

            for (let i = 0; i < bars; i++) {
                const barHeight = this.data[i] * MAX_BAR_HEIGHT;
                const x = offsetX + i * (bw + sp);
                const y = (height - barHeight) / 2;
                ctx.fillStyle = i <= highlightIndex ? '#ffffff' : 'rgba(255,255,255,0.4)';
                const r = Math.min(2, bw / 2, barHeight / 2);
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, y, bw, barHeight, r);
                } else {
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + bw - r, y);
                    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
                    ctx.lineTo(x + bw, y + barHeight - r);
                    ctx.quadraticCurveTo(x + bw, y + barHeight, x + bw - r, y + barHeight);
                    ctx.lineTo(x + r, y + barHeight);
                    ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - r);
                    ctx.lineTo(x, y + r);
                    ctx.quadraticCurveTo(x, y, x + r, y);
                }
                ctx.closePath();
                ctx.fill();
            }
        }

        _bindSeeking() {
            const { canvas, audio } = this;
            let seeking = false;
            let activePointerId = null;

            const getClientX = (evt) => {
                if (evt.touches?.length) return evt.touches[0].clientX;
                if (evt.changedTouches?.length) return evt.changedTouches[0].clientX;
                return evt.clientX;
            };

            const updateCurrentTime = (evt) => {
                const rect = canvas.getBoundingClientRect();
                const x = getClientX(evt) - rect.left;
                let ratio;
                if (this.data?.length) {
                    const { totalWidth, offsetX } = this._calcLayout(canvas.width, this.data.length);
                    ratio = totalWidth ? (x - offsetX) / totalWidth : 0;
                } else {
                    ratio = x / canvas.width;
                }
                ratio = Math.min(1, Math.max(0, ratio));
                if (audio.duration) {
                    audio.currentTime = ratio * audio.duration;
                    this.draw(ratio);
                }
            };

            const startSeek = (evt) => {
                if (audio.paused) return;
                seeking = true;
                activePointerId = evt.pointerId ?? null;
                updateCurrentTime(evt);
                if (evt.cancelable) evt.preventDefault();
            };
            const moveSeek = (evt) => {
                if (!seeking) return;
                if (activePointerId !== null && evt.pointerId !== undefined && evt.pointerId !== activePointerId) return;
                updateCurrentTime(evt);
                if (evt.cancelable) evt.preventDefault();
            };
            const endSeek = (evt) => {
                if (activePointerId !== null && evt.pointerId !== undefined && evt.pointerId !== activePointerId) return;
                seeking = false;
                activePointerId = null;
            };

            if ('PointerEvent' in window) {
                canvas.addEventListener('pointerdown', (e) => {
                    canvas.setPointerCapture?.(e.pointerId);
                    startSeek(e);
                });
                canvas.addEventListener('pointermove', moveSeek);
                canvas.addEventListener('pointerup', (e) => {
                    endSeek(e);
                    canvas.releasePointerCapture?.(e.pointerId);
                });
                canvas.addEventListener('pointercancel', endSeek);
            } else {
                canvas.addEventListener('mousedown', startSeek);
                window.addEventListener('mousemove', moveSeek);
                window.addEventListener('mouseup', endSeek);
                canvas.addEventListener('touchstart', startSeek, { passive: false });
                canvas.addEventListener('touchmove', moveSeek, { passive: false });
                canvas.addEventListener('touchend', endSeek);
                canvas.addEventListener('touchcancel', endSeek);
            }
        }

        _bindResize(container) {
            const redraw = () => {
                const progress = this.audio.duration ? this.audio.currentTime / this.audio.duration : 0;
                this.draw(progress);
            };
            if ('ResizeObserver' in window) {
                new ResizeObserver(redraw).observe(container);
            }
            window.addEventListener('resize', redraw);
        }
    }

    function setBtnState(item, isPlaying) {
        const img = item.querySelector('.play-btn img');
        if (!img) return;
        img.src = isPlaying ? PAUSE_SRC : PLAY_SRC;
        img.closest('.play-btn')?.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }

    let currentAudio = null;
    let currentItem = null;

    document.querySelectorAll('.tracks .track').forEach((item) => {
        const btn = item.querySelector('.play-btn');
        const audio = item.querySelector('audio');
        if (!btn || !audio) return;

        const waveform = new TrackWaveform(audio.parentElement, audio);
        setBtnState(item, false);

        function togglePlay() {
            if (currentAudio && currentAudio !== audio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentItem?.classList.remove('is-playing');
                if (currentItem) setBtnState(currentItem, false);
            }

            if (audio.paused) {
                waveform.ensureLoaded();
                audio.play();
                item.classList.add('is-playing');
                setBtnState(item, true);
                currentAudio = audio;
                currentItem = item;
            } else {
                audio.pause();
                item.classList.remove('is-playing');
                setBtnState(item, false);
                if (currentAudio === audio) {
                    currentAudio = null;
                    currentItem = null;
                }
            }
        }

        btn.addEventListener('click', togglePlay);
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                togglePlay();
            }
        });

        audio.addEventListener('ended', () => {
            item.classList.remove('is-playing');
            setBtnState(item, false);
            if (currentAudio === audio) {
                currentAudio = null;
                currentItem = null;
            }
        });
    });
});

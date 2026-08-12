// nathantbenke.github.io: the one script.
// Theme toggle + YouTube facades now; contact form wiring lands in Stage 5.

(function () {
    'use strict';

    // ---------- Theme toggle ----------
    var root = document.documentElement;
    var toggle = document.getElementById('theme-toggle');

    function effectiveTheme() {
        var explicit = root.getAttribute('data-theme');
        if (explicit) return explicit;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    function applyTheme(theme) {
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem('theme', theme); } catch (e) {}
        if (toggle) toggle.setAttribute('aria-pressed', String(theme === 'light'));
    }

    if (toggle) {
        toggle.setAttribute('aria-pressed', String(effectiveTheme() === 'light'));
        toggle.addEventListener('click', function () {
            applyTheme(effectiveTheme() === 'light' ? 'dark' : 'light');
        });
    }

    // ---------- YouTube facades ----------
    // Poster + play button only until clicked; then swap in a nocookie iframe.
    document.addEventListener('click', function (event) {
        var btn = event.target.closest('.facade-btn');
        if (!btn) return;
        var facade = btn.closest('.media-facade');
        var id = facade && facade.getAttribute('data-yt-id');
        if (!id) return;

        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1';
        iframe.title = btn.getAttribute('aria-label') || 'Video';
        iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        iframe.width = 560;
        iframe.height = 315;
        facade.replaceChildren(iframe);
        iframe.focus();
    });

    // ---------- Timeline progressive reveal ----------
    // Scroll-triggered, once per entry, no replay. Static fallback when any
    // of these is missing: IntersectionObserver, hover-capable pointer
    // (touch devices stay static), or motion preference allows it.
    var timeline = document.querySelector('.timeline');
    if (
        timeline &&
        'IntersectionObserver' in window &&
        window.matchMedia('(hover: hover)').matches &&
        window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    ) {
        var items = Array.prototype.slice.call(timeline.querySelectorAll('li'));
        var maxRevealed = 0;

        timeline.classList.add('js-timeline-animate');
        timeline.style.setProperty('--tl-progress', '0');

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
                var position = items.indexOf(entry.target) + 1;
                if (position > maxRevealed) {
                    maxRevealed = position;
                    timeline.style.setProperty('--tl-progress', String(maxRevealed / items.length));
                }
            });
        }, {
            // Was threshold 0.35 with a NEGATIVE bottom margin, which required
            // an entry to be a third visible and 10% up from the bottom before
            // it would even start - the latest possible trigger. Same fix as
            // the section observer: fire early, off-screen, so the animation is
            // over before the entry is looked at.
            threshold: 0,
            rootMargin: '400px 0px 400px 0px'
        });

        items.forEach(function (li) { observer.observe(li); });
    }

    // ---------- Contact form (EmailJS) ----------
    var EMAILJS = {
        publicKey: 'hV4YRMybI7buStbXK',
        serviceId: 'service_id3xvvf',
        templateId: 'template_p1unncs'
    };
    var FALLBACK_EMAIL = 'nthomasbenke@gmail.com'; // rendered only in the JS error path

    var form = document.getElementById('contact-form');
    var emailJsPromise = null;

    // Lazy-load the SDK on first interaction so non-contacters never pay for it.
    function loadEmailJs() {
        if (emailJsPromise) return emailJsPromise;
        emailJsPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
            s.onload = function () {
                window.emailjs.init({ publicKey: EMAILJS.publicKey });
                resolve(window.emailjs);
            };
            s.onerror = function () { emailJsPromise = null; reject(new Error('SDK load failed')); };
            document.head.appendChild(s);
        });
        return emailJsPromise;
    }

    if (form) {
        form.addEventListener('focusin', function () { loadEmailJs().catch(function () {}); }, { once: true });

        var statusEl = form.querySelector('.form-status');
        var submitBtn = form.querySelector('button[type="submit"]');

        function fieldError(input, message) {
            var out = input.closest('.form-field').querySelector('.field-error');
            if (out) out.textContent = message;
            input.setAttribute('aria-invalid', message ? 'true' : 'false');
        }

        function validationMessage(input) {
            var v = input.validity;
            if (v.valueMissing) return 'This field is required.';
            if (v.typeMismatch) return 'Please enter a valid email address.';
            if (v.tooShort) return 'Please add a little more detail (' + input.minLength + '+ characters).';
            return 'Please check this field.';
        }

        function setStatus(html) { if (statusEl) statusEl.innerHTML = html; }

        form.addEventListener('submit', function (event) {
            event.preventDefault();

            // Honeypot: bots fill "company"; humans never see it.
            if (form.elements.company && form.elements.company.value) {
                form.reset();
                setStatus('Message sent. I’ll get back to you soon.');
                return;
            }

            var fields = ['name', 'email', 'subject', 'message'].map(function (n) { return form.elements[n]; });
            var firstInvalid = null;
            fields.forEach(function (input) {
                if (input.checkValidity()) {
                    fieldError(input, '');
                } else {
                    fieldError(input, validationMessage(input));
                    if (!firstInvalid) firstInvalid = input;
                }
            });
            if (firstInvalid) { firstInvalid.focus(); return; }

            submitBtn.disabled = true;
            setStatus('Sending…');

            loadEmailJs()
                .then(function (emailjs) {
                    return emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, {
                        from_name: form.elements.name.value,
                        email_id: form.elements.email.value,
                        subject: form.elements.subject.value,
                        message: form.elements.message.value
                    });
                })
                .then(function () {
                    form.reset();
                    setStatus('Message sent. I’ll get back to you soon.');
                })
                .catch(function () {
                    setStatus('Something went wrong sending your message. Please email me directly at ' +
                        '<a href="mailto:' + FALLBACK_EMAIL + '">' + FALLBACK_EMAIL + '</a>.');
                })
                .then(function () { submitBtn.disabled = false; });
        });
    }

    // ---------- Background scroll parallax ----------
    // Perf-critical: transforms are written DIRECTLY to the fixed background
    // layers (compositor-only). Never a custom property on :root, because that
    // invalidates style for the whole document every frame (the round-3 jank).
    //
    // v1.1.3: the nebula is ONE moving layer over a static base, not four
    // stacked planes. Four full-bleed promoted planes each cost a large
    // semi-transparent BLEND every frame, and blend cost scales with viewport
    // area - fine at 1280x900, punishing at 4K. Raster counts never saw it
    // because the layers genuinely did not re-rasterise; a real 4K did.
    //
    // Depth survives the cut: a static plane at infinity plus one drifting
    // plane is still parallax, and the three star layers above add three more
    // rates. .neb-base and .neb-grain are deliberately absent from this list -
    // they never move, so they stay unpromoted and fold into the background
    // layer instead of adding surfaces.
    //
    // [selector, rate, base opacity]. The base opacity MUST match the
    // `opacity: calc(<base> * var(--neb-i))` in style.css: the CSS value is
    // what renders before this script runs (and if it never does), and this
    // takes over once the scroll falloff multiplies into it.
    var NEB_DRIFT = ['.neb-drift', -0.023, 0.36];

    // Star tile heights, used as the parallax MODULUS. The tiles repeat, so a
    // layer offset by exactly one tile is pixel-identical to one offset by
    // zero - which means the translate can wrap forever and the layer never
    // needs to be taller than the viewport. That is what replaces the dead
    // `.bg-stars { inset: -140px 0 0 0 }` rule (see style.css): the old fix
    // would have needed ~1000px of extra height on .bg-stars-3, and layer area
    // is exactly what we are trying not to spend. Keep in sync with the
    // background-size values in style.css.
    var STAR_TILE = { '.bg-stars-1': 700, '.bg-stars-2': 460, '.bg-stars-3': 900 };

    var nebSpeed = 1;        // live multiplier, driven by the ?neb panel
    var nebTop = 1;          // drift density at the hero
    var nebFloor = 0.42;     // drift density once past the falloff
    var nebFalloff = 1400;   // px of scroll the top->floor transition spans

    // Must match the max-width: 56rem block in style.css that drops the drift
    // layer's will-change. Writing a per-frame transform to an UN-PROMOTED
    // layer makes it repaint every frame - strictly worse than no parallax -
    // so the CSS and this query have to agree. If you move one, move the other.
    var nebStatic = window.matchMedia('(max-width: 56rem)').matches;

    var nebDrift = document.querySelector(NEB_DRIFT[0]);
    var nebDriftBase = NEB_DRIFT[2];

    // --neb-i is read here, not per frame: a getComputedStyle call inside the
    // scroll handler would force style resolution every frame, which is the
    // class of mistake this whole layer exists to avoid.
    var nebI = 1;
    function readIntensity() {
        var v = parseFloat(getComputedStyle(root).getPropertyValue('--neb-i'));
        nebI = isNaN(v) ? 1 : v;
    }
    readIntensity();

    // Only the drifting layer's density is scroll-coupled. The base is static
    // and UNPROMOTED on purpose, so writing its opacity per scroll would
    // repaint a full-bleed gradient+noise surface - the single most expensive
    // thing available here. It holds one constant density instead.
    function applyNebulaDensity(f) {
        if (!nebDrift) return;
        var o = nebDriftBase * nebI * f;
        nebDrift.style.opacity = (o > 1 ? 1 : o).toFixed(3);
    }

    // ---------- Large-viewport degrade ----------
    // Blend cost is per DESTINATION PIXEL per frame, so it scales with viewport
    // area and with how many semi-transparent surfaces are stacked. 1080p and
    // 1440p are comfortable; a 4K panel is 4x the pixels of 1080p and is not.
    //
    // Only two things actually reduce it: remove a blended surface, or shrink
    // the area one covers. Note what is NOT on this list - slowing the drift.
    // A layer costs the same to blend whether it moves 200px or 2px, so
    // "slow it down" would be a placebo; it is deliberately not offered.
    //
    //   drift-static  the drift layer stops moving, drops will-change, and
    //                 folds into the background layer with .neb-base and
    //                 .neb-grain. Removes a full-bleed blended surface
    //                 outright - the biggest single win. Costs the nebula's
    //                 parallax motion; density and composition are untouched.
    //   drift-cropped  keeps the motion, crops the layer with clip-path where
    //                 --neb-mask has already faded it to transparent, so the
    //                 blended area shrinks with no visible change. clip-path,
    //                 not a smaller box, because the art is positioned in
    //                 vw/vh from the element's own origin - moving that origin
    //                 would slide the whole composition sideways.
    //   stars-2       drops .bg-stars-3 (the bright/glow tile). One surface.
    //   stars-1       drops .bg-stars-2 and -3. Two surfaces.
    //
    // AUTO is off by default. Nothing is degraded until a combination has been
    // tested on real hardware; ?neb drives it in the meantime. To bake a choice
    // in, put the tokens in NEB_AUTO_DEGRADE and set NEB_AUTO_MP.
    // BAKED IN, from testing on a 4K panel. Dropping the bright star layer was
    // the single biggest improvement there; drift-static removes the nebula's
    // only blended surface. At 6 device-megapixels this catches 4K and
    // 1440p@DPR2 and leaves 1080p and 1440p@DPR1 at full richness - full drift
    // motion, all three star layers.
    //
    // drift-cropped is kept because it was part of the tested combination, but
    // note it earns nothing once drift-static is on: a static drift is no
    // longer a separate blended surface, so cropping it saves no blend. It is
    // harmless (0.14% of pixels, all where the mask is already transparent) and
    // it would start mattering again if drift-static were ever removed.
    var NEB_AUTO_DEGRADE = ['drift-static', 'drift-cropped', 'stars-1'];
    var NEB_AUTO_MP = 6;         // device megapixels at or above which it applies

    function deviceMegapixels() {
        var dpr = window.devicePixelRatio || 1;
        return (window.innerWidth * window.innerHeight * dpr * dpr) / 1e6;
    }

    var nebDegrade = {};
    if (NEB_AUTO_DEGRADE.length && deviceMegapixels() >= NEB_AUTO_MP) {
        NEB_AUTO_DEGRADE.forEach(function (t) { nebDegrade[t] = true; });
    }

    var STAR_SPEED = { '.bg-stars-1': -0.025, '.bg-stars-2': -0.055, '.bg-stars-3': -0.11 };

    function degradeTokens() {
        return Object.keys(nebDegrade).filter(function (k) { return nebDegrade[k]; });
    }

    function starDropped(sel) {
        if (nebDegrade['stars-1'] && (sel === '.bg-stars-2' || sel === '.bg-stars-3')) return true;
        if (nebDegrade['stars-2'] && sel === '.bg-stars-3') return true;
        return false;
    }

    // A hidden or un-promoted layer must leave this list. Writing a per-frame
    // transform to an element that is display:none is wasted work, and writing
    // one to an element that is NOT promoted makes it repaint every frame -
    // strictly worse than having no parallax on it at all.
    var parallaxLayers = [];
    function buildParallaxLayers() {
        parallaxLayers = [];
        var driftOn = nebDrift && !nebStatic && !nebDegrade['drift-static'] &&
            getComputedStyle(nebDrift).display !== 'none';
        if (driftOn) parallaxLayers.push({ el: nebDrift, speed: NEB_DRIFT[1], neb: true });

        ['.bg-stars-1', '.bg-stars-2', '.bg-stars-3'].forEach(function (sel) {
            var el = document.querySelector(sel);
            if (!el || starDropped(sel)) return;
            if (getComputedStyle(el).display === 'none') return;
            parallaxLayers.push({ el: el, speed: STAR_SPEED[sel], wrap: STAR_TILE[sel] });
        });
    }

    function applyDegrade() {
        root.setAttribute('data-degrade', degradeTokens().join(' '));
        // a layer leaving the list keeps whatever transform it last had, which
        // would freeze it somewhere arbitrary - reset before rebuilding
        [nebDrift, document.querySelector('.bg-stars-2'), document.querySelector('.bg-stars-3')]
            .forEach(function (el) { if (el) el.style.transform = ''; });
        buildParallaxLayers();
        applyParallax();
    }

    buildParallaxLayers();

    var parallaxTicking = false;
    var lastNebOpacity = -1;

    function applyParallax() {
        var y = window.scrollY;
        parallaxLayers.forEach(function (l) {
            // Rounded to whole pixels, not toFixed(1). A fractional translate
            // resamples the layer's texture, and on the tiled grain layer that
            // resampling is what makes its tile boundaries visible as faint
            // vertical lines. Whole pixels sample 1:1.
            // Rounded to whole pixels, not toFixed(1): a fractional translate
            // resamples the layer's texture, and on the tiled layers that
            // resampling is what makes tile boundaries show as faint lines.
            var v = Math.round(y * l.speed * (l.neb ? nebSpeed : 1));
            // Star layers wrap within one tile, so they never translate out
            // from under the viewport however long the page gets. % keeps the
            // sign in JS, which is what we want - these speeds are negative.
            if (l.wrap) v = v % l.wrap;
            l.el.style.transform = 'translate3d(0,' + v + 'px,0)';
        });

        // Density falloff: dense at the hero, thinner once you are past it.
        //
        // ONE opacity write, on the one promoted layer, and only when the
        // value has actually moved - so most scroll frames write nothing here.
        // Opacity on a composited layer re-composites, it does not
        // re-rasterise. It is emphatically NOT --neb-i on :root: a custom
        // property there would invalidate style for the whole document every
        // frame, which is the exact mechanism behind the original jank.
        if (nebDrift && !nebStatic) {
            var t = Math.min(1, y / nebFalloff);
            t = t * t * (3 - 2 * t);   // smoothstep, so the floor is not a step
            var o = nebTop + (nebFloor - nebTop) * t;
            if (o < lastNebOpacity - 0.004 || o > lastNebOpacity + 0.004) {
                lastNebOpacity = o;
                applyNebulaDensity(o);
            }
        }
        parallaxTicking = false;
    }

    if (degradeTokens().length) applyDegrade();

    if (parallaxLayers.length && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        window.addEventListener('scroll', function () {
            if (parallaxTicking) return;
            parallaxTicking = true;
            requestAnimationFrame(applyParallax);
        }, { passive: true });
        applyParallax();   // also covers a reload part-way down the page
    }

    if (nebDrift && (nebStatic || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches)) {
        // Reduced motion, or a small viewport: nothing scroll-coupled. The
        // nebula still renders - it is depth, not motion - at one fixed density
        // partway between the hero value and the floor.
        applyNebulaDensity(nebFloor + (1 - nebFloor) * 0.5);
    }

    // Tuning hooks for the ?neb panel. Defined unconditionally so the panel can
    // drive a page that has parallax disabled; no-ops harmlessly if it is.
    window.__nebula = {
        state: function () {
            return { speed: nebSpeed, top: nebTop, floor: nebFloor, falloff: nebFalloff };
        },
        set: function (k, v) {
            if (k === 'speed') nebSpeed = v;
            else if (k === 'top') nebTop = v;
            else if (k === 'floor') nebFloor = v;
            else if (k === 'falloff') nebFalloff = v;
            lastNebOpacity = -1;   // force the next write through the threshold
            applyParallax();
        },
        // the panel edits --neb-i on :root; density is computed from a cached
        // copy, so it has to be told when that changed
        refresh: function () {
            readIntensity();
            lastNebOpacity = -1;
            applyParallax();
        },

        // ---- layer + degrade controls, driven by the ?neb panel ----
        // Both go through buildParallaxLayers() so a layer that is hidden or
        // de-promoted also stops receiving per-frame transforms.
        layers: ['.neb-base', '.neb-grain', '.neb-drift',
                 '.bg-stars-1', '.bg-stars-2', '.bg-stars-3'],

        setLayer: function (sel, visible) {
            var el = document.querySelector(sel);
            if (!el) return;
            el.style.display = visible ? '' : 'none';
            applyDegrade();
        },

        layerVisible: function (sel) {
            var el = document.querySelector(sel);
            return !!el && getComputedStyle(el).display !== 'none';
        },

        degrade: function () { return degradeTokens(); },

        setDegrade: function (token, on) {
            nebDegrade[token] = !!on;
            // stars-1 supersedes stars-2; holding both would be ambiguous
            if (token === 'stars-1' && on) nebDegrade['stars-2'] = false;
            if (token === 'stars-2' && on) nebDegrade['stars-1'] = false;
            applyDegrade();
        },

        // What the compositor is actually being asked to blend each frame.
        // Area x surface count is the quantity that matters, so the panel
        // reports it directly rather than making you infer it from a count.
        cost: function () {
            var dpr = window.devicePixelRatio || 1;
            var out = { dpr: dpr, mp: deviceMegapixels(), surfaces: [], blendedMp: 0 };
            ['.neb-drift', '.bg-stars-1', '.bg-stars-2', '.bg-stars-3'].forEach(function (sel) {
                var el = document.querySelector(sel);
                if (!el) return;
                var cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.willChange === 'auto') return;
                if (sel === '.neb-drift' && nebDegrade['drift-static']) return;
                if (starDropped(sel)) return;
                var r = el.getBoundingClientRect();
                // only the part on screen is blended
                var w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
                var h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
                // getBoundingClientRect does NOT account for clip-path, so the
                // crop has to be applied by hand or drift-cropped would report
                // no saving at all. Keep these fractions in step with the
                // `clip-path: inset(6vh 0 0 14vw)` rule in style.css.
                if (sel === '.neb-drift' && nebDegrade['drift-cropped']) {
                    w *= 0.86;
                    h *= 0.94;
                }
                out.surfaces.push(sel.slice(1));
                out.blendedMp += (w * dpr * h * dpr) / 1e6;
            });
            return out;
        }
    };

    // ---------- "I build …" ticker ----------
    // Type-in, hold, fade, next. Pauses on hover. Reduced-motion: static.
    //
    // ALSO pauses when the hero is off screen. It retypes a character every
    // 34ms, and every textContent write is a layout + paint of that line - work
    // that used to continue forever, including while scrolling four sections
    // below it where nobody can see the result. Traced over a 9000px light-mode
    // scroll with analytics blocked, stopping it removed all 138 Layout events
    // (21.2ms) and cut Paint from 216 events to 144. Small, but it is pure
    // waste and it is theme-independent, which is exactly the category of cost
    // being hunted here.
    var tickerEl = document.getElementById('ticker');
    var tickerLine = document.getElementById('ticker-line');
    if (tickerEl && tickerLine && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        var TICKER_ITEMS = [
            'VR training simulators',
            'real-time depth pipelines',
            'developer tools',
            'immersive experiences'
        ];
        var tickerIndex = 0;
        var tickerPaused = false;
        var tickerVisible = true;
        tickerLine.addEventListener('mouseenter', function () { tickerPaused = true; });
        tickerLine.addEventListener('mouseleave', function () { tickerPaused = false; });

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                tickerVisible = entries[0].isIntersecting;
            }, { rootMargin: '200px 0px 200px 0px' }).observe(tickerLine);
        }

        function typeIn(text, done) {
            var i = 0;
            // Off screen: write the finished string once and stop, rather than
            // spending a layout per character on an animation nobody is
            // watching. One write, not text.length of them.
            if (!tickerVisible) {
                tickerEl.textContent = text;
                done();
                return;
            }
            tickerEl.textContent = '';
            (function step() {
                if (!tickerVisible) { tickerEl.textContent = text; done(); return; }
                if (i <= text.length) {
                    tickerEl.textContent = text.slice(0, i);
                    i++;
                    setTimeout(step, 34);
                } else {
                    done();
                }
            })();
        }

        function nextTick() {
            // A 500ms poll while hidden touches no DOM and costs nothing
            // measurable; it just means the ticker resumes promptly on return.
            if (tickerPaused || !tickerVisible) { setTimeout(nextTick, 500); return; }
            tickerEl.classList.add('is-fading');
            setTimeout(function () {
                tickerIndex = (tickerIndex + 1) % TICKER_ITEMS.length;
                tickerEl.classList.remove('is-fading');
                typeIn(TICKER_ITEMS[tickerIndex], function () {
                    setTimeout(nextTick, 3000);
                });
            }, 300);
        }
        setTimeout(nextTick, 3000);
    }

    // ---------- Project slideshows ----------
    // Transform-based track; arrows/dots/swipe are JS-enhanced (hidden
    // without JS: first slide remains visible). Reduced-motion: the CSS
    // transition is gated off, navigation still works as instant jumps.
    // Leaving a facade slide mid-playback restores its poster (stops audio).
    document.querySelectorAll('[data-slideshow]').forEach(function (rootEl) {
        var track = rootEl.querySelector('.slides');
        if (!track) return;
        var slides = Array.prototype.slice.call(track.children);
        if (slides.length < 2) return;
        var index = 0;
        var playBtn = rootEl.querySelector('.ss-play');
        var facadeIndex = -1;
        slides.forEach(function (s, i) {
            if (facadeIndex < 0 && s.classList.contains('media-facade')) facadeIndex = i;
        });

        slides.forEach(function (s) {
            if (s.classList.contains('media-facade')) s.__facadeHtml = s.innerHTML;
        });

        var dotsWrap = rootEl.querySelector('.ss-dots');
        var dots = slides.map(function (_, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + slides.length);
            b.addEventListener('click', function () { go(i); });
            dotsWrap.appendChild(b);
            return b;
        });

        function go(i) {
            var prev = slides[index];
            if (prev && prev.__facadeHtml && prev.querySelector('iframe')) {
                prev.innerHTML = prev.__facadeHtml;
            }
            index = (i + slides.length) % slides.length;
            track.style.transform = 'translate3d(' + (-index * 100) + '%,0,0)';
            dots.forEach(function (d, j) {
                d.setAttribute('aria-current', j === index ? 'true' : 'false');
            });
            // the pill is redundant (and would cover the player) on the video slide
            if (playBtn) playBtn.hidden = index === facadeIndex;
        }

        rootEl.querySelector('.ss-prev').addEventListener('click', function () { go(index - 1); });
        rootEl.querySelector('.ss-next').addEventListener('click', function () { go(index + 1); });

        var startX = null;
        rootEl.addEventListener('pointerdown', function (e) {
            if (e.target.closest('button, a, iframe')) return;
            startX = e.clientX;
        });
        rootEl.addEventListener('pointerup', function (e) {
            if (startX === null) return;
            var dx = e.clientX - startX;
            startX = null;
            if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        });

        // deferred slide sources: fetched on first interaction with this
        // slideshow: never racing first paint, invisible behind the 280ms
        // slide transition on real connections
        var hydrated = false;
        function hydrate() {
            if (hydrated) return;
            hydrated = true;
            rootEl.querySelectorAll('img[data-src]').forEach(function (img) {
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
            });
        }
        ['pointerenter', 'pointerdown', 'focusin', 'touchstart'].forEach(function (evt) {
            rootEl.addEventListener(evt, hydrate, { once: true, passive: true });
        });

        // Direct video access: jump to the facade slide and start it, so the
        // video is one click away instead of N arrow presses. Stills still lead.
        if (playBtn && facadeIndex > -1) {
            playBtn.addEventListener('click', function () {
                hydrate();
                go(facadeIndex);
                var fb = slides[facadeIndex].querySelector('.facade-btn');
                if (fb) fb.click();
            });
        } else if (playBtn) {
            playBtn.hidden = true;
        }

        rootEl.classList.add('ss-ready');
        go(0);
    });

    // ---------- Standalone play pills (facade with no slideshow) ----------
    // ARCS is video-only, so its pill has no track to drive: it just fires the
    // facade. Pills ship `hidden`: without JS there is nothing for them to do.
    document.querySelectorAll('.media-facade > .ss-play').forEach(function (pill) {
        var fb = pill.parentNode.querySelector('.facade-btn');
        if (!fb) return;
        pill.hidden = false;
        pill.addEventListener('click', function () { fb.click(); });
    });

    // ---------- Section-entry background response ----------
    // Sections gain .in-view once; CSS fades in their background layers
    // (perspective floor at #work/#contact). Content itself stays stable.
    if (
        'IntersectionObserver' in window &&
        window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    ) {
        document.documentElement.classList.add('js-sections');
        var sectionObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('in-view');
                sectionObserver.unobserve(entry.target);
            });
        }, {
            // rootMargin, not threshold, is what stops the "block of nothing,
            // then it appears" pop. threshold: 0.08 with no margin meant a
            // section only started revealing once it was ALREADY on screen, so
            // on a fast scroll you arrived before the transition did. An 800px
            // top/bottom margin fires the reveal roughly a screen early, so the
            // content has finished animating by the time you actually reach it.
            // threshold drops to 0 for the same reason: any intersection at all
            // is enough, we do not want to wait for 8% of a tall section.
            threshold: 0,
            rootMargin: '800px 0px 800px 0px'
        });
        document.querySelectorAll('main > section:not(.hero)').forEach(function (s) {
            sectionObserver.observe(s);
        });
    }

    // ---------- Lazy images: left to the browser, on evidence ----------
    // Lazy loading is a real second source of the "block of nothing, then it
    // appears" feeling - measured at 2560x1440, 3 of the 6 images in the
    // viewport still had no pixels after a fast jump to mid-page. Two fixes
    // were built and measured, and NEITHER is here, because neither helped:
    //
    //   1. Flip every `loading="lazy"` image to `eager` on a wide rootMargin.
    //      Actively WORSE: on a fast scroll over a throttled link it started
    //      dozens of fetches at once, they fought for bandwidth and none
    //      finished - 7 of 7 visible images blank against 5 of 7 untouched.
    //   2. A narrow lead: same idea but a 900px margin and at most 3 promoted
    //      at a time, so it cannot stampede. At a realistic flick speed
    //      (5 gestures, 2500px/s, 5Mbps) it was IDENTICAL to doing nothing -
    //      2 of 7 blank either way, 4 reps, zero variance.
    //
    // Chrome's own lazy heuristic already handles a realistic scroll here, and
    // the only regime where it struggles (a ~9000px/s flick) outruns any
    // prefetch anyway - both variants measured 7 of 7 blank there. So this is
    // deliberately unhandled code, not an oversight. If it is revisited, the
    // thing to change is image WEIGHT or dimensions, not fetch scheduling.

    // ---------- Sticky-header offset ----------
    // Publishes the header's real height so scroll-margin-top can clear it. The
    // header wraps to two or three rows on a phone, so a fixed offset cannot
    // work. This writes a custom property to :root, which is the pattern that
    // caused the round-3 scroll jank - but only on RESIZE, never per frame, so
    // the whole-document style invalidation happens a handful of times at most.
    var siteHeader = document.querySelector('.site-header');
    if (siteHeader && 'ResizeObserver' in window) {
        var publishHeaderHeight = function () {
            root.style.setProperty('--header-h', siteHeader.offsetHeight + 'px');
        };
        publishHeaderHeight();
        new ResizeObserver(publishHeaderHeight).observe(siteHeader);
    }

    // ---------- Footer year ----------
    var year = document.getElementById('footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    // ---------- v1.1 nebula lab (experiment branch only) ----------
    // The tuning panel is fetched ONLY when ?neb is in the URL, so a normal
    // visitor never pays a byte for it. The preset it writes is read back by
    // the pre-paint guard in <head>, so a pick survives navigation.
    if (/[?&]neb(&|=|$)/.test(location.search)) {
        var lab = document.createElement('script');
        lab.src = 'assets/js/nebula-lab.js';
        document.body.appendChild(lab);
    }
})();

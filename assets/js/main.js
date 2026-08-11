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
        }, { threshold: 0.35, rootMargin: '0px 0px -10% 0px' });

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
    // v1.1.1: the nebula is FOUR PLANES, not one sheet. v1.1.0 translated it
    // rigidly at -0.008 and it read as a burn mark on the glass - and sliding a
    // rigid sheet faster would only have produced a faster burn mark, because a
    // sheet has no interior. What reads as volume is DIFFERENTIAL travel: the
    // near dust sweeping past while the far colour mass barely moves. Every
    // nebula plane stays slower than the slowest star layer (-0.025), so the
    // nebula still sits behind the starfield instead of racing through it.
    var NEB_PLANES = [
        ['.neb-field', -0.011],   // deepest: the colour mass barely drifts
        ['.neb-grain', -0.013],
        ['.neb-veil',  -0.017],
        ['.neb-cols',  -0.023]    // nearest: the dust columns lead the motion
    ];

    var nebGroup = document.querySelector('.bg-nebula');
    var nebSpeed = 1;        // live multiplier, driven by the ?neb panel
    var nebTop = 1;          // group opacity at the hero
    var nebFloor = 0.42;     // group opacity once past the falloff
    var nebFalloff = 1400;   // px of scroll the top->floor transition spans

    // Must match the max-width: 56rem block in style.css that drops the planes'
    // will-change. Writing a per-frame transform to an UN-PROMOTED layer makes
    // it repaint every frame - strictly worse than no parallax - so the CSS and
    // this query have to agree. If you move one, move the other.
    var nebStatic = window.matchMedia('(max-width: 56rem)').matches;

    var parallaxLayers = (nebStatic ? [] : NEB_PLANES.map(function (p) {
        return { el: document.querySelector(p[0]), speed: p[1], neb: true };
    })).concat([
        { el: document.querySelector('.bg-stars-1'), speed: -0.025 },
        { el: document.querySelector('.bg-stars-2'), speed: -0.055 },
        { el: document.querySelector('.bg-stars-3'), speed: -0.11 }
    ]).filter(function (l) { return l.el; });

    var parallaxTicking = false;
    var lastNebOpacity = -1;

    function applyParallax() {
        var y = window.scrollY;
        parallaxLayers.forEach(function (l) {
            var v = y * l.speed * (l.neb ? nebSpeed : 1);
            l.el.style.transform = 'translate3d(0,' + v.toFixed(1) + 'px,0)';
        });

        // Density falloff: dense at the hero, thinner once you are past it.
        //
        // This is ONE opacity write on an already-promoted group, and only when
        // the value has actually moved - so the vast majority of scroll frames
        // write nothing here at all. Opacity on a composited layer is a
        // compositor property: it re-composites, it does not re-rasterise
        // (verified against a paint trace, not assumed). It is emphatically NOT
        // --neb-i on :root - a custom property there would invalidate style for
        // the entire document on every frame, which is the exact mechanism
        // behind the original jank.
        if (nebGroup && !nebStatic) {
            var t = Math.min(1, y / nebFalloff);
            t = t * t * (3 - 2 * t);   // smoothstep, so the floor is not a step
            var o = nebTop + (nebFloor - nebTop) * t;
            if (o < lastNebOpacity - 0.004 || o > lastNebOpacity + 0.004) {
                lastNebOpacity = o;
                nebGroup.style.opacity = o.toFixed(3);
            }
        }
        parallaxTicking = false;
    }

    if (parallaxLayers.length && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        window.addEventListener('scroll', function () {
            if (parallaxTicking) return;
            parallaxTicking = true;
            requestAnimationFrame(applyParallax);
        }, { passive: true });
        applyParallax();   // also covers a reload part-way down the page
    }

    if (nebGroup && (nebStatic || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches)) {
        // Reduced motion, or a small viewport: nothing scroll-coupled. The
        // nebula still renders - it is depth, not motion - at one fixed density
        // partway between the hero value and the floor.
        nebGroup.style.opacity = String(nebFloor + (1 - nebFloor) * 0.5);
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
        }
    };

    // ---------- "I build …" ticker ----------
    // Type-in, hold, fade, next. Pauses on hover. Reduced-motion: static.
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
        tickerLine.addEventListener('mouseenter', function () { tickerPaused = true; });
        tickerLine.addEventListener('mouseleave', function () { tickerPaused = false; });

        function typeIn(text, done) {
            var i = 0;
            tickerEl.textContent = '';
            (function step() {
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
            if (tickerPaused) { setTimeout(nextTick, 500); return; }
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
        }, { threshold: 0.08 });
        document.querySelectorAll('main > section:not(.hero)').forEach(function (s) {
            sectionObserver.observe(s);
        });
    }

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

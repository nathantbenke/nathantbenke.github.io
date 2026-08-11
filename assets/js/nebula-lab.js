// v1.1 nebula lab: live intensity picker. EXPERIMENT-ONLY.
//
// Loaded on demand by main.js when ?neb is in the URL, so this file is never
// fetched by a normal visitor. Delete this file + the loader block in main.js
// to remove the lab entirely; the nebula itself does not depend on it.
//
// Everything is inline-styled on purpose - the lab must not add a single rule
// to style.css, so there is nothing to unpick later.
//
// Perf note: dragging the slider writes --neb-i to :root, which invalidates
// style for the whole document on every input event. That is exactly the thing
// the scroll parallax is careful NOT to do. It is fine here because it happens
// while you are dragging, not while you are scrolling, and because this code
// does not ship. Profile with the PRESET buttons (no inline var), never mid-drag.
(function () {
    'use strict';

    var root = document.documentElement;
    var PRESETS = [
        ['off', 'Off', 'baseline - nebula removed entirely'],
        ['subtle', 'Barely there', '0.5x - you notice it only if you look'],
        ['medium', 'Medium', '1x - reads as depth, still staging'],
        ['present', 'More present', '1.7x - the cloud is a visible feature']
    ];

    function current() {
        return root.getAttribute('data-nebula') || 'medium';
    }

    var panel = document.createElement('div');
    panel.setAttribute('data-nebula-lab', '');
    panel.style.cssText = [
        'position:fixed', 'right:16px', 'bottom:16px', 'z-index:9999',
        'width:268px', 'padding:14px 16px 12px',
        'font:13px/1.45 system-ui,sans-serif', 'color:#eae7f2',
        'background:rgba(10,8,20,.94)', 'border:1px solid #362a55',
        'border-radius:12px', 'box-shadow:0 12px 40px rgba(0,0,0,.6)'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
    title.innerHTML = '<strong style="letter-spacing:.04em;text-transform:uppercase;font-size:11px;color:#c4bfd9">' +
        'Nebula v1.1</strong>';

    var hide = document.createElement('button');
    hide.type = 'button';
    hide.textContent = 'hide';
    hide.style.cssText = 'background:none;border:0;color:#c4bfd9;cursor:pointer;font:inherit;font-size:11px;padding:2px 4px';
    title.appendChild(hide);
    panel.appendChild(title);

    var buttons = [];

    function paintActive() {
        var c = current();
        var freeform = root.style.getPropertyValue('--neb-i') !== '';
        buttons.forEach(function (b) {
            var on = !freeform && b.dataset.preset === c;
            b.style.borderColor = on ? '#a78bfa' : '#362a55';
            b.style.background = on ? 'rgba(167,139,250,.16)' : 'transparent';
            b.style.color = on ? '#eae7f2' : '#c4bfd9';
        });
    }

    PRESETS.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.preset = p[0];
        b.title = p[2];
        b.textContent = p[1];
        b.style.cssText = [
            'display:block', 'width:100%', 'margin-bottom:6px', 'padding:7px 10px',
            'text-align:left', 'font:inherit', 'cursor:pointer',
            'border:1px solid #362a55', 'border-radius:8px', 'background:transparent', 'color:#c4bfd9'
        ].join(';');
        b.addEventListener('click', function () {
            // clearing the inline var is what hands control back to the preset
            root.style.removeProperty('--neb-i');
            root.setAttribute('data-nebula', p[0]);
            try { localStorage.setItem('nebula', p[0]); } catch (e) {}
            syncReadout();
            paintActive();
        });
        buttons.push(b);
        panel.appendChild(b);
    });

    var readout = document.createElement('label');
    readout.style.cssText = 'display:block;margin:10px 0 4px;font-size:11px;color:#c4bfd9';
    panel.appendChild(readout);

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '2.5';
    slider.step = '0.05';
    slider.style.cssText = 'width:100%;accent-color:#a78bfa';
    panel.appendChild(slider);

    function effective() {
        var inline = root.style.getPropertyValue('--neb-i');
        if (inline) return parseFloat(inline);
        return parseFloat(getComputedStyle(root).getPropertyValue('--neb-i')) || 0;
    }

    function syncReadout() {
        var v = effective();
        slider.value = String(v);
        readout.textContent = 'fine tune  --neb-i: ' + v.toFixed(2) +
            (root.style.getPropertyValue('--neb-i') ? '  (custom)' : '  (preset)');
    }

    slider.addEventListener('input', function () {
        root.setAttribute('data-nebula', 'medium');
        root.style.setProperty('--neb-i', slider.value);
        syncReadout();
        paintActive();
    });

    var layersWrap = document.createElement('div');
    layersWrap.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #362a55;font-size:11px;color:#c4bfd9';
    layersWrap.appendChild(document.createTextNode('solo a sub-layer:'));
    var soloRow = document.createElement('div');
    soloRow.style.cssText = 'display:flex;gap:5px;margin-top:6px';
    [['field', 'field'], ['veil', 'veil'], ['cols', 'dust'], ['grain', 'grain'], ['', 'all']].forEach(function (s) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = s[1];
        b.style.cssText = 'flex:1;padding:4px 0;font:inherit;font-size:10px;cursor:pointer;' +
            'border:1px solid #362a55;border-radius:6px;background:transparent;color:#c4bfd9';
        b.addEventListener('click', function () {
            ['field', 'veil', 'cols', 'grain'].forEach(function (name) {
                var el = document.querySelector('.neb-' + name);
                if (el) el.style.display = (!s[0] || s[0] === name) ? '' : 'none';
            });
        });
        soloRow.appendChild(b);
    });
    layersWrap.appendChild(soloRow);
    panel.appendChild(layersWrap);

    var hint = document.createElement('div');
    hint.style.cssText = 'margin-top:9px;font-size:10px;color:#8d87a8;line-height:1.4';
    hint.textContent = 'Pick persists across pages. Drop ?neb from the URL to hide this panel; the pick stays.';
    panel.appendChild(hint);

    hide.addEventListener('click', function () { panel.remove(); });

    document.body.appendChild(panel);
    syncReadout();
    paintActive();
})();

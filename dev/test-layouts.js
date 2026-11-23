// Unit test for lib/layouts/*.js (pure math, runs without GNOME Shell).
// Usage: gjs -m dev/test-layouts.js
import System from 'system';

import {LAYOUTS} from '../lib/layouts/index.js';

let failures = 0, checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        failures++;
        print(`FAIL ${msg}`);
    }
};

const W = 1920, H = 1080;
const sizes = n => Array.from({length: n}, (_, i) => ({
    width: 300 + (i % 4) * 90,
    height: 220 + (i % 3) * 110,
}));

for (const [id, layout] of Object.entries(LAYOUTS)) {
    for (const flat of [false, true]) {
        for (const n of [1, 2, 3, 5, 15, 20, 30]) {
            for (let sel = 0; sel < n; sel++) {
                const tag = `${id}${flat ? ' flat' : ''} n=${n} sel=${sel}`;
                const out = layout.compute(sizes(n), sel, {W, H, tilt: 48, sideCount: 4, flat});
                check(out.length === n, `${tag}: one entry per card`);
                for (const [i, l] of out.entries()) {
                    for (const k of ['x', 'bottom', 'z', 'scale', 'rot', 'opacity', 'shade', 'depth'])
                        check(Number.isFinite(l[k]), `${tag} card ${i}: ${k}=${l[k]}`);
                    check(l.opacity >= 0 && l.opacity <= 255, `${tag} card ${i}: opacity range`);
                    check(l.shade >= 0 && l.shade <= 1, `${tag} card ${i}: shade range`);
                    check(l.z <= 0.001, `${tag} card ${i}: never in front of the screen plane`);
                }
                const s = out[sel];
                check(s.visible && s.opacity === 255 && s.scale === 1 && s.shade === 0,
                    `${tag}: selected card fully visible, full size, not darkened`);
                // In the stack every card (the front one too) is turned.
                if (id !== 'stack' || flat)
                    check(s.rot === 0 && s.z === 0, `${tag}: selected card faces front`);
                else
                    check(out.every((l, i) => i === sel || l.z < s.z), `${tag}: front card is the nearest`);
                check(out.every((l, i) => i === sel || l.depth > s.depth),
                    `${tag}: selected card is painted on top`);
                check(s.x > 0 && s.x < W, `${tag}: selected card is on screen`);
                const visible = out.filter(l => l.visible).length;
                check(visible <= 2 * 4 + 1 + 6 + 2, `${tag}: bounded number of painted cards (${visible})`);
                if (flat)
                    check(out.every(l => l.rot === 0), `${tag}: light mode is flat`);
            }
        }
    }
}

print(`${checks - failures}/${checks} layout checks passed`);
System.exit(failures ? 1 : 0);

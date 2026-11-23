// AeroTab — "Pilha 3D" layout: the windows are stacked in depth like cards.
// The selected one is in front (centre-right, large); every next one sits
// further back, smaller, darker and shifted towards the top-left corner.
// All of them are turned a little around the Y axis.
//
// The stack is cyclic: the window right behind the front one is the next
// one (Tab). Moving forward sends the front window to the very back.
//
// Pure math, no GNOME imports: also used by the preferences previews.

const FRONT_X = 0.60;       // centre of the front card, fraction of width
const FRONT_BOTTOM = 0.82;  // bottom of the front card, fraction of height
const STEP_X = 0.105;       // each card further back: this much to the left...
const STEP_Y = 0.062;       // ...this much higher...
const STEP_Z = 0.05;        // ...and this much deeper (fractions of width)
const SHRINK = 0.97;
const ROTATION = 26;        // degrees; > 0 turns the right edge away
const VISIBLE = 7;          // cards drawn behind the front one
const FADE_STEP = 0.06;     // opacity lost per card (mostly darker, not see-through)
const SHADE_STEP = 0.13;    // darkening added per card
const SHADE_MAX = 0.75;

export const StackLayout = {
    id: 'stack',
    reflection: false,
    showIcon: false,
    cardBox: {width: 0.38, height: 0.52},
    pivotY: 0.6,
    labelsY: 0.855,
    scrollbarY: 0.94,

    compute(cards, sel, {W, H, flat}) {
        const n = cards.length;
        const rot = flat ? 0 : ROTATION;
        const sin = Math.sin(rot * Math.PI / 180);

        return cards.map((card, i) => {
            const d = (i - sel + n) % n;          // 0 = front
            const visible = d <= VISIBLE;
            const scale = SHRINK ** d;
            return {
                x: W * (FRONT_X - d * STEP_X),
                bottom: H * (FRONT_BOTTOM - d * STEP_Y),
                // Same trick as the flip layout: push back by half the
                // turned width so the near edge stays on the screen plane.
                z: -(card.width * scale / 2) * sin - d * STEP_Z * W,
                scale,
                rot,
                opacity: visible ? Math.round(255 * Math.max(0.35, 1 - d * FADE_STEP)) : 0,
                shade: Math.min(SHADE_MAX, d * SHADE_STEP),
                visible,
                depth: d,
            };
        });
    },
};

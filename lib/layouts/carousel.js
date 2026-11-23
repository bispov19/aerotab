// AeroTab — "Carrossel 3D" layout, like Cover Flow: the selected window
// faces you in the middle, the neighbours are turned almost sideways,
// smaller and further back the further they are, on a gentle curve, and
// fade out at the screen edges.
//
// Pure math, no GNOME imports: also used by the preferences previews.

const CENTRE_Y = 0.47;      // vertical centre of the cards, fraction of height
const ROTATION = 62;        // degrees, side cards nearly edge-on
const FIRST_GAP = 0.03;     // gap between centre card and first neighbour
const STEP = 0.098;         // distance between neighbours (fraction of width)...
const STEP_SHRINK = 0.9;    // ...getting a bit closer the further out
const SIDE_SCALE = 0.96;
const SIDE_SHRINK = 0.93;
const CURVE = 0.006;        // depth added per k² (the curve of the row)
const SHADE_STEP = 0.07;
const FLAT_SIDE_SCALE = 0.6;
const FLAT_OVERLAP = 0.55;

export const CarouselLayout = {
    id: 'carousel',
    reflection: false,
    showIcon: true,
    cardBox: {width: 0.30, height: 0.52},
    pivotY: CENTRE_Y,
    labelsY: 0.775,
    scrollbarY: 0.88,

    compute(cards, sel, {W, H, sideCount, flat}) {
        const n = cards.length;
        const cx = W / 2;
        const centreY = H * CENTRE_Y;
        const rot = flat ? 0 : ROTATION;
        const cos = Math.cos(rot * Math.PI / 180);
        const sin = Math.sin(rot * Math.PI / 180);
        const layout = new Array(n);

        // Cards are centred vertically: bottom = centre + half the height.
        const at = (card, scale) => centreY + card.height * scale / 2;

        layout[sel] = {
            x: cx, bottom: at(cards[sel], 1), z: 0, scale: 1, rot: 0,
            opacity: 255, shade: 0, visible: true, depth: 0,
        };

        for (const side of [-1, 1]) {
            let offset = cards[sel].width / 2;
            let prevHalf = 0;
            let step = STEP * W;
            for (let k = 1; ; k++) {
                const i = sel + side * k;
                if (i < 0 || i >= n)
                    break;
                const scale = (flat ? FLAT_SIDE_SCALE : SIDE_SCALE) * SIDE_SHRINK ** (k - 1);
                const half = cards[i].width * scale * cos / 2;
                if (k === 1)
                    offset += W * FIRST_GAP + half;
                else if (flat)
                    offset += (prevHalf + half) * FLAT_OVERLAP;
                else
                    offset += (step *= STEP_SHRINK);
                prevHalf = half;

                // Fade out at the edge; one more card waits, invisible,
                // just past the last one so it can slide in smoothly.
                const fits = offset + half < cx;
                const visible = k <= sideCount && fits;
                const last = k === sideCount || !(offset + half + step < cx);
                layout[i] = {
                    x: cx + side * offset,
                    bottom: at(cards[i], scale),
                    // Outer edge turns away, so the inner edge would come
                    // forward: push back by half the turned width, plus the curve.
                    z: -(cards[i].width * scale / 2) * sin - k * k * CURVE * W,
                    scale,
                    rot: side * rot,   // > 0 turns the right edge away
                    opacity: visible ? (last ? 150 : 255) : 0,
                    shade: Math.min(0.5, k * SHADE_STEP),
                    visible,
                    depth: k,
                };
            }
        }
        return layout;
    },
};

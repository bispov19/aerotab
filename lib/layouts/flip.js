// AeroTab — "Flip" layout (styles Escuro and Área de trabalho): the selected
// window in the middle, the others along both sides tilted like the walls
// of a corridor, standing on a floor line with a reflection.
//
// Pure math, no GNOME imports: also used by the preferences previews.
// See lib/layouts/index.js for the layout contract.

const FLOOR_Y = 0.64;
const SIDE_MARGIN = 0.035;
const SIDE_SCALE = 0.86;        // first card next to the selected one
const SIDE_SHRINK = 0.95;       // each further card is this much smaller
const FIRST_GAP = 0.012;        // gap between selected and first side card
const SIDE_OVERLAP = 0.82;      // <1 means neighbouring side cards overlap
const STACK_STEP = 0.009;       // how much each stacked extra card peeks out
const STACK_VISIBLE = 3;        // stacked extras drawn behind the last card
const DEPTH_STEP = 0.012;       // extra push back per card, fraction of width
const FLAT_MAX_SIDE = 3;
const FLAT_SIDE_SCALE = 0.74;   // flat cards: smaller so the selected stands out

// rotation_angle_y > 0 turns the RIGHT edge away from the viewer. Left
// cards (side -1) get +tilt, right cards -tilt: inner edges recede.
const ROTATION_SIGN = -1;

export const FlipLayout = {
    id: 'flip',
    reflection: true,
    showIcon: false,
    cardBox: {width: 0.32, height: 0.42},
    pivotY: FLOOR_Y,
    labelsY: 0.845,
    scrollbarY: 0.93,

    compute(cards, sel, {W, H, tilt, sideCount, flat}) {
        if (flat) {
            tilt = 0;
            sideCount = Math.min(sideCount, FLAT_MAX_SIDE);
        }
        const sideScale = flat ? FLAT_SIDE_SCALE : SIDE_SCALE;
        const cx = W / 2;
        const floor = H * FLOOR_Y;
        const n = cards.length;
        const cos = Math.cos(tilt * Math.PI / 180);
        const sin = Math.sin(tilt * Math.PI / 180);
        const margin = W * SIDE_MARGIN;
        const layout = new Array(n);

        layout[sel] = {x: 0, z: 0, scale: 1, rot: 0, opacity: 255, shade: 0, visible: true, depth: 0};
        const selHalf = cards[sel].width / 2;

        for (const side of [-1, 1]) {
            // 1) Natural position of the side cards, touching/overlapping.
            const slots = [];
            let offset = 0;
            let prevHalf = 0;
            for (let k = 1; k <= sideCount; k++) {
                const i = sel + side * k;
                if (i < 0 || i >= n)
                    break;
                const scale = sideScale * SIDE_SHRINK ** (k - 1);
                const half = cards[i].width * scale * cos / 2;
                offset = k === 1
                    ? selHalf + W * FIRST_GAP + half
                    : offset + (prevHalf + half) * SIDE_OVERLAP;
                prevHalf = half;
                slots.push({i, k, scale, half, offset});
            }

            // 2) If they don't fit up to the screen edge, squeeze cards 2..m
            //    together (the first one stays next to the selected card).
            if (slots.length > 1) {
                const first = slots[0].offset;
                const last = slots[slots.length - 1];
                const room = cx - margin - STACK_VISIBLE * STACK_STEP * W - last.half - first;
                const used = last.offset - first;
                if (used > room) {
                    const f = Math.max(0.2, room / used);
                    for (const s of slots)
                        s.offset = first + (s.offset - first) * f;
                }
            }

            for (const s of slots) {
                // Turning around its centre would bring the outer edge
                // towards the viewer and blow it up with perspective, so
                // push the card back until the outer edge sits on the
                // screen plane (z = 0): only the inner edge recedes.
                s.z = -(cards[s.i].width * s.scale / 2) * sin - (s.k - 1) * DEPTH_STEP * W;
                layout[s.i] = {
                    x: side * s.offset,
                    z: s.z,
                    scale: s.scale,
                    rot: side * ROTATION_SIGN * tilt,
                    opacity: 255,
                    shade: 0,
                    visible: true,
                    depth: s.k,
                };
            }

            // 3) Everything past the side limit is stacked behind the last
            //    side card, fading out, and hidden after STACK_VISIBLE.
            const lastSlot = slots[slots.length - 1];
            for (let k = sideCount + 1; ; k++) {
                const i = sel + side * k;
                if (i < 0 || i >= n)
                    break;
                const extra = k - sideCount;
                const visible = extra <= STACK_VISIBLE;
                layout[i] = {
                    x: side * (lastSlot.offset + extra * STACK_STEP * W),
                    z: lastSlot.z - extra * DEPTH_STEP * W,
                    scale: lastSlot.scale * 0.97 ** extra,
                    rot: side * ROTATION_SIGN * tilt,
                    opacity: visible ? Math.round(150 * (1 - (extra - 1) / STACK_VISIBLE)) : 0,
                    shade: 0,
                    visible,
                    depth: k,
                };
            }
        }

        // 4) Few windows: centre the whole group instead of leaving one side
        //    empty, but never push it past the screen edges.
        let minX = Infinity, maxX = -Infinity;
        layout.forEach((l, i) => {
            if (!l.visible)
                return;
            const half = cards[i].width * l.scale * (l.rot ? cos : 1) / 2;
            minX = Math.min(minX, l.x - half);
            maxX = Math.max(maxX, l.x + half);
        });
        let shift = -(minX + maxX) / 2;
        shift = Math.max(shift, -cx + margin - minX);
        shift = Math.min(shift, cx - margin - maxX);
        if (maxX - minX > W - 2 * margin)
            shift = 0;

        for (const l of layout) {
            l.x += cx + shift;
            l.bottom = floor;
        }
        return layout;
    },
};

// AeroTab — layouts: where each window card goes in 3D.
//
// A layout is a plain object, pure math (no GNOME imports, so the
// preferences previews use the very same code):
//
//   id          'flip' | 'stack' | 'carousel'
//   reflection  whether a floor reflection makes sense
//   showIcon    show the app icon next to the title
//   cardBox     max card size when selected, fractions of the monitor
//   pivotY      vertical point the opening zoom grows from (fraction)
//   labelsY, scrollbarY   where the texts and the scrollbar go (fractions)
//   compute(cards, sel, env) → one entry per card:
//       x        centre x on the monitor (px)
//       bottom   y of the card's bottom edge (px); cards scale and turn
//                around their bottom-centre point
//       z        translation_z (px, < 0 = further away)
//       scale    uniform scale
//       rot      rotation_angle_y (degrees, > 0 turns the right edge away)
//       opacity  0..255
//       shade    0..1 darkening of the window content
//       visible  false = hidden (not painted, not clickable)
//       depth    paint order: higher is drawn first (further back)
//     cards: [{width, height}] card sizes at scale 1
//     env:   {W, H, tilt, sideCount, flat}  (flat = light mode)
//
// Only GPU-cheap properties change (translation, scale, rotation, opacity),
// so moving between windows never re-renders the window contents.

import {CarouselLayout} from './carousel.js';
import {FlipLayout} from './flip.js';
import {StackLayout} from './stack.js';

export const LAYOUTS = {
    flip: FlipLayout,
    stack: StackLayout,
    carousel: CarouselLayout,
};

/** Which layout each style uses. */
export const STYLE_LAYOUT = {
    dark: 'flip',
    desktop: 'flip',
    stack: 'stack',
    carousel: 'carousel',
};

export function getLayoutForStyle(style) {
    return LAYOUTS[STYLE_LAYOUT[style] ?? 'flip'];
}

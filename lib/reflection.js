// AeroTab — fade shader for the floor reflection.
//
// The reflection is an upside-down copy of the window. This effect fades
// it out from its top edge (touching the window) down to fully transparent,
// so it works over any background (black or wallpaper) without needing an
// overlay gradient that would have to match the background colour.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';

const DECLARATIONS = 'uniform float aerotab_strength;\n';

// Colours are premultiplied, so multiplying all four channels fades.
// The squared falloff looks more like a real glossy floor than a linear one.
const CODE = `
float t = clamp(1.0 - cogl_tex_coord_in[0].y, 0.0, 1.0);
cogl_color_out *= aerotab_strength * t * t;
`;

export const ReflectionFadeEffect = GObject.registerClass(
class ReflectionFadeEffect extends Clutter.ShaderEffect {
    /**
     * @param {number} strength - opacity right under the window, 0..1
     */
    _init(strength) {
        super._init();
        this.set_uniform_float('aerotab_strength', 1, [strength]);
    }

    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, CODE);
    }
});

// AeroTab — miniature drawing of a switcher style for the preferences
// window. It uses the very same layout code as the switcher
// (lib/layouts/), projected with the same perspective as Clutter's stage,
// follows the tilt / reflection / light-mode settings live, and the
// wallpaper styles use the user's real wallpaper.

import Cairo from 'cairo';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';

import {getLayoutForStyle} from '../lib/layouts/index.js';

// Fake windows: aspect ratio, body colour, title-bar colour, accent.
const FAKE_WINDOWS = [
    [1.55, [0.13, 0.13, 0.15], [0.20, 0.20, 0.23], [0.85, 0.27, 0.27]],
    [1.35, [0.11, 0.12, 0.16], [0.17, 0.18, 0.24], [0.35, 0.55, 0.95]],
    [1.25, [0.16, 0.14, 0.20], [0.42, 0.30, 0.85], [0.55, 0.45, 0.95]],
    [0.80, [0.12, 0.12, 0.12], [0.19, 0.19, 0.19], [0.97, 0.78, 0.25]],
    [0.95, [0.93, 0.93, 0.94], [0.82, 0.82, 0.85], [0.25, 0.45, 0.85]],
    [1.45, [0.10, 0.13, 0.12], [0.16, 0.21, 0.19], [0.30, 0.80, 0.55]],
    [1.30, [0.14, 0.14, 0.17], [0.22, 0.22, 0.26], [0.90, 0.55, 0.30]],
    [1.50, [0.12, 0.13, 0.17], [0.18, 0.20, 0.26], [0.45, 0.70, 0.95]],
    [1.20, [0.15, 0.12, 0.12], [0.24, 0.18, 0.18], [0.95, 0.45, 0.45]],
];
const SELECTED = 4;

// Backdrop per style: blur radius (px at preview size) and dimming.
const BACKDROP = {
    desktop: {blur: 6, dim: 0.36},
    stack: {blur: 10, dim: 0.26},
    carousel: {blur: 10, dim: 0.26},
};

let _wallpaperTexture;   // undefined = not loaded yet, null = unavailable

/** The current wallpaper as a small texture (shared by all previews). */
function getWallpaperTexture() {
    if (_wallpaperTexture !== undefined)
        return _wallpaperTexture;
    _wallpaperTexture = null;
    try {
        const bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        const dark = iface.get_string('color-scheme') === 'prefer-dark';
        const uri = bg.get_string(dark ? 'picture-uri-dark' : 'picture-uri') ||
            bg.get_string('picture-uri');
        let path = Gio.File.new_for_uri(uri).get_path();

        // Slideshow wallpapers are XML files: use their first image.
        if (path?.endsWith('.xml')) {
            const [, bytes] = GLib.file_get_contents(path);
            const match = new TextDecoder().decode(bytes).match(/<file>\s*([^<\s]+)\s*<\/file>/);
            path = match?.[1] ?? null;
        }
        if (!path)
            return null;

        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 640, -1, true);
        _wallpaperTexture = Gdk.MemoryTexture.new(
            pixbuf.get_width(),
            pixbuf.get_height(),
            pixbuf.get_has_alpha() ? Gdk.MemoryFormat.R8G8B8A8 : Gdk.MemoryFormat.R8G8B8,
            pixbuf.read_pixel_bytes(),
            pixbuf.get_rowstride());
    } catch (e) {
        console.warn(`AeroTab prefs: no wallpaper preview: ${e.message}`);
    }
    return _wallpaperTexture;
}

function rgba(r, g, b, a = 1) {
    return new Gdk.RGBA({red: r, green: g, blue: b, alpha: a});
}

export const StylePreview = GObject.registerClass(
class AeroTabStylePreview extends Gtk.Widget {
    /**
     * @param {string} styleName - 'dark' | 'desktop' | 'stack' | 'carousel'
     * @param {Gio.Settings} settings
     */
    _init(styleName, settings) {
        super._init({
            width_request: 300,
            height_request: 169,
            hexpand: true,
            css_classes: ['aerotab-preview'],
        });
        this._styleName = styleName;
        this._layout = getLayoutForStyle(styleName);
        this._settings = settings;
    }

    vfunc_snapshot(snapshot) {
        const w = this.get_width();
        const h = this.get_height();
        const rect = new Graphene.Rect().init(0, 0, w, h);
        const light = this._settings.get_boolean('light-mode');

        const rounded = new Gsk.RoundedRect().init_from_rect(rect, 10);
        snapshot.push_rounded_clip(rounded);

        const backdrop = BACKDROP[this._styleName];
        if (backdrop) {
            const texture = getWallpaperTexture();
            if (texture) {
                // "Cover" the preview, keeping the wallpaper's aspect ratio.
                const s = Math.max(w / texture.get_width(), h / texture.get_height());
                const tw = texture.get_width() * s, th = texture.get_height() * s;
                const target = new Graphene.Rect().init((w - tw) / 2, (h - th) / 2, tw, th);
                if (!light)
                    snapshot.push_blur(backdrop.blur);
                snapshot.append_texture(texture, target);
                if (!light)
                    snapshot.pop();
            } else {
                snapshot.append_linear_gradient(rect,
                    new Graphene.Point({x: 0, y: 0}), new Graphene.Point({x: w, y: h}),
                    [new Gsk.ColorStop({offset: 0, color: rgba(0.16, 0.25, 0.45)}),
                        new Gsk.ColorStop({offset: 1, color: rgba(0.55, 0.35, 0.22)})]);
            }
            snapshot.append_color(rgba(0, 0, 0, backdrop.dim), rect);
        } else {
            snapshot.append_color(rgba(0, 0, 0), rect);
        }

        const cr = snapshot.append_cairo(rect);
        this._drawScene(cr, w, h, light);
        cr.$dispose();

        snapshot.pop();
    }

    /**
     * Project point (u, v) of a card (0..1 across, 0..1 down) the way
     * Clutter does: turn around the bottom-centre pivot, push by z, then
     * the stage perspective (fov 60°, vanishing point at the centre).
     */
    _project(c, u, v, W, H) {
        const D = H * 0.866;
        const x = (u - 0.5) * c.w * c.l.scale;
        const y = c.l.bottom - (1 - v) * c.h * c.l.scale;
        const t = c.l.rot * Math.PI / 180;
        const z = c.l.z - x * Math.sin(t);   // rot > 0: right edge goes away
        const f = D / (D - z);
        return [W / 2 + (c.l.x + x * Math.cos(t) - W / 2) * f, H / 2 + (y - H / 2) * f];
    }

    _quad(cr, c, u0, v0, u1, v1, W, H) {
        const p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
            .map(([u, v]) => this._project(c, u, v, W, H));
        cr.moveTo(...p[0]);
        for (const q of p.slice(1))
            cr.lineTo(...q);
        cr.closePath();
    }

    _drawWindow(cr, c, W, H) {
        const [, body, bar, accent] = c.win;
        cr.setSourceRGB(...body);
        this._quad(cr, c, 0, 0, 1, 1, W, H);
        cr.fill();
        cr.setSourceRGB(...bar);
        this._quad(cr, c, 0, 0, 1, 0.1, W, H);
        cr.fill();
        // A few "content" blocks so it reads as a window.
        cr.setSourceRGBA(...accent, 0.85);
        this._quad(cr, c, 0.06, 0.18, 0.45, 0.26, W, H);
        cr.fill();
        const light = body[0] > 0.5;
        cr.setSourceRGBA(light ? 0 : 1, light ? 0 : 1, light ? 0 : 1, 0.16);
        for (let i = 0; i < 4; i++) {
            this._quad(cr, c, 0.06, 0.34 + i * 0.13, 0.9 - i * 0.12, 0.40 + i * 0.13, W, H);
            cr.fill();
        }
        if (c.l.shade > 0) {
            cr.setSourceRGBA(0, 0, 0, c.l.shade);
            this._quad(cr, c, 0, 0, 1, 1, W, H);
            cr.fill();
        }
    }

    _drawReflection(cr, c, W, H) {
        // Mirror of the bottom 45% of the card, under the floor line.
        const bottom = this._project(c, 0.5, 1, W, H)[1];
        cr.save();
        cr.pushGroup();
        cr.save();
        cr.translate(0, 2 * bottom);
        cr.scale(1, -1);
        this._drawWindow(cr, c, W, H);
        cr.restore();
        cr.popGroupToSource();
        const height = c.h * c.l.scale * 0.45;
        const fade = new Cairo.LinearGradient(0, bottom, 0, bottom + height);
        fade.addColorStopRGBA(0, 0, 0, 0, 0.34 * c.l.opacity / 255);
        fade.addColorStopRGBA(1, 0, 0, 0, 0);
        cr.mask(fade);
        cr.restore();
    }

    _drawScene(cr, W, H, light) {
        const layout = this._layout;
        const box = layout.cardBox;
        const sizes = FAKE_WINDOWS.map(([aspect]) => {
            const h = Math.min(W * box.width / aspect, H * box.height);
            return {width: h * aspect, height: h};
        });
        const entries = layout.compute(sizes, SELECTED, {
            W, H,
            tilt: this._settings.get_int('tilt-angle'),
            sideCount: 4,
            flat: light,
        });
        const cards = entries
            .map((l, i) => ({l, w: sizes[i].width, h: sizes[i].height, win: FAKE_WINDOWS[i]}))
            .filter(c => c.l.visible && c.l.opacity > 0)
            .sort((a, b) => b.l.depth - a.l.depth);
        const reflection = layout.reflection && !light &&
            this._settings.get_boolean('show-reflection');

        for (const c of cards) {
            cr.pushGroup();
            if (reflection)
                this._drawReflection(cr, c, W, H);
            this._drawWindow(cr, c, W, H);
            cr.popGroupToSource();
            cr.paintWithAlpha(c.l.opacity / 255);
        }

        // Close button on the selected card.
        const sel = cards[cards.length - 1];
        const [bx, by] = this._project(sel, 1, 0, W, H);
        cr.setSourceRGBA(0.12, 0.12, 0.12, 0.95);
        cr.arc(bx - 3, by + 3, 5.5, 0, 2 * Math.PI);
        cr.fill();
        cr.setSourceRGB(1, 1, 1);
        cr.setLineWidth(1.2);
        cr.moveTo(bx - 5, by + 1);
        cr.lineTo(bx - 1, by + 5);
        cr.moveTo(bx - 1, by + 1);
        cr.lineTo(bx - 5, by + 5);
        cr.stroke();

        // [icon] title, app name and scrollbar, where the layout puts them.
        cr.selectFontFace('Sans', 0, 0);
        const title = 'Documentos – Arquivos';
        const titleSize = Math.max(8, H * 0.058);
        cr.setFontSize(titleSize);
        const ext = cr.textExtents(title);
        const iconSize = layout.showIcon ? titleSize * 1.1 : 0;
        const gap = layout.showIcon ? 4 : 0;
        const x0 = (W - ext.width - iconSize - gap) / 2;
        const titleY = H * layout.labelsY + titleSize;
        if (layout.showIcon) {
            cr.setSourceRGB(0.35, 0.6, 0.95);
            cr.rectangle(x0, titleY - iconSize * 0.85, iconSize, iconSize);
            cr.fill();
        }
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.moveTo(x0 + iconSize + gap - ext.xBearing, titleY);
        cr.showText(title);

        cr.setFontSize(Math.max(6, H * 0.04));
        const app = 'Arquivos';
        const appExt = cr.textExtents(app);
        cr.setSourceRGBA(1, 1, 1, 0.58);
        const appY = titleY + H * 0.05;
        cr.moveTo((W - appExt.width) / 2 - appExt.xBearing, appY);
        cr.showText(app);

        // At this size the texts take more room: keep the bar below them.
        const trackW = W * 0.31, tx = (W - trackW) / 2;
        const ty = Math.min(H - 4, Math.max(H * layout.scrollbarY + 2, appY + 4));
        cr.setSourceRGBA(1, 1, 1, 0.16);
        cr.rectangle(tx, ty, trackW, 2);
        cr.fill();
        const thumbW = trackW / FAKE_WINDOWS.length;
        cr.setSourceRGBA(1, 1, 1, 0.6);
        cr.rectangle(tx + (trackW - thumbW) * SELECTED / (FAKE_WINDOWS.length - 1), ty, thumbW, 2);
        cr.fill();
    }
});

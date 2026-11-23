// AeroTab — miniature drawing of a switcher style for the preferences
// window. It follows the current tilt / reflection / light-mode settings,
// and the "desktop" preview uses the user's real wallpaper.

import Cairo from 'cairo';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';

// Same proportions as lib/switcher.js.
const FLOOR_Y = 0.64;
const CARD_MAX_WIDTH = 0.32;
const CARD_MAX_HEIGHT = 0.42;
const SIDE_SCALE = 0.86;
const SIDE_SHRINK = 0.95;
const SIDE_OVERLAP = 0.82;

// Fake windows: aspect ratio, body colour, title-bar colour, accent.
const FAKE_WINDOWS = [
    [1.55, [0.13, 0.13, 0.15], [0.20, 0.20, 0.23], [0.85, 0.27, 0.27]],
    [1.35, [0.11, 0.12, 0.16], [0.17, 0.18, 0.24], [0.35, 0.55, 0.95]],
    [1.25, [0.16, 0.14, 0.20], [0.42, 0.30, 0.85], [0.55, 0.45, 0.95]],
    [1.70, [0.12, 0.12, 0.12], [0.19, 0.19, 0.19], [0.97, 0.78, 0.25]],
    [0.95, [0.93, 0.93, 0.94], [0.82, 0.82, 0.85], [0.25, 0.45, 0.85]],
    [1.45, [0.10, 0.13, 0.12], [0.16, 0.21, 0.19], [0.30, 0.80, 0.55]],
    [1.30, [0.14, 0.14, 0.17], [0.22, 0.22, 0.26], [0.90, 0.55, 0.30]],
];
const SELECTED = 3;
const SIDE_COUNT = 3;

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

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPt = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];

export const StylePreview = GObject.registerClass(
class AeroTabStylePreview extends Gtk.Widget {
    /**
     * @param {string} styleName - 'dark' | 'desktop'
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
        this._settings = settings;
    }

    vfunc_snapshot(snapshot) {
        const w = this.get_width();
        const h = this.get_height();
        const rect = new Graphene.Rect().init(0, 0, w, h);
        const light = this._settings.get_boolean('light-mode');

        const rounded = new Gsk.RoundedRect().init_from_rect(rect, 10);
        snapshot.push_rounded_clip(rounded);

        if (this._styleName === 'desktop') {
            const texture = getWallpaperTexture();
            if (texture) {
                // "Cover" the preview, keeping the wallpaper's aspect ratio.
                const s = Math.max(w / texture.get_width(), h / texture.get_height());
                const tw = texture.get_width() * s, th = texture.get_height() * s;
                const target = new Graphene.Rect().init((w - tw) / 2, (h - th) / 2, tw, th);
                if (!light)
                    snapshot.push_blur(6);
                snapshot.append_texture(texture, target);
                if (!light)
                    snapshot.pop();
            } else {
                snapshot.append_linear_gradient(rect,
                    new Graphene.Point({x: 0, y: 0}), new Graphene.Point({x: w, y: h}),
                    [new Gsk.ColorStop({offset: 0, color: rgba(0.16, 0.25, 0.45)}),
                        new Gsk.ColorStop({offset: 1, color: rgba(0.55, 0.35, 0.22)})]);
            }
            snapshot.append_color(rgba(0, 0, 0, 0.36), rect);
        } else {
            snapshot.append_color(rgba(0, 0, 0), rect);
        }

        const cr = snapshot.append_cairo(rect);
        this._drawScene(cr, w, h, light);
        cr.$dispose();

        snapshot.pop();
    }

    /** Project a point of a card turned around its vertical axis. */
    _project(card, u, v, W, H) {
        const D = H * 0.866;   // camera distance for Clutter's 60° fov
        const x = (u - 0.5) * card.w * card.scale;
        const yWorld = card.floor - (1 - v) * card.h * card.scale;
        const t = card.rot * Math.PI / 180;
        // Inner edge goes away; the card is pushed back so its outer edge
        // stays on the screen plane (same as lib/switcher.js).
        const z = card.side * x * Math.sin(t) - (card.w * card.scale / 2) * Math.sin(t);
        const f = D / (D - z);
        return [
            W / 2 + (card.cx + x * Math.cos(t) - W / 2) * f,
            H / 2 + (yWorld - H / 2) * f,
        ];
    }

    _quad(cr, card, u0, v0, u1, v1, W, H) {
        const p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
            .map(([u, v]) => this._project(card, u, v, W, H));
        cr.moveTo(...p[0]);
        for (const q of p.slice(1))
            cr.lineTo(...q);
        cr.closePath();
    }

    _drawCard(cr, card, W, H) {
        const [, body, bar, accent] = card.win;
        cr.setSourceRGB(...body);
        this._quad(cr, card, 0, 0, 1, 1, W, H);
        cr.fill();
        cr.setSourceRGB(...bar);
        this._quad(cr, card, 0, 0, 1, 0.1, W, H);
        cr.fill();
        // A few "content" blocks so it reads as a window.
        cr.setSourceRGBA(...accent, 0.85);
        this._quad(cr, card, 0.06, 0.18, 0.45, 0.26, W, H);
        cr.fill();
        const light = body[0] > 0.5;
        cr.setSourceRGBA(light ? 0 : 1, light ? 0 : 1, light ? 0 : 1, 0.16);
        for (let i = 0; i < 4; i++) {
            this._quad(cr, card, 0.06, 0.34 + i * 0.13, 0.9 - i * 0.12, 0.40 + i * 0.13, W, H);
            cr.fill();
        }
    }

    _drawReflection(cr, card, W, H) {
        // Mirror of the bottom 45% of the card, under the floor line.
        const mirror = {...card};
        const bottom = this._project(card, 0.5, 1, W, H)[1];
        cr.save();
        cr.pushGroup();
        cr.save();
        cr.translate(0, 2 * bottom);
        cr.scale(1, -1);
        this._drawCard(cr, mirror, W, H);
        cr.restore();
        cr.popGroupToSource();
        const height = card.h * card.scale * 0.45;
        const fade = new Cairo.LinearGradient(0, bottom, 0, bottom + height);
        fade.addColorStopRGBA(0, 0, 0, 0, 0.34);
        fade.addColorStopRGBA(1, 0, 0, 0, 0);
        cr.mask(fade);
        cr.restore();
    }

    _layout(W, H, tilt) {
        const maxW = W * CARD_MAX_WIDTH, maxH = H * CARD_MAX_HEIGHT;
        const floor = H * FLOOR_Y;
        const cos = Math.cos(tilt * Math.PI / 180);
        const cards = FAKE_WINDOWS.map((win, i) => {
            const k = Math.min(maxW / win[0], maxH);
            return {win, i, w: win[0] * k, h: k, floor, scale: 1, rot: 0, side: 0, cx: W / 2, depth: 0};
        });
        const sel = cards[SELECTED];
        for (const side of [-1, 1]) {
            let offset = 0, prevHalf = 0;
            for (let k = 1; k <= SIDE_COUNT; k++) {
                const c = cards[SELECTED + side * k];
                c.scale = SIDE_SCALE * SIDE_SHRINK ** (k - 1);
                const half = c.w * c.scale * cos / 2;
                offset = k === 1 ? sel.w / 2 + W * 0.012 + half : offset + (prevHalf + half) * SIDE_OVERLAP;
                prevHalf = half;
                Object.assign(c, {cx: W / 2 + side * offset, rot: tilt, side, depth: k});
            }
        }
        return cards.sort((a, b) => b.depth - a.depth);
    }

    _drawScene(cr, W, H, light) {
        const tilt = light ? 0 : this._settings.get_int('tilt-angle');
        const reflection = !light && this._settings.get_boolean('show-reflection');
        const cards = this._layout(W, H, tilt);

        for (const card of cards) {
            if (reflection)
                this._drawReflection(cr, card, W, H);
            this._drawCard(cr, card, W, H);
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

        // Title, app name and scrollbar.
        const center = (text, y, size, alpha) => {
            cr.setFontSize(size);
            const ext = cr.textExtents(text);
            cr.setSourceRGBA(1, 1, 1, alpha);
            cr.moveTo((W - ext.width) / 2 - ext.xBearing, y);
            cr.showText(text);
        };
        cr.selectFontFace('Sans', 0, 0);
        center('Documentos – Arquivos', H * 0.87, Math.max(8, H * 0.058), 1);
        center('Arquivos', H * 0.925, Math.max(6, H * 0.04), 0.58);

        const trackW = W * 0.31, x0 = (W - trackW) / 2, y0 = H * 0.955;
        cr.setSourceRGBA(1, 1, 1, 0.16);
        cr.rectangle(x0, y0, trackW, 2);
        cr.fill();
        const thumbW = trackW / FAKE_WINDOWS.length;
        cr.setSourceRGBA(1, 1, 1, 0.6);
        cr.rectangle(x0 + (trackW - thumbW) * SELECTED / (FAKE_WINDOWS.length - 1), y0, thumbW, 2);
        cr.fill();
    }
});

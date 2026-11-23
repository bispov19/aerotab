// AeroTab — style 2, "Área de trabalho": the monitor's current wallpaper,
// blurred and dimmed, behind the windows.
//
// The wallpaper comes from the Shell's own BackgroundManager (the same one
// the overview uses), so it follows wallpaper changes, slideshows and the
// light/dark wallpaper variants for free, and shares the Shell's cache.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';

const BLUR_RADIUS = 40;
const BLUR_BRIGHTNESS = 0.62;   // < 1 darkens, so windows stand out
const LIGHT_MODE_DIM = 'aerotab-backdrop-dim';

export class DesktopStyle {
    /**
     * @param {object} params
     * @param {boolean} params.lightMode - no blur (cheaper), only dimming
     */
    constructor({lightMode}) {
        this._lightMode = lightMode;
    }

    get name() {
        return 'desktop';
    }

    get reflectionStrength() {
        return 0.42;   // stronger than dark: the wallpaper is brighter
    }

    /**
     * @param {object} monitor - Main.layoutManager.monitors[i]
     * @returns {Clutter.Actor}
     */
    createBackdrop(monitor) {
        this._monitor = monitor;
        this._actor = new Meta.BackgroundGroup({
            width: monitor.width,
            height: monitor.height,
            clip_to_allocation: true,
        });

        this._bgManager = new Background.BackgroundManager({
            container: this._actor,
            monitorIndex: monitor.index,
            controlPosition: false,
            useContentSize: false,
        });
        // 'changed' fires when the wallpaper actor is replaced
        // (wallpaper changed while the switcher is open).
        this._bgChangedId = this._bgManager.connect('changed',
            () => this._decorateBackground());
        this._decorateBackground();

        if (this._lightMode) {
            // Cheap dimming instead of the blur's brightness.
            this._actor.add_child(new St.Widget({
                style_class: LIGHT_MODE_DIM,
                width: monitor.width,
                height: monitor.height,
            }));
        }
        return this._actor;
    }

    _decorateBackground() {
        const bg = this._bgManager?.backgroundActor;
        if (!bg)
            return;

        bg.set_position(0, 0);
        bg.set_size(this._monitor.width, this._monitor.height);

        if (!this._lightMode && !bg.get_effect('aerotab-blur')) {
            bg.add_effect_with_name('aerotab-blur', new Shell.BlurEffect({
                radius: BLUR_RADIUS,
                brightness: BLUR_BRIGHTNESS,
                mode: Shell.BlurMode.ACTOR,
            }));
        }
    }

    destroy() {
        if (this._bgManager) {
            this._bgManager.disconnect(this._bgChangedId);
            // Releases the cached background source and destroys its actor.
            this._bgManager.destroy();
            this._bgManager = null;
        }
        this._actor = null;
        this._monitor = null;
    }
}

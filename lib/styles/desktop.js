// AeroTab — blurred, dimmed wallpaper backdrop. Used by the styles
// "Área de trabalho" (Flip), "Pilha 3D" and "Carrossel 3D" (stronger blur).
//
// The wallpaper comes from the Shell's own BackgroundManager (the same one
// the overview uses), so it follows wallpaper changes, slideshows and the
// light/dark wallpaper variants for free, and shares the Shell's cache.
//
// Performance: the blur is a Shell.BlurEffect in ACTOR mode on a static
// actor, so it is computed once and reused while nothing changes under it,
// and the whole backdrop is kept in a BackdropCache between openings.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Background from 'resource:///org/gnome/shell/ui/background.js';

const LIGHT_MODE_DIM = 'aerotab-backdrop-dim';

export class DesktopStyle {
    /**
     * @param {object} params
     * @param {string} params.name - style id
     * @param {boolean} params.lightMode - no blur (cheaper), only dimming
     * @param {number} params.blurRadius
     * @param {number} params.brightness - < 1 darkens
     * @param {number} params.reflectionStrength
     * @param {BackdropCache} [params.cache]
     */
    constructor({name, lightMode, blurRadius, brightness, reflectionStrength, cache}) {
        this._name = name;
        this._lightMode = lightMode;
        this._blurRadius = blurRadius;
        this._brightness = brightness;
        this._reflectionStrength = reflectionStrength;
        this._cache = cache ?? null;
    }

    get name() {
        return this._name;
    }

    get reflectionStrength() {
        return this._reflectionStrength;
    }

    /**
     * @param {object} monitor - Main.layoutManager.monitors[i]
     * @returns {Clutter.Actor}
     */
    createBackdrop(monitor) {
        if (!this._cache) {
            const entry = this._build(monitor);
            this._ownEntry = entry;
            return entry.actor;
        }
        const key = [monitor.index, monitor.width, monitor.height,
            this._lightMode ? 'light' : this._blurRadius, this._brightness].join(':');
        this._actor = this._cache.acquire(key, () => this._build(monitor));
        return this._actor;
    }

    _build(monitor) {
        const lightMode = this._lightMode;
        const blurRadius = this._blurRadius;
        const brightness = this._brightness;

        const actor = new Meta.BackgroundGroup({
            width: monitor.width,
            height: monitor.height,
            clip_to_allocation: true,
        });
        let bgManager = new Background.BackgroundManager({
            container: actor,
            monitorIndex: monitor.index,
            controlPosition: false,
            useContentSize: false,
        });

        // Also called when the wallpaper changes ('changed' = the Shell
        // replaced the wallpaper actor), to size and blur the new one.
        const decorate = () => {
            const bg = bgManager?.backgroundActor;
            if (!bg)
                return;
            bg.set_position(0, 0);
            bg.set_size(monitor.width, monitor.height);
            if (!lightMode && !bg.get_effect('aerotab-blur')) {
                bg.add_effect_with_name('aerotab-blur', new Shell.BlurEffect({
                    radius: blurRadius,
                    brightness,
                    mode: Shell.BlurMode.ACTOR,
                }));
            }
        };
        const changedId = bgManager.connect('changed', decorate);
        decorate();

        if (lightMode) {
            // Cheap dimming instead of the blur's brightness.
            actor.add_child(new St.Widget({
                style_class: LIGHT_MODE_DIM,
                width: monitor.width,
                height: monitor.height,
            }));
        }

        return {
            actor,
            destroy: () => {
                if (bgManager) {
                    bgManager.disconnect(changedId);
                    // Releases the cached background source and its actor.
                    bgManager.destroy();
                    bgManager = null;
                }
                actor.destroy();
            },
        };
    }

    /**
     * Called by the switcher in its 'destroy' handler, BEFORE its children
     * are destroyed: a cached backdrop is taken out so it survives.
     */
    destroy() {
        if (this._cache) {
            this._cache.release(this._actor);
        } else if (this._ownEntry) {
            this._ownEntry.destroy();
            this._ownEntry = null;
        }
        this._actor = null;
    }
}

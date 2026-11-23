// AeroTab — style 1, "Escuro": solid black backdrop over the monitor.

import St from 'gi://St';

export class DarkStyle {
    get name() {
        return 'dark';
    }

    /** Opacity of the floor reflection right under each window. */
    get reflectionStrength() {
        return 0.34;
    }

    /**
     * @param {object} monitor - Main.layoutManager.monitors[i]
     * @returns {Clutter.Actor} the backdrop, sized to the monitor
     */
    createBackdrop(monitor) {
        this._actor = new St.Widget({
            style_class: 'aerotab-backdrop-dark',
            width: monitor.width,
            height: monitor.height,
        });
        return this._actor;
    }

    destroy() {
        // The backdrop actor is destroyed with the switcher.
        this._actor = null;
    }
}

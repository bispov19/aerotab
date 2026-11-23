// AeroTab — keeps the blurred-wallpaper backdrops alive between switcher
// openings, so Alt+Tab doesn't rebuild the background and the blur every
// time. One entry per (monitor, blur settings).
//
// The cache is owned by the extension: cleared when monitors, the style
// or light mode change, and destroyed in disable(). Wallpaper changes are
// followed by the Shell's BackgroundManager inside each entry
// (see styles/desktop.js).

export class BackdropCache {
    constructor() {
        this._entries = new Map();   // key → {actor, destroy}
        this._inUse = new Map();     // actor → entry (currently in a switcher)
        this._stale = new Set();     // entries cleared while in use
    }

    /**
     * @param {string} key
     * @param {Function} build - () => {actor, destroy}
     * @returns {Clutter.Actor} actor, ready to be added to a scene
     */
    acquire(key, build) {
        let entry = this._entries.get(key);
        if (!entry || this._inUse.has(entry.actor)) {
            // Not cached yet (or, rarely, already shown elsewhere).
            entry = build();
            if (!this._entries.has(key))
                this._entries.set(key, entry);
            else
                this._stale.add(entry);   // one-off: destroyed on release
        }
        entry.actor.get_parent()?.remove_child(entry.actor);
        entry.actor.opacity = 255;
        this._inUse.set(entry.actor, entry);
        return entry.actor;
    }

    /**
     * Take an actor back from a switcher that is going away. Must run
     * before the switcher's children are destroyed.
     */
    release(actor) {
        const entry = this._inUse.get(actor);
        if (!entry)
            return;
        this._inUse.delete(actor);
        actor.get_parent()?.remove_child(actor);
        if (this._stale.delete(entry))
            entry.destroy();
    }

    /** Drop every entry; the ones still on screen go when released. */
    clear() {
        for (const entry of this._entries.values()) {
            if (this._inUse.has(entry.actor))
                this._stale.add(entry);
            else
                entry.destroy();
        }
        this._entries.clear();
    }

    destroy() {
        this.clear();
        // disable() destroys any open switcher first, so nothing is still
        // in use here; destroy leftovers anyway to never leak.
        for (const entry of this._stale)
            entry.destroy();
        this._stale.clear();
        this._inUse.clear();
    }
}

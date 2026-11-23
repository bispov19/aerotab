// AeroTab — takes over and gives back the Alt+Tab keybindings.
//
// GNOME Shell registers its own handler for these Mutter keybindings in
// ui/windowManager.js with `Main.wm.setCustomKeybindingHandler(...)`.
// We swap that handler for ours, and on restore() we put back exactly the
// same handler GNOME uses (`Main.wm._startSwitcher`), so nothing is left
// pointing at code from a disabled extension.

import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Every binding the default GNOME switchers answer to that means
// "switch windows/apps". Users can have Alt+Tab on either of these
// (Fedora's default is switch-applications), so we take both pairs.
// switch-group / cycle-* (Alt+` and Alt+Esc) are left to GNOME.
export const OVERRIDDEN_BINDINGS = [
    'switch-applications',
    'switch-applications-backward',
    'switch-windows',
    'switch-windows-backward',
];

export class KeybindingOverride {
    /**
     * @param {Function} handler - called as handler(display, window, event, binding)
     */
    constructor(handler) {
        this._handler = handler;
        this._active = false;
    }

    get active() {
        return this._active;
    }

    override() {
        if (this._active)
            return;

        for (const name of OVERRIDDEN_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(name,
                Shell.ActionMode.NORMAL, this._handler);
        }
        this._active = true;
    }

    restore() {
        if (!this._active)
            return;

        // Same call GNOME makes in WindowManager's constructor.
        const original = Main.wm._startSwitcher.bind(Main.wm);
        for (const name of OVERRIDDEN_BINDINGS) {
            Main.wm.setCustomKeybindingHandler(name,
                Shell.ActionMode.NORMAL, original);
        }
        this._active = false;
    }

    destroy() {
        this.restore();
        this._handler = null;
    }
}

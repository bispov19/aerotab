// AeroTab — 3D "Flip" Alt+Tab for GNOME Shell.
//
// enable():  reads settings and, if "enable-switcher" is on, takes over
//            the Alt+Tab keybindings (lib/keybindings.js).
// disable(): closes an open switcher, gives Alt+Tab back to GNOME and
//            drops every signal/reference (extensions.gnome.org rules).

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {BackdropCache} from './lib/backdropCache.js';
import {KeybindingOverride} from './lib/keybindings.js';
import {AeroTabSwitcher} from './lib/switcher.js';
import {createStyle} from './lib/styles/index.js';
import {getSwitcherWindows, getTargetMonitorIndex} from './lib/windows.js';

export default class AeroTabExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._switcher = null;
        this._keybindings = new KeybindingOverride(this._onSwitchKeybinding.bind(this));
        // Blurred wallpapers kept between openings (one per monitor/style).
        this._backdrops = new BackdropCache();
        Main.layoutManager.connectObject('monitors-changed',
            () => this._backdrops.clear(), this);

        this._settings.connectObject(
            'changed::enable-switcher', () => this._syncKeybindings(),
            // Old blurred backdrops of another style/mode are not needed.
            'changed::style', () => this._backdrops.clear(),
            'changed::light-mode', () => this._backdrops.clear(),
            this);
        this._syncKeybindings();
    }

    disable() {
        this._switcher?.destroy();
        this._switcher = null;

        this._keybindings?.destroy();   // restores GNOME's Alt+Tab
        this._keybindings = null;

        Main.layoutManager.disconnectObject(this);
        this._backdrops?.destroy();
        this._backdrops = null;

        this._settings?.disconnectObject(this);
        this._settings = null;
    }

    _syncKeybindings() {
        if (this._settings.get_boolean('enable-switcher')) {
            this._keybindings.override();
        } else {
            this._switcher?.destroy();
            this._keybindings.restore();
        }
    }

    _readOptions() {
        const s = this._settings;
        return {
            style: s.get_string('style'),
            animationDuration: s.get_int('animation-duration'),
            showReflection: s.get_boolean('show-reflection'),
            tiltAngle: s.get_int('tilt-angle'),
            sideWindows: s.get_int('side-windows'),
            allWorkspaces: s.get_boolean('all-workspaces'),
            currentMonitorOnly: s.get_boolean('current-monitor-only'),
            lightMode: s.get_boolean('light-mode'),
        };
    }

    /** Keybinding handler: (display, window, event, binding). */
    _onSwitchKeybinding(_display, _window, _event, binding) {
        if (this._switcher)
            return;

        const options = this._readOptions();
        const monitorIndex = getTargetMonitorIndex();
        const windows = getSwitcherWindows({
            allWorkspaces: options.allWorkspaces,
            monitorIndex: options.currentMonitorOnly ? monitorIndex : -1,
        });
        if (windows.length === 0)
            return;

        let switcher = null;
        try {
            const {style, layout} = createStyle(options.style, {
                lightMode: options.lightMode,
                cache: this._backdrops,
            });
            switcher = new AeroTabSwitcher({windows, monitorIndex, style, layout, options});
            switcher.connect('destroy', () => {
                if (this._switcher === switcher)
                    this._switcher = null;
            });
            this._switcher = switcher;

            if (!switcher.show(binding.is_reversed(), binding.get_mask()))
                switcher.destroy();
        } catch (e) {
            // Never leave a half-built modal overlay (and a grabbed
            // keyboard) behind because of an unexpected error.
            console.error(`AeroTab: could not open the switcher: ${e}\n${e.stack}`);
            switcher?.destroy();
        }
    }
}

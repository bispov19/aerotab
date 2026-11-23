// AeroTab — which windows go into the switcher and on which monitor it opens.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

/**
 * Windows in most-recently-used order, the same way the default GNOME
 * window switcher builds its list (ui/altTab.js getWindows): attached
 * dialogs are replaced by their parent, skip-taskbar windows and
 * duplicates are dropped. Minimized windows are kept.
 *
 * @param {object} options
 * @param {boolean} options.allWorkspaces
 * @param {number} [options.monitorIndex] - only keep windows on this monitor
 * @returns {Meta.Window[]}
 */
export function getSwitcherWindows({allWorkspaces, monitorIndex = -1}) {
    const workspace = allWorkspaces
        ? null
        : global.workspace_manager.get_active_workspace();

    let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace)
        .map(w => (w.is_attached_dialog() ? w.get_transient_for() : w))
        .filter((w, i, all) => w && !w.skip_taskbar && all.indexOf(w) === i);

    if (monitorIndex >= 0)
        windows = windows.filter(w => w.get_monitor() === monitorIndex);

    return windows;
}

/**
 * The monitor the switcher opens on: the one with the focused window,
 * or, without one, the one under the pointer.
 *
 * @returns {number}
 */
export function getTargetMonitorIndex() {
    const focus = global.display.get_focus_window();
    if (focus && focus.get_monitor() >= 0)
        return focus.get_monitor();
    return global.display.get_current_monitor();
}

/**
 * @param {Meta.Window} window
 * @returns {string}
 */
export function getAppName(window) {
    const app = Shell.WindowTracker.get_default().get_window_app(window);
    return app?.get_name() ?? window.get_wm_class() ?? '';
}

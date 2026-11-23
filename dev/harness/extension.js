// AeroTab test harness. Runs ONLY inside the sandboxed headless shell
// started by dev/run-tests.sh. It drives the real switcher with a virtual
// keyboard/mouse, checks focus/modal state and takes screenshots.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UUID = 'aerotab@bispov19';
const OUT = GLib.getenv('AEROTAB_TEST_OUT');
const DEV = GLib.getenv('AEROTAB_DEV_DIR');
const COUNTS = (GLib.getenv('AEROTAB_TEST_COUNTS') ?? '1,2,5,15').split(',').map(Number);
const MULTI_MONITOR = GLib.getenv('AEROTAB_MULTI_MONITOR') === '1';
const PREFS = GLib.getenv('AEROTAB_PREFS') === '1';

const sleep = ms => new Promise(resolve => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    });
});

// Disabling aerotab makes GNOME disable+re-enable the extensions loaded
// after it (this one), so make sure the run only starts once.
let started = false;

export default class Harness extends Extension {
    enable() {
        if (started)
            return;
        started = true;
        this._results = [];
        if (Main.layoutManager._startingUp)
            Main.layoutManager.connect('startup-complete', () => this._start());
        else
            this._start();
    }

    disable() {}

    // ── plumbing ────────────────────────────────────────────────────

    log(msg) {
        console.log(`AEROTAB-TEST ${msg}`);
    }

    check(name, ok, detail = '') {
        this._results.push({name, ok: !!ok, detail: String(detail)});
        this.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    }

    get ext() {
        return Main.extensionManager.lookup(UUID);
    }

    get switcher() {
        return this.ext?.stateObj?._switcher ?? null;
    }

    get settings() {
        return this.ext?.stateObj?._settings ?? null;
    }

    gnomePopup() {
        return Main.uiGroup.get_children().find(c => /SwitcherPopup/.test(c.constructor.name)) ?? null;
    }

    async key(keyval, down) {
        this._kbd.notify_keyval(GLib.get_monotonic_time(), keyval,
            down ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
        await sleep(30);
    }

    async tap(keyval) {
        await this.key(keyval, true);
        await this.key(keyval, false);
    }

    async altDown() {
        await this.key(Clutter.KEY_Alt_L, true);
    }

    async altUp() {
        await this.key(Clutter.KEY_Alt_L, false);
    }

    async openSwitcher(wait = 650) {
        await this.altDown();
        await this.tap(Clutter.KEY_Tab);
        await sleep(wait);
        return this.switcher;
    }

    async click(x, y) {
        this._ptr.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
        await sleep(120);
        this._ptr.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await sleep(50);
        this._ptr.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await sleep(50);
    }

    async scroll(direction) {
        this._ptr.notify_discrete_scroll(GLib.get_monotonic_time(), direction, Clutter.ScrollSource.WHEEL);
        await sleep(80);
    }

    async shot(name) {
        try {
            const file = Gio.File.new_for_path(`${OUT}/${name}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            await new Shell.Screenshot().screenshot(false, stream);
            stream.close(null);
        } catch (e) {
            this.log(`screenshot ${name} failed: ${e}`);
        }
    }

    keyboardFree() {
        return Main.modalCount === 0 && Main.actionMode === Shell.ActionMode.NORMAL;
    }

    testWindows(tag) {
        return global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)
            .filter(w => w.get_title()?.startsWith(`${tag} `));
    }

    mru() {
        // What AeroTab shows with the default settings.
        return global.display.get_tab_list(Meta.TabList.NORMAL_ALL,
            global.workspace_manager.get_active_workspace()).filter(w => !w.skip_taskbar);
    }

    spawnWindows(count, tag, backend = 'wayland') {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
        launcher.setenv('GDK_BACKEND', backend, true);
        launcher.setenv('GTK_A11Y', 'none', true);
        launcher.setenv('NO_AT_BRIDGE', '1', true);
        launcher.setenv('WAYLAND_DISPLAY', GLib.getenv('AEROTAB_WAYLAND'), true);
        if (backend === 'x11' && GLib.getenv('DISPLAY'))
            launcher.setenv('DISPLAY', GLib.getenv('DISPLAY'), true);
        return launcher.spawnv(['gjs', '-m', `${DEV}/test-windows.js`, String(count), tag]);
    }

    async waitFor(cond, timeout = 20000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (cond())
                return true;
            await sleep(100);
        }
        return false;
    }

    /** A point inside `card` where the card itself is the topmost actor. */
    visiblePointOf(card) {
        const ext = card.get_transformed_extents();
        for (let fy = 0.3; fy <= 0.8; fy += 0.1) {
            for (let fx = 0.1; fx <= 0.9; fx += 0.08) {
                const x = ext.origin.x + ext.size.width * fx;
                const y = ext.origin.y + ext.size.height * fy;
                const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
                if (actor && card.contains(actor))
                    return [x, y];
            }
        }
        return null;
    }

    // ── scenarios ───────────────────────────────────────────────────

    async _start() {
        try {
            Main.overview.hide();
            await sleep(1500);
            const seat = global.stage.context.get_backend().get_default_seat();
            this._kbd = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
            this._ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
            this.log(`monitors=${Main.layoutManager.monitors.length} DISPLAY=${GLib.getenv('DISPLAY')}`);

            if (PREFS)
                await this.prefsScenario();
            else if (MULTI_MONITOR)
                await this.multiMonitorScenario();
            else
                for (const n of COUNTS)
                    await this.scenario(n);
        } catch (e) {
            this.check('harness crashed', false, `${e}\n${e.stack}`);
        }

        const failed = this._results.filter(r => !r.ok).length;
        this.log(`DONE ${this._results.length - failed}/${this._results.length} passed`);
        GLib.file_set_contents(`${OUT}/results.json`, JSON.stringify(this._results, null, 2));
        await sleep(300);
        global.context.terminate();
    }

    async scenario(n) {
        const tag = `N${n}`;
        this.log(`=== ${n} window(s) ===`);
        // With 5 windows, 2 of them are X11 (Xwayland) clients.
        const procs = [];
        if (n === 5 && GLib.getenv('DISPLAY')) {
            procs.push(this.spawnWindows(3, tag, 'wayland'));
            await this.waitFor(() => this.testWindows(tag).length === 3);
            procs.push(this.spawnWindows(2, `${tag}`, 'x11'));
        } else {
            procs.push(this.spawnWindows(n, tag));
        }
        const appeared = await this.waitFor(() => this.testWindows(tag).length === n);
        this.check(`[${n}] ${n} test windows mapped`, appeared, this.testWindows(tag).length);
        await sleep(1200);

        // 1) Alt+Tab opens, Tab/Shift+Tab/arrows move, releasing Alt switches.
        let mru = this.mru();
        let sw = await this.openSwitcher();
        this.check(`[${n}] Alt+Tab opens AeroTab`, sw?.isShown);
        this.check(`[${n}] one card per window`, sw?.cards.length === mru.length, `${sw?.cards.length} vs ${mru.length}`);
        const firstSel = mru.length > 1 ? 1 : 0;
        this.check(`[${n}] initial selection = previous window`, sw?.selectedIndex === firstSel, sw?.selectedIndex);
        await sleep(400);
        await this.shot(`n${String(n).padStart(2, '0')}-dark`);
        this.checkGeometry(n, sw);

        let expected = firstSel;
        if (mru.length > 1) {
            await this.tap(Clutter.KEY_Tab);
            expected = (firstSel + 1) % mru.length;
            this.check(`[${n}] Tab advances`, sw.selectedIndex === expected, sw.selectedIndex);

            await this.key(Clutter.KEY_Shift_L, true);
            await this.tap(Clutter.KEY_Tab);
            await this.key(Clutter.KEY_Shift_L, false);
            expected = firstSel;
            this.check(`[${n}] Shift+Tab goes back`, sw.selectedIndex === expected, sw.selectedIndex);

            await this.tap(Clutter.KEY_Right);
            await this.tap(Clutter.KEY_Right);
            await this.tap(Clutter.KEY_Left);
            expected = (firstSel + 1) % mru.length;
            this.check(`[${n}] arrow keys move`, sw.selectedIndex === expected, sw.selectedIndex);
        }
        await sleep(300);
        await this.altUp();
        await sleep(700);
        this.check(`[${n}] releasing Alt closes the switcher`, !this.switcher && !Main.uiGroup.get_children().some(c => c.constructor.name.includes('FlipSwitcher')));
        this.check(`[${n}] keyboard released (no modal left)`, this.keyboardFree(), `modalCount=${Main.modalCount}`);
        this.check(`[${n}] selected window got focus`, global.display.focus_window === mru[expected],
            `${global.display.focus_window?.get_title()} vs ${mru[expected]?.get_title()}`);

        // 2) Esc cancels and keeps focus.
        let before = global.display.focus_window;
        sw = await this.openSwitcher();
        if (mru.length > 1)
            await this.tap(Clutter.KEY_Tab);
        await this.tap(Clutter.KEY_Escape);
        await sleep(150);
        this.check(`[${n}] Esc: keyboard released immediately`, this.keyboardFree());
        await this.altUp();
        await sleep(600);
        this.check(`[${n}] Esc: focus stays on the previous window`, global.display.focus_window === before,
            global.display.focus_window?.get_title());
        this.check(`[${n}] Esc: switcher gone`, !this.switcher);

        // 3) Fast Alt+Tab (released before the 150 ms delay) switches without showing.
        mru = this.mru();
        await this.altDown();
        await this.tap(Clutter.KEY_Tab);
        const shownDuringQuick = this.switcher?.isShown ?? false;
        await this.altUp();
        await sleep(500);
        this.check(`[${n}] quick Alt+Tab switches without flashing`,
            !shownDuringQuick && global.display.focus_window === mru[firstSel] && this.keyboardFree());

        if (mru.length > 1) {
            // 4) Mouse wheel.
            mru = this.mru();
            sw = await this.openSwitcher();
            await this.scroll(Clutter.ScrollDirection.DOWN);
            this.check(`[${n}] wheel down advances`, sw.selectedIndex === (firstSel + 1) % mru.length, sw.selectedIndex);
            await this.scroll(Clutter.ScrollDirection.UP);
            this.check(`[${n}] wheel up goes back`, sw.selectedIndex === firstSel, sw.selectedIndex);
            await this.tap(Clutter.KEY_Escape);
            await this.altUp();
            await sleep(500);

            // 5) Clicking a side window activates it.
            mru = this.mru();
            sw = await this.openSwitcher(900);
            const targetIndex = (sw.selectedIndex + 1) % sw.cards.length;
            const target = sw.cards[targetIndex];
            const point = this.visiblePointOf(target);
            this.check(`[${n}] side card is clickable somewhere`, !!point);
            if (point) {
                await this.click(...point);
                await sleep(600);
                this.check(`[${n}] click activates that window`, global.display.focus_window === target.window,
                    global.display.focus_window?.get_title());
                this.check(`[${n}] click: switcher closed, keyboard free`, !this.switcher && this.keyboardFree());
            }
            await this.altUp();
            await sleep(400);

            // 6) The X closes the selected window.
            sw = await this.openSwitcher(900);
            const victim = sw.cards[sw.selectedIndex].window;
            const btn = sw.cards[sw.selectedIndex].closeButton;
            const [bx, by] = btn.get_transformed_position();
            const [bw, bh] = btn.get_transformed_size();
            const countBefore = sw.cards.length;
            await this.click(bx + bw / 2, by + bh / 2);
            await this.waitFor(() => !this.testWindows(tag).includes(victim), 4000);
            await sleep(500);
            this.check(`[${n}] X closes the window`, !this.testWindows(tag).includes(victim));
            this.check(`[${n}] X: card removed, switcher stays open`,
                this.switcher === sw && sw.cards.length === countBefore - 1, `${sw.cards?.length}`);
            await this.shot(`n${String(n).padStart(2, '0')}-after-close`);
            await this.tap(Clutter.KEY_Escape);
            await this.altUp();
            await sleep(500);
            this.check(`[${n}] X: keyboard free afterwards`, this.keyboardFree());
        }

        // 7) Desktop style (+ light mode with 15 windows).
        this.settings.set_string('style', 'desktop');
        sw = await this.openSwitcher(900);
        this.check(`[${n}] desktop style opens`, sw?.isShown);
        await this.shot(`n${String(n).padStart(2, '0')}-desktop`);
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);
        if (n >= 15) {
            this.settings.set_boolean('light-mode', true);
            sw = await this.openSwitcher(900);
            this.check(`[${n}] light mode opens`, sw?.isShown);
            await this.shot(`n${n}-desktop-light`);
            await this.tap(Clutter.KEY_Escape);
            await this.altUp();
            await sleep(500);
            this.settings.reset('light-mode');
        }
        this.settings.reset('style');

        if (n === 5)
            await this.toggleScenarios();

        for (const p of procs)
            p.force_exit();
        await this.waitFor(() => this.testWindows(tag).length === 0, 8000);
        await sleep(500);
    }

    /** Side cards must turn their inner edge away (shorter inner edge). */
    checkGeometry(n, sw) {
        if (!sw || sw.cards.length < 3)
            return;
        const sel = sw.selectedIndex;
        const edges = card => {
            const v = card.get_abs_allocation_vertices();  // tl, tr, bl, br
            return {left: v[2].y - v[0].y, right: v[3].y - v[1].y, x: (v[0].x + v[1].x) / 2};
        };
        const left = edges(sw.cards[(sel - 1 + sw.cards.length) % sw.cards.length]);
        const right = edges(sw.cards[(sel + 1) % sw.cards.length]);
        const centre = edges(sw.cards[sel]);
        this.log(`geometry centre=${JSON.stringify(centre)} left=${JSON.stringify(left)} right=${JSON.stringify(right)}`);
        if (left.x < centre.x)
            this.check(`[${n}] left card: inner (right) edge recedes`, left.right < left.left, `${left.left.toFixed(0)}/${left.right.toFixed(0)}`);
        if (right.x > centre.x)
            this.check(`[${n}] right card: inner (left) edge recedes`, right.left < right.right, `${right.left.toFixed(0)}/${right.right.toFixed(0)}`);
    }

    async toggleScenarios() {
        // Option off → GNOME's own Alt+Tab.
        this.settings.set_boolean('enable-switcher', false);
        await sleep(200);
        await this.openSwitcher(700);
        this.check('[toggle] option off: GNOME switcher shows', !!this.gnomePopup() && !this.switcher);
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);
        this.check('[toggle] option off: keyboard free', this.keyboardFree());

        this.settings.set_boolean('enable-switcher', true);
        await sleep(200);
        let sw = await this.openSwitcher();
        this.check('[toggle] option on again: AeroTab shows', sw?.isShown && !this.gnomePopup());
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);

        // Disabling the extension while the switcher is open.
        sw = await this.openSwitcher();
        Main.extensionManager.disableExtension(UUID);
        await sleep(400);
        this.check('[toggle] disable while open: overlay removed',
            !Main.uiGroup.get_children().some(c => c.has_style_class_name?.('aerotab-switcher')));
        this.check('[toggle] disable while open: keyboard free', this.keyboardFree(), `modalCount=${Main.modalCount}`);
        await this.altUp();
        await sleep(300);

        await this.openSwitcher(700);
        this.check('[toggle] extension disabled: GNOME switcher shows', !!this.gnomePopup());
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);
        this.check('[toggle] extension disabled: keyboard free', this.keyboardFree());

        Main.extensionManager.enableExtension(UUID);
        await sleep(500);
        sw = await this.openSwitcher();
        this.check('[toggle] re-enabled: AeroTab shows', sw?.isShown && !this.gnomePopup());
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);

        // Workspaces option: a window on workspace 2.
        const wm = global.workspace_manager;
        const ws2 = wm.get_n_workspaces() > 1 ? wm.get_workspace_by_index(1) : wm.append_new_workspace(false, global.get_current_time());
        const moved = this.mru()[this.mru().length - 1];
        moved.change_workspace(ws2);
        await sleep(300);
        sw = await this.openSwitcher();
        const onlyCurrent = sw.cards.length;
        const hasMoved = sw.cards.some(c => c.window === moved);
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(400);
        this.settings.set_boolean('all-workspaces', true);
        sw = await this.openSwitcher();
        const all = sw.cards.length;
        const hasMovedAll = sw.cards.some(c => c.window === moved);
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(400);
        this.settings.reset('all-workspaces');
        this.check('[workspaces] current workspace only hides the other one', !hasMoved, onlyCurrent);
        this.check('[workspaces] all workspaces shows it', hasMovedAll && all === onlyCurrent + 1, all);
        moved.change_workspace(wm.get_active_workspace());
        await sleep(300);
    }

    async prefsScenario() {
        // D-Bus activated apps (the prefs app) must find our Wayland socket.
        const env = Gio.Subprocess.new(['dbus-update-activation-environment',
            `WAYLAND_DISPLAY=${GLib.getenv('AEROTAB_WAYLAND')}`, 'GDK_BACKEND=wayland', 'GTK_A11Y=none'],
        Gio.SubprocessFlags.NONE);
        await new Promise(r => env.wait_async(null, () => r()));
        this.ext.stateObj.openPreferences();
        const opened = await this.waitFor(() => global.display.focus_window?.get_wm_class()?.includes('Extensions'), 15000);
        this.check('[prefs] preferences window opens', opened, global.display.focus_window?.get_wm_class());
        await sleep(2500);
        const win = global.display.focus_window;
        if (win) {
            const area = Main.layoutManager.getWorkAreaForMonitor(0);
            win.move_resize_frame(false, area.x, area.y, 820, area.height);
            await sleep(1500);
        }
        await this.shot('prefs');
        // Light mode greys out reflection/tilt and changes the previews.
        this.settings.set_boolean('light-mode', true);
        await sleep(800);
        await this.shot('prefs-light');
        this.settings.reset('light-mode');
        win?.delete(global.get_current_time());
        await sleep(500);
    }

    async multiMonitorScenario() {
        const tag = 'MM';
        const proc = this.spawnWindows(4, tag);
        await this.waitFor(() => this.testWindows(tag).length === 4);
        await sleep(1000);
        // Put the focused window on monitor 1: the switcher must open there.
        const focus = global.display.focus_window;
        focus.move_to_monitor(1);
        await sleep(500);
        const sw = await this.openSwitcher(900);
        const [sx] = sw._scene.get_transformed_position();
        const m1 = Main.layoutManager.monitors[1];
        this.check('[monitors] opens on the focused window\'s monitor', Math.round(sx) === m1.x, `${sx} vs ${m1.x}`);
        await this.shot('multimonitor');
        await this.tap(Clutter.KEY_Escape);
        await this.altUp();
        await sleep(500);
        this.check('[monitors] keyboard free', this.keyboardFree());
        proc.force_exit();
    }
}

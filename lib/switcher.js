// AeroTab — the switcher itself, shared by all four styles. What differs
// between styles is only the backdrop (lib/styles/) and where the cards go
// (lib/layouts/); input, focus, closing and animations live here.
//
// Lifecycle, mirroring GNOME's own ui/switcherPopup.js so keyboard focus
// behaves the same way:
//   show()   takes a modal grab, picks the initial window and waits
//            POPUP_DELAY ms before appearing, so a quick Alt+Tab just
//            switches without flashing the overlay.
//   _finish  activates the selected window; cancel() keeps the old one.
//   _close   ALWAYS drops the modal grab first (keyboard is free again
//            immediately), then plays the closing animation, then destroys.
//
// Actor tree:
//   AeroTabSwitcher (whole stage, catches clicks outside = cancel)
//   └─ scene (one monitor, clipped)
//      ├─ backdrop   (from the style: black, or blurred wallpaper)
//      ├─ cardsLayer (WindowCards in 3D)
//      ├─ labels     ([app icon] window title + app name)
//      └─ scrollbar  (track + thumb)

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WindowCard} from './card.js';
import {getAppName} from './windows.js';

const POPUP_DELAY = 150;        // ms, same as GNOME
const NO_MODS_TIMEOUT = 1500;   // ms, for bindings without a modifier

const SCROLLBAR_WIDTH = 0.31;   // fraction of the monitor width
const APP_ICON_SIZE = 28;

const EASE_MODE = Clutter.AnimationMode.EASE_OUT_CUBIC;

const FORWARD_ACTIONS = [
    Meta.KeyBindingAction.SWITCH_APPLICATIONS,
    Meta.KeyBindingAction.SWITCH_WINDOWS,
];
const BACKWARD_ACTIONS = [
    Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD,
    Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD,
];

function primaryModifier(mask) {
    if (mask === 0)
        return 0;
    let primary = 1;
    while (mask > 1) {
        mask >>= 1;
        primary <<= 1;
    }
    return primary;
}

export const AeroTabSwitcher = GObject.registerClass(
class AeroTabSwitcher extends St.Widget {
    /**
     * @param {object} params
     * @param {Meta.Window[]} params.windows - MRU order
     * @param {number} params.monitorIndex
     * @param {object} params.style - backdrop provider (lib/styles/)
     * @param {object} params.layout - card placement (lib/layouts/)
     * @param {object} params.options - snapshot of the settings
     */
    _init({windows, monitorIndex, style, layout, options}) {
        super._init({
            style_class: 'aerotab-switcher',
            reactive: true,
            visible: false,
            opacity: 0,
        });

        this._style = style;
        this._layout = layout;
        this._options = options;
        this._monitor = Main.layoutManager.monitors[monitorIndex];
        this._duration = options.animationDuration;
        this._layoutEnv = {
            W: this._monitor.width,
            H: this._monitor.height,
            tilt: options.tiltAngle,
            sideCount: options.sideWindows,
            flat: options.lightMode,
        };

        this._cards = [];
        this._selectedIndex = 0;
        this._haveModal = false;
        this._grab = null;
        this._modifierMask = 0;
        this._shown = false;
        this._closing = false;
        this._scrollAccum = 0;
        this._initialDelayId = 0;
        this._noModsId = 0;
        this._closeTimeoutId = 0;

        this.connect('destroy', this._onDestroy.bind(this));

        Main.uiGroup.add_child(this);
        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        // A system modal dialog (polkit, end session...) or a monitor
        // change wins over us.
        Main.layoutManager.connectObject(
            'system-modal-opened', () => this.cancel(),
            'monitors-changed', () => this.destroy(),
            this);

        this._buildScene();
        this._buildCards(windows);
        this._connectInput();
    }

    // ── Building ──────────────────────────────────────────────────────────

    _buildScene() {
        const {x, y, width, height} = this._monitor;

        // Covers the whole stage: a click anywhere outside a window cancels.
        this._catcher = new Clutter.Actor({reactive: true});
        this._catcher.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        const outsideClick = new Clutter.ClickGesture();
        // Gestures compete for the same press in Clutter 51, and this one
        // could win over a card's click. Like GNOME's SwitcherPopup, only
        // accept it when what is under the pointer is not a card.
        outsideClick.connect('may-recognize', () => {
            const {x, y} = outsideClick.get_coords_abs();
            const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
            return !this._cardsLayer?.contains(actor);
        });
        outsideClick.connect('recognize', () => this.cancel());
        this._catcher.add_action(outsideClick);
        this.add_child(this._catcher);

        // Clipped to the monitor so nothing bleeds onto other monitors.
        this._scene = new Clutter.Actor({x, y, width, height, clip_to_allocation: true});
        this.add_child(this._scene);

        this._backdrop = this._style.createBackdrop(this._monitor);
        this._scene.add_child(this._backdrop);

        this._cardsLayer = new Clutter.Actor({
            width,
            height,
            pivot_point: new Graphene.Point({x: 0.5, y: this._layout.pivotY}),
        });
        this._scene.add_child(this._cardsLayer);

        // Clutter has ONE perspective for the whole stage, with the
        // vanishing point at the stage centre. On a multi-monitor setup that
        // is not the centre of our monitor, so the corridor would look
        // lopsided. A shear x' = x + kx·z (and y) moves the vanishing point to
        // the monitor centre: with camera distance D, k = (stageC - monC) / D.
        const D = global.stage.height * 0.8660254;  // 0.5 / tan(30°), fov 60°
        const kx = (global.stage.width / 2 - (x + width / 2)) / D;
        const ky = (global.stage.height / 2 - (y + height / 2)) / D;
        if (Math.abs(kx) > 1e-4 || Math.abs(ky) > 1e-4) {
            this._cardsLayer.set_child_transform(new Graphene.Matrix().init_from_float([
                1, 0, 0, 0,
                0, 1, 0, 0,
                kx, ky, 1, 0,
                0, 0, 0, 1,
            ]));
        }

        const labelsWidth = Math.round(width * 0.7);
        this._labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x: Math.round((width - labelsWidth) / 2),
            y: Math.round(height * this._layout.labelsY),
            width: labelsWidth,
        });
        // [app icon (carousel only)] + title, centred; app name under it.
        this._titleRow = new St.BoxLayout({
            style_class: 'aerotab-title-row',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._appIcon = new St.Bin({
            style_class: 'aerotab-app-icon',
            y_align: Clutter.ActorAlign.CENTER,
            visible: this._layout.showIcon,
        });
        this._titleLabel = new St.Label({
            style_class: 'aerotab-title',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._titleRow.add_child(this._appIcon);
        this._titleRow.add_child(this._titleLabel);
        this._appLabel = new St.Label({
            style_class: 'aerotab-app-name',
            x_align: Clutter.ActorAlign.CENTER,
        });
        for (const label of [this._titleLabel, this._appLabel])
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._labels.add_child(this._titleRow);
        this._labels.add_child(this._appLabel);
        this._scene.add_child(this._labels);

        this._trackWidth = Math.round(width * SCROLLBAR_WIDTH);
        this._scrollTrack = new St.Widget({
            style_class: 'aerotab-scrollbar',
            x: Math.round((width - this._trackWidth) / 2),
            y: Math.round(height * this._layout.scrollbarY),
            width: this._trackWidth,
        });
        this._scrollThumb = new St.Widget({style_class: 'aerotab-scrollbar-thumb'});
        this._scrollTrack.add_child(this._scrollThumb);
        this._scene.add_child(this._scrollTrack);
    }

    _buildCards(windows) {
        const maxW = this._monitor.width * this._layout.cardBox.width;
        const maxH = this._monitor.height * this._layout.cardBox.height;
        const reflectionStrength = this._layout.reflection &&
            this._options.showReflection && !this._options.lightMode
            ? this._style.reflectionStrength : 0;

        for (const window of windows) {
            const frame = window.get_frame_rect();
            const fw = frame.width > 0 ? frame.width : maxW;
            const fh = frame.height > 0 ? frame.height : maxH;
            // Fit in the box, never upscale small windows.
            const k = Math.min(maxW / fw, maxH / fh, 1);

            const card = new WindowCard(window, {
                width: Math.round(fw * k),
                height: Math.round(fh * k),
                reflectionStrength,
            });
            card.connect('clicked', () => this._onCardClicked(card));
            card.connect('close-clicked', () => this._onCloseClicked(card));
            this._cardsLayer.add_child(card);
            this._cards.push(card);

            window.connectObject(
                'unmanaged', () => this._onWindowRemoved(window),
                'notify::title', () => this._updateLabels(),
                this);
        }

        const thumbWidth = Math.max(28, Math.round(this._trackWidth / Math.max(1, this._cards.length)));
        this._scrollThumb.width = thumbWidth;
        this._scrollTrack.visible = this._cards.length > 1;
    }

    _connectInput() {
        const keys = new Clutter.KeyController();
        keys.connect('key-press', this._onKeyPress.bind(this));
        keys.connect('modifier-change', this._onModifierChange.bind(this));
        this.add_action(keys);

        // DISCRETE: Clutter turns smooth touchpad scrolling into whole
        // steps, so one wheel notch / swipe step = one window.
        const scroll = new Clutter.ScrollController({
            flags: Clutter.ScrollControllerFlags.SCROLL_VERTICAL |
                Clutter.ScrollControllerFlags.SCROLL_HORIZONTAL |
                Clutter.ScrollControllerFlags.DISCRETE,
        });
        scroll.connect('scroll', this._onScroll.bind(this));
        this.add_action(scroll);
    }

    // ── Showing ───────────────────────────────────────────────────────────

    /**
     * @param {boolean} backward - opened with Shift (Alt+Shift+Tab)
     * @param {number} mask - modifier mask of the binding (Alt)
     * @returns {boolean} false if it could not open (caller destroys it)
     */
    show(backward, mask) {
        if (this._cards.length === 0)
            return false;

        // CRITICAL: the modal grab is what routes the keyboard to us.
        // If we don't get the keyboard, bail out instead of half-opening.
        const grab = Main.pushModal(this);
        if (grab.get_seat_state && !(grab.get_seat_state() & Clutter.GrabState.KEYBOARD)) {
            Main.popModal(grab);
            return false;
        }
        this._grab = grab;
        this._haveModal = true;
        this._modifierMask = primaryModifier(mask);

        this.visible = true;
        const n = this._cards.length;
        const initial = backward ? n - 1 : Math.min(1, n - 1);
        this._select(initial, false);

        // CRITICAL: if Alt was released before we got the grab, we never
        // see the release, so check now (same race GNOME handles).
        if (this._modifierMask) {
            const [, , mods] = global.get_pointer();
            if (!(mods & this._modifierMask)) {
                this._finish(global.get_current_time());
                return true;
            }
        } else {
            this._resetNoModsTimeout();
        }

        this._initialDelayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POPUP_DELAY, () => {
            this._initialDelayId = 0;
            this._showImmediately();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._initialDelayId, '[aerotab] popup delay');
        return true;
    }

    _showImmediately() {
        if (this._shown || this._closing)
            return;
        if (this._initialDelayId) {
            GLib.source_remove(this._initialDelayId);
            this._initialDelayId = 0;
        }
        this._shown = true;
        Main.osdWindowManager.hideAll();

        // Cards were laid out without animation in show(); now everything
        // fades in while the cards grow from slightly smaller.
        this.opacity = 255;
        const d = this._duration;
        this._backdrop.opacity = 0;
        this._backdrop.ease({opacity: 255, duration: d, mode: EASE_MODE});

        this._cardsLayer.set({opacity: 0, scale_x: 0.9, scale_y: 0.9});
        this._cardsLayer.ease({opacity: 255, scale_x: 1, scale_y: 1, duration: d, mode: EASE_MODE});

        for (const actor of [this._labels, this._scrollTrack]) {
            actor.opacity = 0;
            actor.ease({opacity: 255, duration: d, mode: EASE_MODE});
        }
    }

    // ── Selection and 3D layout ───────────────────────────────────────────

    _select(index, animate = true) {
        const n = this._cards.length;
        if (n === 0)
            return;
        this._selectedIndex = ((index % n) + n) % n;
        this._applyLayout(animate && this._shown);
        this._updateLabels();
        this._updateScrollbar(animate && this._shown);
    }

    /** Where every card goes when `sel` is selected (see lib/layouts/index.js). */
    _computeLayout(sel) {
        const sizes = this._cards.map(c => ({width: c.width, height: c.height}));
        return this._layout.compute(sizes, sel, this._layoutEnv);
    }

    _applyLayout(animate) {
        const layout = this._computeLayout(this._selectedIndex);
        const duration = animate ? this._duration : 0;

        this._cards.forEach((card, i) => {
            const l = layout[i];
            if (l.visible)
                card.show();
            card.ease({
                x: Math.round(l.x - card.width / 2),
                y: Math.round(l.bottom - card.height),
                scale_x: l.scale,
                scale_y: l.scale,
                rotation_angle_y: l.rot,
                translation_z: l.z,
                opacity: l.opacity,
                duration,
                mode: EASE_MODE,
                onStopped: finished => {
                    // Fully hidden cards are not painted or clickable.
                    if (finished && !l.visible)
                        card.hide();
                },
            });
            card.setShade(l.shade ?? 0, duration);
            card.setSelected(i === this._selectedIndex, duration);
        });

        // Paint order = depth order: farthest first, selected card last.
        const order = this._cards
            .map((card, i) => ({card, depth: layout[i].depth}))
            .sort((a, b) => b.depth - a.depth);
        for (const {card} of order)
            this._cardsLayer.set_child_above_sibling(card, null);
    }

    _updateLabels() {
        const card = this._cards[this._selectedIndex];
        if (!card)
            return;
        this._titleLabel.text = card.window.get_title() ?? '';
        this._appLabel.text = getAppName(card.window);

        if (this._layout.showIcon && this._iconWindow !== card.window) {
            this._iconWindow = card.window;
            const app = Shell.WindowTracker.get_default().get_window_app(card.window);
            this._appIcon.set_child(app
                ? app.create_icon_texture(APP_ICON_SIZE)
                : new St.Icon({icon_name: 'application-x-executable-symbolic', icon_size: APP_ICON_SIZE}));
        }
    }

    _updateScrollbar(animate) {
        const n = this._cards.length;
        const thumb = this._scrollThumb;
        const pos = n > 1
            ? (this._trackWidth - thumb.width) * this._selectedIndex / (n - 1)
            : 0;
        thumb.ease({
            translation_x: pos,
            duration: animate ? this._duration : 0,
            mode: EASE_MODE,
        });
    }

    // ── Input ─────────────────────────────────────────────────────────────

    _onKeyPress(controller) {
        const [, keysym, keycode] = controller.get_key();
        const [, pressed, latched, locked] = controller.get_state();
        const action = global.display.get_keybinding_action(keycode, pressed | latched | locked);

        if (this._closing)
            return Clutter.EVENT_STOP;

        if (FORWARD_ACTIONS.includes(action) || keysym === Clutter.KEY_Tab ||
            keysym === Clutter.KEY_Right || keysym === Clutter.KEY_KP_Right) {
            this._select(this._selectedIndex + 1);
        } else if (BACKWARD_ACTIONS.includes(action) || keysym === Clutter.KEY_ISO_Left_Tab ||
                   keysym === Clutter.KEY_Left || keysym === Clutter.KEY_KP_Left) {
            this._select(this._selectedIndex - 1);
        } else if (keysym === Clutter.KEY_Home) {
            this._select(0);
        } else if (keysym === Clutter.KEY_End) {
            this._select(this._cards.length - 1);
        } else if (keysym === Clutter.KEY_Delete) {
            this._onCloseClicked(this._cards[this._selectedIndex]);
        } else if (keysym === Clutter.KEY_Escape) {
            this.cancel();
            return Clutter.EVENT_STOP;
        } else if (keysym === Clutter.KEY_Return || keysym === Clutter.KEY_KP_Enter ||
                   keysym === Clutter.KEY_ISO_Enter || keysym === Clutter.KEY_space) {
            this._finish(Clutter.get_current_event_time());
            return Clutter.EVENT_STOP;
        } else {
            return Clutter.EVENT_STOP;
        }

        this._showImmediately();
        return Clutter.EVENT_STOP;
    }

    _onModifierChange(controller) {
        // CRITICAL: releasing Alt is what confirms the selection.
        if (this._modifierMask) {
            const [, pressed, latched, locked] = controller.get_state();
            if (((pressed | latched | locked) & this._modifierMask) === 0)
                this._finish(Clutter.get_current_event_time());
        } else {
            this._resetNoModsTimeout();
        }
        return Clutter.EVENT_STOP;
    }

    _onScroll(_controller, _sprite, _source, dx, dy) {
        if (this._closing)
            return Clutter.EVENT_STOP;

        // Touchpads send many small deltas, wheels send ±1: accumulate so
        // one wheel notch = one window and touchpads don't fly through.
        this._scrollAccum += Math.abs(dy) >= Math.abs(dx) ? dy : dx;
        let steps = 0;
        while (this._scrollAccum >= 1) {
            this._scrollAccum -= 1;
            steps++;
        }
        while (this._scrollAccum <= -1) {
            this._scrollAccum += 1;
            steps--;
        }
        if (steps !== 0) {
            this._select(this._selectedIndex + steps);
            this._showImmediately();
        }
        return Clutter.EVENT_STOP;
    }

    _onCardClicked(card) {
        if (this._closing)
            return;
        const index = this._cards.indexOf(card);
        if (index < 0)
            return;
        this._selectedIndex = index;
        this._finish(global.get_current_time());
    }

    _onCloseClicked(card) {
        if (this._closing || !card)
            return;
        // The window may ask to save first; if it really goes away,
        // 'unmanaged' removes its card (see _onWindowRemoved).
        card.window.delete(global.get_current_time());
    }

    _onWindowRemoved(window) {
        const index = this._cards.findIndex(c => c.window === window);
        if (index < 0)
            return;

        const [card] = this._cards.splice(index, 1);
        card.destroy();

        if (this._closing)
            return;
        if (this._cards.length === 0) {
            this.cancel();
            return;
        }

        this._scrollThumb.width = Math.max(28,
            Math.round(this._trackWidth / this._cards.length));
        this._scrollTrack.visible = this._cards.length > 1;

        let sel = this._selectedIndex;
        if (index < sel || sel >= this._cards.length)
            sel--;
        this._select(Math.max(0, sel));
    }

    _resetNoModsTimeout() {
        if (this._noModsId)
            GLib.source_remove(this._noModsId);
        this._noModsId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, NO_MODS_TIMEOUT, () => {
            this._noModsId = 0;
            this._finish(global.display.get_current_time_roundtrip());
            return GLib.SOURCE_REMOVE;
        });
    }

    // ── Closing ───────────────────────────────────────────────────────────

    /** Switch to the selected window and close. */
    _finish(timestamp) {
        if (this._closing)
            return;
        const card = this._cards[this._selectedIndex];
        if (!card) {
            this.cancel();
            return;
        }
        // Same order as GNOME: activate first, then drop the grab.
        Main.activateWindow(card.window, timestamp);
        this._close(card);
    }

    /** Close without switching: focus stays on the previous window. */
    cancel() {
        this._close(null);
    }

    _close(activatedCard) {
        if (this._closing)
            return;
        this._closing = true;

        // CRITICAL: give the keyboard back before any animation, so a slow
        // or interrupted animation can never leave the keyboard grabbed.
        this._popModal();
        this._removeTimeouts();
        this.reactive = false;

        if (!this._shown) {
            this.destroy();
            return;
        }

        const d = this._duration;
        for (const actor of [this._backdrop, this._labels, this._scrollTrack])
            actor.ease({opacity: 0, duration: d, mode: EASE_MODE});

        for (const card of this._cards) {
            card.setSelected(false, Math.min(d, 100));
            if (card !== activatedCard || !this._flyHome(card, d))
                card.ease({opacity: 0, duration: d, mode: EASE_MODE});
        }

        // One timer for the whole closing animation; the actor tree
        // (and every pending transition) goes away with destroy().
        this._closeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, d + 20, () => {
            this._closeTimeoutId = 0;
            this.destroy();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Animate the chosen card onto the real window, so the switch looks
     * continuous. Only when the window is really there to land on.
     */
    _flyHome(card, duration) {
        const win = card.window;
        const onThisWorkspace = win.is_on_all_workspaces() ||
            win.get_workspace() === global.workspace_manager.get_active_workspace();
        if (win.minimized || !onThisWorkspace || win.get_monitor() !== this._monitor.index)
            return false;

        const rect = win.get_frame_rect();
        const scale = rect.width / card.width;
        card.ease({
            x: rect.x - this._monitor.x + rect.width / 2 - card.width / 2,
            y: rect.y - this._monitor.y + rect.height - card.height,
            scale_x: scale,
            scale_y: scale,
            rotation_angle_y: 0,
            translation_z: 0,
            opacity: 255,
            duration,
            mode: EASE_MODE,
        });
        // The cards layer may still be mid intro-animation.
        this._cardsLayer.ease({opacity: 255, scale_x: 1, scale_y: 1, duration, mode: EASE_MODE});
        return true;
    }

    _popModal() {
        if (this._haveModal) {
            Main.popModal(this._grab);
            this._grab = null;
            this._haveModal = false;
        }
    }

    _removeTimeouts() {
        for (const id of ['_initialDelayId', '_noModsId', '_closeTimeoutId']) {
            if (this[id]) {
                GLib.source_remove(this[id]);
                this[id] = 0;
            }
        }
    }

    _onDestroy() {
        // Runs before the children are destroyed: the style can still take
        // a cached backdrop out of the scene so it survives (backdropCache.js).
        this._closing = true;
        this._popModal();
        this._removeTimeouts();
        this._iconWindow = null;
        this._style?.destroy();
        this._style = null;
        this._cards = [];
    }

    // Read-only state, used by the dev test harness.
    get selectedIndex() {
        return this._selectedIndex;
    }

    get cards() {
        return this._cards;
    }

    get isShown() {
        return this._shown;
    }
});

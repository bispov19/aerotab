// AeroTab — one window in the switcher: a live clone of the window, its
// floor reflection, a highlight frame and the close (X) button.
//
//   WindowCard (pivot at bottom-centre, so it scales and turns on the floor)
//   ├─ content     live Clutter.Clone of the window, cropped to its frame
//   ├─ frame       thin outline, only on the selected card
//   ├─ reflection  flipped second clone + fade shader (optional)
//   └─ closeButton only on the selected card

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {ReflectionFadeEffect} from './reflection.js';

const REFLECTION_GAP = 2;        // px between window and reflection
const REFLECTION_HEIGHT = 0.45;  // fraction of the window height mirrored
const CLOSE_BUTTON_SIZE = 30;

export const WindowCard = GObject.registerClass({
    Signals: {
        'clicked': {},
        'close-clicked': {},
    },
}, class WindowCard extends Clutter.Actor {
    /**
     * @param {Meta.Window} window
     * @param {object} params
     * @param {number} params.width - size of the card when selected (scale 1)
     * @param {number} params.height
     * @param {number} params.reflectionStrength - 0 turns the reflection off
     */
    _init(window, {width, height, reflectionStrength}) {
        super._init({
            width,
            height,
            // Scale and rotation happen around the bottom-centre point, so
            // every card keeps standing on the same "floor" line.
            pivot_point: new Graphene.Point({x: 0.5, y: 1}),
        });

        this.window = window;
        this._selected = false;

        this._content = this._createContent(width, height);
        this._content.reactive = true;
        this.add_child(this._content);

        const click = new Clutter.ClickGesture();
        click.connect('recognize', () => this.emit('clicked'));
        this._content.add_action(click);

        this._frame = new St.Widget({
            style_class: 'aerotab-card-frame',
            width,
            height,
            opacity: 0,
        });
        this.add_child(this._frame);

        if (reflectionStrength > 0)
            this._addReflection(width, height, reflectionStrength);

        this._closeButton = new St.Button({
            style_class: 'aerotab-close-button',
            child: new St.Icon({icon_name: 'window-close-symbolic'}),
            width: CLOSE_BUTTON_SIZE,
            height: CLOSE_BUTTON_SIZE,
            x: width - CLOSE_BUTTON_SIZE * 0.6,
            y: -CLOSE_BUTTON_SIZE * 0.4,
            opacity: 0,
            reactive: false,
            can_focus: false,
        });
        this._closeButton.connect('clicked', () => this.emit('close-clicked'));
        this.add_child(this._closeButton);
    }

    get closeButton() {
        return this._closeButton;
    }

    /**
     * A clone of the window actor cropped to the window frame, so the
     * client-side shadows/borders around it don't show.
     *
     * @param {number} width
     * @param {number} height
     * @returns {Clutter.Actor}
     */
    _createContent(width, height) {
        const box = new Clutter.Actor({width, height, clip_to_allocation: true});
        const windowActor = this.window.get_compositor_private();
        const frame = this.window.get_frame_rect();

        if (windowActor && frame.width > 0 && frame.height > 0) {
            const buffer = this.window.get_buffer_rect();
            const scale = width / frame.width;
            const [actorWidth, actorHeight] = windowActor.get_size();
            // Clutter.Clone keeps painting the source while it is hidden,
            // which is what makes minimized windows show up live too.
            box.add_child(new Clutter.Clone({
                source: windowActor,
                x: Math.round((buffer.x - frame.x) * scale),
                y: Math.round((buffer.y - frame.y) * scale),
                width: actorWidth * scale,
                height: actorHeight * scale,
            }));
        } else {
            // No actor yet (window still mapping): show the app icon.
            const app = Shell.WindowTracker.get_default().get_window_app(this.window);
            const icon = app
                ? app.create_icon_texture(Math.round(Math.min(width, height) / 2))
                : new St.Icon({icon_name: 'application-x-executable-symbolic', icon_size: 96});
            icon.x_align = Clutter.ActorAlign.CENTER;
            icon.y_align = Clutter.ActorAlign.CENTER;
            box.add_child(new St.Bin({
                style_class: 'aerotab-card-placeholder',
                width,
                height,
                child: icon,
            }));
        }
        return box;
    }

    _addReflection(width, height, strength) {
        const reflection = new Clutter.Actor({
            y: height + REFLECTION_GAP,
            width,
            height: Math.round(height * REFLECTION_HEIGHT),
            clip_to_allocation: true,
        });

        // Same picture, flipped around its own centre: the bottom of the
        // window ends up right under the window's bottom edge.
        const mirror = this._createContent(width, height);
        mirror.pivot_point = new Graphene.Point({x: 0.5, y: 0.5});
        mirror.scale_y = -1;
        reflection.add_child(mirror);
        reflection.add_effect(new ReflectionFadeEffect(strength));

        this.add_child(reflection);
        this.set_child_below_sibling(reflection, null);
    }

    /**
     * @param {boolean} selected
     * @param {number} duration - ms
     */
    setSelected(selected, duration) {
        if (this._selected === selected)
            return;
        this._selected = selected;

        const opacity = selected ? 255 : 0;
        for (const actor of [this._frame, this._closeButton]) {
            actor.ease({
                opacity,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        // Only the selected card's X can be clicked.
        this._closeButton.reactive = selected;
    }
});

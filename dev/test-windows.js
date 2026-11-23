// Opens N plain GTK windows for the AeroTab test harness.
// Usage: gjs -m test-windows.js <count> <tag>
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import System from 'system';

const [countArg, tag = 'T'] = System.programArgs;
const count = parseInt(countArg) || 1;
const COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
    '#16a085', '#2c3e50', '#f39c12', '#7f8c8d', '#e84393'];

const app = new Gtk.Application({flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const css = new Gtk.CssProvider();
    css.load_from_string(COLORS.map((c, i) => `.c${i} { background: ${c}; }`).join('\n') +
        '\n.big { font-size: 110px; font-weight: bold; color: white; }');
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),
        css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

    for (let i = 0; i < count; i++) {
        const win = new Gtk.ApplicationWindow({
            application: app,
            title: `${tag} Janela ${i + 1}`,
            default_width: 560 + (i % 3) * 180,
            default_height: 380 + (i % 4) * 90,
        });
        win.add_css_class(`c${i % COLORS.length}`);
        win.set_child(new Gtk.Label({label: `${i + 1}`, css_classes: ['big']}));
        win.present();
    }
});
app.run([]);

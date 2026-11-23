// Opens only the "Sobre" page of the AeroTab preferences, for screenshots
// in the test harness. Usage: gjs -m show-about.js <extension-dir>
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const [root] = System.programArgs;
const {criarPaginaSobre} = await import(`file://${root}/prefs/about.js`);
const [, bytes] = GLib.file_get_contents(`${root}/metadata.json`);
const metadata = JSON.parse(new TextDecoder().decode(bytes));

const app = new Adw.Application({flags: Gio.ApplicationFlags.NON_UNIQUE});
app.connect('activate', () => {
    const win = new Adw.PreferencesWindow({application: app, title: 'AeroTab — Sobre',
        default_width: 760, default_height: 900});
    win.add(criarPaginaSobre({path: root, metadata}));
    win.present();
});
app.run([]);

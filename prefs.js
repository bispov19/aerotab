// AeroTab — preferences window.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {criarPaginaSobre} from './prefs/about.js';
import {StylePreview} from './prefs/stylePreview.js';

const STYLES = [
    {id: 'dark', name: 'Escuro', caption: 'Fundo preto, como no Flip 3D clássico'},
    {id: 'desktop', name: 'Área de trabalho', caption: 'Seu papel de parede, desfocado e escurecido'},
];

const CSS = `
.aerotab-style-option { padding: 8px; border-radius: 14px; }
.aerotab-style-option:checked { box-shadow: inset 0 0 0 3px var(--accent-bg-color); }
.aerotab-preview { border-radius: 10px; }
`;

export default class AeroTabPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;   // keep it alive as long as the window
        window.set_default_size(760, 900);
        window.set_search_enabled(false);

        const provider = new Gtk.CssProvider();
        provider.load_from_string(CSS);
        Gtk.StyleContext.add_provider_for_display(window.get_display(), provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        // Lets pages use the extension's own icons (icons/aerotab-symbolic.svg).
        const iconTheme = Gtk.IconTheme.get_for_display(window.get_display());
        const iconsPath = `${this.path}/icons`;
        if (!iconTheme.get_search_path().includes(iconsPath))
            iconTheme.add_search_path(iconsPath);

        const page = new Adw.PreferencesPage({
            title: 'AeroTab',
            icon_name: 'aerotab-symbolic',
        });
        window.add(page);

        page.add(this._switcherGroup(settings));
        const previews = [];
        page.add(this._styleGroup(settings, previews));
        page.add(this._appearanceGroup(settings));
        page.add(this._windowsGroup(settings));
        page.add(this._resetGroup(settings));
        window.add(criarPaginaSobre(this));

        // Previews follow tilt / reflection / light mode live.
        const changedId = settings.connect('changed', (_s, key) => {
            for (const p of previews)
                p.queue_draw();
            if (key === 'style')
                this._onStyleChanged?.();
        });
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            Gtk.StyleContext.remove_provider_for_display(window.get_display(), provider);
            return false;
        });
    }

    _switcherGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Alternador de janelas'});
        const row = new Adw.SwitchRow({
            title: 'Usar o Alt+Tab da AeroTab',
            subtitle: 'Desligado, o Alt+Tab volta a ser o padrão do GNOME',
        });
        settings.bind('enable-switcher', row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return group;
    }

    /**
     * Two clickable previews. Clicking one only *selects* it; the style
     * changes when the user presses "Aplicar estilo".
     */
    _styleGroup(settings, previews) {
        const group = new Adw.PreferencesGroup({
            title: 'Estilo',
            description: 'Escolha um estilo pela prévia e confirme em “Aplicar estilo”.',
        });

        const box = new Gtk.Box({spacing: 12, homogeneous: true, margin_bottom: 12});
        const buttons = new Map();
        let pending = settings.get_string('style');

        const status = new Gtk.Label({xalign: 0, hexpand: true, css_classes: ['dim-label']});
        const apply = new Gtk.Button({
            label: 'Aplicar estilo',
            css_classes: ['suggested-action', 'pill'],
        });

        const sync = () => {
            const current = settings.get_string('style');
            const currentName = STYLES.find(s => s.id === current)?.name ?? current;
            apply.sensitive = pending !== current;
            status.label = pending === current
                ? `Estilo em uso: ${currentName}`
                : `Em uso: ${currentName} — selecionado: ${STYLES.find(s => s.id === pending).name}`;
            for (const [id, button] of buttons)
                button.active = id === pending;
        };

        let firstButton = null;
        for (const style of STYLES) {
            const preview = new StylePreview(style.id, settings);
            previews.push(preview);

            const content = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6});
            content.append(preview);
            content.append(new Gtk.Label({label: style.name, css_classes: ['heading'], xalign: 0}));
            content.append(new Gtk.Label({
                label: style.caption,
                css_classes: ['caption', 'dim-label'],
                xalign: 0,
                wrap: true,
            }));

            const button = new Gtk.ToggleButton({
                child: content,
                css_classes: ['flat', 'aerotab-style-option'],
                group: firstButton,
            });
            firstButton ??= button;
            button.connect('toggled', () => {
                if (button.active && pending !== style.id) {
                    pending = style.id;
                    sync();
                }
            });
            buttons.set(style.id, button);
            box.append(button);
        }

        apply.connect('clicked', () => {
            settings.set_string('style', pending);
            sync();
        });
        // Called from the window's 'changed' handler (disconnected on close).
        this._onStyleChanged = () => {
            pending = settings.get_string('style');
            sync();
        };

        const footer = new Gtk.Box({spacing: 12});
        footer.append(status);
        footer.append(apply);

        const wrapper = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
        wrapper.append(box);
        wrapper.append(footer);
        group.add(wrapper);

        sync();
        return group;
    }

    _appearanceGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Aparência e animação'});

        const duration = Adw.SpinRow.new_with_range(0, 1000, 10);
        duration.set({
            title: 'Duração da animação (ms)',
            subtitle: 'Menor = mais rápido. 0 desliga as animações',
        });
        settings.bind('animation-duration', duration, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(duration);

        const reflection = new Adw.SwitchRow({
            title: 'Reflexo no chão',
            subtitle: 'Espelho das janelas sob elas, desvanecendo',
        });
        settings.bind('show-reflection', reflection, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(reflection);

        const tilt = Adw.SpinRow.new_with_range(0, 75, 1);
        tilt.set({
            title: 'Inclinação das janelas laterais (graus)',
            subtitle: '0 deixa as janelas de frente',
        });
        settings.bind('tilt-angle', tilt, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(tilt);

        const side = Adw.SpinRow.new_with_range(1, 8, 1);
        side.set({
            title: 'Janelas visíveis de cada lado',
            subtitle: 'As demais ficam agrupadas atrás, mais transparentes',
        });
        settings.bind('side-windows', side, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(side);

        const light = new Adw.SwitchRow({
            title: 'Modo leve',
            subtitle: 'Para GPU integrada: sem reflexo, sem desfoque do papel de parede e com perspectiva simplificada',
        });
        settings.bind('light-mode', light, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(light);

        // These two have no effect in light mode.
        for (const row of [reflection, tilt]) {
            settings.bind('light-mode', row, 'sensitive',
                Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN);
        }
        return group;
    }

    _windowsGroup(settings) {
        const group = new Adw.PreferencesGroup({title: 'Janelas'});

        const workspaces = new Adw.SwitchRow({
            title: 'Mostrar janelas de todos os espaços de trabalho',
            subtitle: 'Desligado, mostra só as do espaço de trabalho atual',
        });
        settings.bind('all-workspaces', workspaces, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(workspaces);

        const monitor = new Adw.SwitchRow({
            title: 'Só janelas do monitor atual',
            subtitle: 'O alternador abre no monitor da janela ativa (ou do ponteiro)',
        });
        settings.bind('current-monitor-only', monitor, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(monitor);
        return group;
    }

    _resetGroup(settings) {
        const group = new Adw.PreferencesGroup();
        const button = new Gtk.Button({
            label: 'Restaurar padrões',
            halign: Gtk.Align.CENTER,
            css_classes: ['pill'],
        });
        button.connect('clicked', () => {
            for (const key of settings.settings_schema.list_keys())
                settings.reset(key);
        });
        group.add(button);
        return group;
    }
}

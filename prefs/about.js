import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

const NOME = 'AeroTab';
const DESCRICAO = 'Um alternador de janelas 3D elegante e fluido para o GNOME Shell, inspirado no Flip 3D e no iTab.';
const LICENCA = 'GPL-3.0-or-later';
const VERSAO_PADRAO = '1.0.0';
const REPO_URL = 'https://github.com/bispov19/aerotab';
const REPO_TEXTO = 'github.com/bispov19/aerotab';
const AUTOR = 'ViniB19';
const AUTOR_PAPEL = 'Web Developer · Autor e mantenedor';
const RECURSOS = [
    'Alt+Tab 3D no estilo Flip 3D',
    'Dois estilos: Escuro e Área de trabalho',
    'Reflexo no chão',
    'Miniaturas ao vivo das janelas',
    'Animações suaves',
    'Modo leve para GPU integrada',
    'Janelas de todos os espaços ou só do atual',
    'Suporte a vários monitores',
].join(' · ');
const AVISO = 'AeroTab é um projeto independente e de código aberto.';

const CSS = `
.aerotab-banner {
    background-color: @card_bg_color;
    border: 1px solid #2ed8c3;
    border-radius: 18px;
    padding: 32px 24px;
    box-shadow: 0 0 18px alpha(#2ed8c3, 0.25);
}
.aerotab-banner-desc { opacity: 0.7; }
.aerotab-banner-meta { opacity: 0.55; font-size: smaller; }
`;

let cssCarregado = false;

function carregarCss() {
    if (cssCarregado)
        return;
    const display = Gdk.Display.get_default();
    if (!display)
        return;
    const provider = new Gtk.CssProvider();
    if (provider.load_from_string)
        provider.load_from_string(CSS);
    else
        provider.load_from_data(CSS, -1);
    Gtk.StyleContext.add_provider_for_display(
        display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    cssCarregado = true;
}

function criarBanner(extension) {
    const banner = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        hexpand: true,
        halign: Gtk.Align.FILL,
    });
    banner.add_css_class('aerotab-banner');

    const caminhoLogo = GLib.build_filenamev([extension.path, 'icons', 'aerotab-logo.svg']);
    const logo = Gtk.Picture.new_for_filename(caminhoLogo);
    logo.set_size_request(128, 128);
    logo.set_halign(Gtk.Align.CENTER);
    logo.set_content_fit(Gtk.ContentFit.CONTAIN);
    banner.append(logo);

    const titulo = new Gtk.Label({label: NOME, halign: Gtk.Align.CENTER});
    titulo.add_css_class('title-1');
    banner.append(titulo);

    const descricao = new Gtk.Label({
        label: DESCRICAO,
        halign: Gtk.Align.CENTER,
        justify: Gtk.Justification.CENTER,
        wrap: true,
        max_width_chars: 60,
    });
    descricao.add_css_class('aerotab-banner-desc');
    banner.append(descricao);

    const versao = extension.metadata?.['version-name'] ?? VERSAO_PADRAO;
    const meta = new Gtk.Label({
        label: `Versão ${versao}  •  ${LICENCA}`,
        halign: Gtk.Align.CENTER,
    });
    meta.add_css_class('aerotab-banner-meta');
    banner.append(meta);

    return banner;
}

function criarLinha(titulo, subtitulo, icone) {
    const linha = new Adw.ActionRow({
        title: titulo,
        subtitle: subtitulo,
        subtitle_lines: 0,
    });
    linha.add_prefix(new Gtk.Image({icon_name: icone}));
    return linha;
}

/**
 * Cria a página "Sobre" da AeroTab.
 * Uso no prefs.js: window.add(criarPaginaSobre(this));
 *
 * @param {Extension} extension instância de ExtensionPreferences (this)
 * @returns {Adw.PreferencesPage}
 */
export function criarPaginaSobre(extension) {
    carregarCss();

    const pagina = new Adw.PreferencesPage({
        name: 'sobre',
        title: 'Sobre',
        icon_name: 'help-about-symbolic',
    });

    const grupoBanner = new Adw.PreferencesGroup();
    grupoBanner.add(criarBanner(extension));
    pagina.add(grupoBanner);

    const grupoLinks = new Adw.PreferencesGroup({title: 'Links'});
    const repo = criarLinha('Repositório no GitHub', REPO_TEXTO, 'web-browser-symbolic');
    repo.set_activatable(true);
    repo.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
    repo.connect('activated', () => {
        Gio.AppInfo.launch_default_for_uri(REPO_URL, null);
    });
    grupoLinks.add(repo);
    pagina.add(grupoLinks);

    const grupoCreditos = new Adw.PreferencesGroup({title: 'Créditos'});
    grupoCreditos.add(criarLinha(AUTOR, AUTOR_PAPEL, 'avatar-default-symbolic'));
    grupoCreditos.add(criarLinha('Recursos', RECURSOS, 'starred-symbolic'));
    grupoCreditos.add(criarLinha('Aviso', AVISO, 'dialog-information-symbolic'));
    pagina.add(grupoCreditos);

    return pagina;
}

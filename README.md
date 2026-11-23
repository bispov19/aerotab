<p align="center"><img src="icons/aerotab-logo.svg" width="128" alt="AeroTab"></p>

# AeroTab

Alt+Tab 3D no estilo "Flip" para o GNOME Shell 51. A janela selecionada fica
no centro, de frente; as outras se alinham dos dois lados, inclinadas como as
paredes de um corredor, com reflexo no chão.

- **Escuro**: fundo preto.
- **Área de trabalho**: papel de parede desfocado e escurecido.

## Atalhos

| Ação | Tecla / mouse |
|---|---|
| Avançar / voltar | Alt+Tab / Alt+Shift+Tab, setas ←/→, roda do mouse |
| Trocar para a janela | soltar o Alt, Enter, ou clicar na janela |
| Cancelar | Esc ou clicar fora das janelas |
| Fechar a janela selecionada | botão X, ou Delete |
| Primeira / última | Home / End |

## Instalar

```sh
./install.sh                       # empacota e instala em ~/.local/share/gnome-shell/extensions
# Wayland: saia da sessão e entre de novo (uma vez só, para o Shell achar a extensão nova)
gnome-extensions enable aerotab@bispov19
gnome-extensions prefs aerotab@bispov19
```

Para desenvolver sem reinstalar a cada mudança, troque o passo de instalação
por um link para esta pasta:

```sh
glib-compile-schemas schemas/
ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/aerotab@bispov19
```

No Wayland não dá para recarregar o Shell (Alt+F2 → `r` só funciona no X11),
então as mudanças no código só valem depois de sair e entrar na sessão. Para
testar sem sair, rode um Shell aninhado numa janela:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

## Testes

`dev/run-tests.sh` sobe um GNOME Shell headless isolado (dconf, extensões,
D-Bus e socket Wayland próprios, nada toca a sua sessão), abre janelas GTK de
verdade e usa teclado/mouse virtuais para testar o Alt+Tab.

```sh
dev/run-tests.sh /tmp/aerotab-out          # 1, 2, 5 (2 delas X11) e 15 janelas
MULTI=1 dev/run-tests.sh /tmp/aerotab-out  # dois monitores
PREFS=1 dev/run-tests.sh /tmp/aerotab-out  # capturas da janela de preferências
```

Os resultados ficam em `results.json`, junto com as capturas `*.png` e o `shell.log`.

## Estrutura

```
extension.js            enable/disable, abre o alternador
lib/keybindings.js      assume e devolve os atalhos switch-applications/switch-windows
lib/windows.js          lista de janelas (ordem MRU), monitor de destino
lib/switcher.js         alternador base: grab modal, teclado, layout 3D, animações
lib/card.js             uma janela: clone ao vivo, reflexo, moldura, botão X
lib/reflection.js       shader que faz o reflexo desvanecer
lib/styles/dark.js      estilo Escuro
lib/styles/desktop.js   estilo Área de trabalho (papel de parede + desfoque)
prefs.js                janela de preferências
prefs/stylePreview.js   prévia desenhada de cada estilo
prefs/about.js          página "Sobre" (autor, links, créditos)
icons/                  logo e ícone simbólico
schemas/                configurações (GSettings)
dev/                    harness de testes (fica fora do zip)
```

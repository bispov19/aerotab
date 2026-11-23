<p align="center"><img src="icons/aerotab-logo.svg" width="128" alt="AeroTab"></p>

# AeroTab

Alt+Tab 3D para o GNOME Shell 51, em quatro estilos (escolha em
Configurações → Estilo):

- **Escuro**: corredor estilo Flip 3D. A janela selecionada fica no centro, de
  frente; as outras se alinham dos dois lados, inclinadas, com reflexo no chão,
  sobre fundo preto.
- **Área de trabalho**: o mesmo corredor sobre o papel de parede desfocado e
  escurecido.
- **Pilha 3D**: janelas empilhadas em profundidade. A ativa fica à frente, à
  direita; as outras recuam para o canto superior esquerdo, menores e mais
  escuras. Avançar manda a da frente para o fundo da pilha.
- **Carrossel 3D**: fileira curva como o Cover Flow. A ativa fica no centro,
  com o ícone do app e o título embaixo; as vizinhas ficam quase de lado.

Janelas minimizadas aparecem com o ícone do app: o GNOME 51 não mantém uma
imagem pintável de janela minimizada.

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
gjs -m dev/test-layouts.js                 # layouts: 1 a 30 janelas, sem Shell
dev/run-tests.sh /tmp/aerotab-out          # 1, 2, 5 (2 X11) 15 e 22 janelas, 4 estilos
MULTI=1 dev/run-tests.sh /tmp/aerotab-out  # dois monitores, 4 estilos
PREFS=1 dev/run-tests.sh /tmp/aerotab-out  # capturas da janela de preferências
```

Os resultados ficam em `results.json`, junto com as capturas `*.png` e o `shell.log`.

## Estrutura

```
extension.js            enable/disable, abre o alternador
lib/keybindings.js      assume e devolve os atalhos switch-applications/switch-windows
lib/windows.js          lista de janelas (ordem MRU), monitor de destino
lib/switcher.js         alternador base (todos os estilos): grab modal, teclado,
                        mouse, foco, fechar, animações
lib/layouts/            onde cada cartão vai em 3D, matemática pura (também
                        usada nas prévias): flip.js, stack.js, carousel.js
lib/card.js             uma janela: clone ao vivo, sombra, reflexo, moldura, botão X
lib/reflection.js       shader que faz o reflexo desvanecer
lib/backdropCache.js    guarda o fundo desfocado entre uma abertura e outra
lib/styles/index.js     os 4 estilos = fundo + layout
lib/styles/dark.js      fundo preto
lib/styles/desktop.js   papel de parede desfocado e escurecido
prefs.js                janela de preferências
prefs/stylePreview.js   prévia desenhada de cada estilo
prefs/about.js          página "Sobre" (autor, links, créditos)
icons/                  logo e ícone simbólico
schemas/                configurações (GSettings)
dev/                    harness de testes (fica fora do zip)
```

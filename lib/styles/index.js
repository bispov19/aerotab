// AeroTab — the four styles. A style = a backdrop + a layout
// (lib/layouts/). Everything else (cards, navigation, closing, focus) is
// shared by all of them in lib/switcher.js.

import {getLayoutForStyle} from '../layouts/index.js';
import {DarkStyle} from './dark.js';
import {DesktopStyle} from './desktop.js';

// Wallpaper backdrop settings per style.
const WALLPAPER = {
    // Original "Área de trabalho": light blur, clearly darker.
    desktop: {blurRadius: 40, brightness: 0.62, reflectionStrength: 0.42},
    // Pilha / Carrossel: strong blur, slight darkening.
    stack: {blurRadius: 70, brightness: 0.74, reflectionStrength: 0.42},
    carousel: {blurRadius: 70, brightness: 0.74, reflectionStrength: 0.42},
};

export const STYLE_IDS = ['dark', 'desktop', 'stack', 'carousel'];

/**
 * @param {string} name - one of STYLE_IDS
 * @param {object} params
 * @param {boolean} params.lightMode
 * @param {BackdropCache} [params.cache]
 * @returns {{style: object, layout: object}}
 */
export function createStyle(name, {lightMode, cache}) {
    if (!STYLE_IDS.includes(name))
        name = 'dark';
    const layout = getLayoutForStyle(name);
    const style = name === 'dark'
        ? new DarkStyle()
        : new DesktopStyle({name, lightMode, cache, ...WALLPAPER[name]});
    return {style, layout};
}

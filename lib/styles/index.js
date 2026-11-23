// AeroTab — picks the style object from the "style" setting.

import {DarkStyle} from './dark.js';
import {DesktopStyle} from './desktop.js';

/**
 * @param {string} name - 'dark' | 'desktop'
 * @param {object} params
 * @param {boolean} params.lightMode
 */
export function createStyle(name, {lightMode}) {
    if (name === 'desktop')
        return new DesktopStyle({lightMode});
    return new DarkStyle();
}

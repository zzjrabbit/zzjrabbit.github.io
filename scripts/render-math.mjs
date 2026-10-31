/**
 * Typeset MathML into static CommonHTML at build time.
 *
 * The notes arrive from Typst as native MathML.  Running MathJax in the browser
 * to replace that markup made every note download the full MathJax component,
 * wait for it to start, then visibly reflow from MathML to CHTML.  Static CHTML
 * removes all three costs: the first paint already contains the final formula,
 * no typesetting JavaScript is shipped, and there is nothing to hydrate.
 *
 * MathJax chooses line breaks from the width available when it typesets.  A
 * static page cannot know that width in advance, so each formula is rendered at
 * several break widths and the duplicate variants are hidden with container
 * queries.  Short formulas produce identical output at every width and are only
 * emitted once.
 */
import { load } from 'cheerio';
import MathJax from 'mathjax';
import path from 'node:path';

/** Break widths in CSS pixels; see the matching container queries in notes.css. */
export const MATH_VARIANTS = [
  // Readers who enlarge text make the article narrow relative to its font.
  // This size keeps a precomputed line no wider than the text column in that
  // case. It is selected by an em-based container query in notes.css.
  { name: 'compact', inline: 88, display: 72 },
  // Display equations can lose a gap and their number from the body width, so
  // their variants are deliberately smaller than the article column. Inline
  // formulas use the full column and break naturally in the browser.
  { name: 'narrow', inline: 240, display: 184 },
  { name: 'medium', inline: 480, display: 400 },
  { name: 'wide', inline: 736, display: 640 },
];

// Typst lists and block quotes have their own indentation on top of the article
// padding. At phone width a nested list leaves about 170px, so formulas there
// need a still narrower break width than ordinary inline math. Enlarged text
// leaves even less room and uses the compact list width.
const LIST_WIDTHS = { compact: 56, narrow: 128 };

// Keep these in step with the CHTML font-size rules in src/styles/notes.css.
// MathJax chooses breaks in ems; if the server assumes 16px while the browser
// draws at 20.7px, every line becomes correspondingly wider and overflows.
const MATH_EM = { inline: 16 * 1.125 * 1.15, display: 16 * 1.4375 * 1.0625 };

let rendererPromise;

/**
 * Initialise MathJax once per build process.  Only the MathML input and CHTML
 * output components are needed; speech and accessibility workers are not part
 * of static output.
 */
export async function createMathRenderer({ cwd = process.cwd() } = {}) {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const root = path.resolve(cwd);
      const mathjax = path.join(root, 'node_modules/mathjax');
      const font = path.join(root, 'node_modules/@mathjax/mathjax-stix2-font');
      const instance = await MathJax.init({
        loader: {
          load: ['input/mml', 'output/chtml'],
          paths: { mathjax, 'mathjax-stix2': font },
        },
        output: {
          font: 'mathjax-stix2',
          displayOverflow: 'linebreak',
          linebreaks: { inline: true, width: '100%' },
        },
        startup: { typeset: false },
      });
      return { instance, root, font };
    })();
  }
  return rendererPromise;
}

async function serialiseMathJax(renderer, mathml, width, display, overflow = 'linebreak') {
  const { instance } = renderer;
  const em = display ? MATH_EM.display : MATH_EM.inline;
  // MathJax only precomputes line breaks for display math.  Render an inline
  // copy as display math to obtain a line stack, then turn that stack into a
  // breakable inline structure (the generated CSS understands this form).
  let source = display ? mathml : mathml.replace(/^<math\b(?![^>]*\bdisplay=)/, '<math display="block"');
  if (overflow !== 'linebreak') {
    source = source.replace(/^<math\b(?![^>]*\boverflow=)/, `<math overflow="${overflow}"`);
  }
  const node = await instance.mathml2chtmlPromise(source, {
    em,
    ex: em / 2,
    containerWidth: width,
  });
  let output = instance.startup.adaptor
    .outerHTML(node)
    .replace('<mjx-container class="MathJax"', '<mjx-container class="MathJax not-content"');
  if (!display) {
    output = output
      .replace(/ jax="CHTML" overflow="(?:linebreak|scale)" display="true"/, ` jax="CHTML" overflow="${overflow}"`)
      .replace(/<mjx-math([^>]*) display="true"/, '<mjx-math$1')
      .replaceAll('<mjx-linestack>', '<mjx-linestack breakable="true">');
  }
  return output;
}

/**
 * Replace every <math> in an HTML fragment with static CHTML variants.
 * Returns the count of source formulas so the bridge and checks can verify that
 * none were dropped.
 */
export async function renderMathHtml(html, renderer) {
  renderer ||= await createMathRenderer();
  const $ = load(`<div id="math-render-root">${html}</div>`);
  const root = $('#math-render-root');
  const math = root.find('math').toArray();
  for (const element of math) {
    const mathml = $.html(element);
    const display = $(element).attr('display') === 'block';
    const inList = $(element).parents('li, blockquote').length > 0;
    const outputs = new Map();
    for (const variant of MATH_VARIANTS) {
      const width = display ? variant.display
        : (inList && LIST_WIDTHS[variant.name] ? LIST_WIDTHS[variant.name] : variant.inline);
      // In the tightest tier a formula may contain no further valid breakpoint
      // (a sum followed by its argument, or a matrix, for example).  Scale that
      // variant to the target width so enlarged text cannot push it out of the
      // column; shorter formulas are unchanged because MathJax only shrinks
      // overflowing math.
      const overflow = variant.name === 'compact' ? 'scale' : 'linebreak';
      const output = await serialiseMathJax(renderer, mathml, width, display, overflow);
      if (!outputs.has(output)) outputs.set(output, []);
      outputs.get(output).push(variant.name);
    }
    const variants = [...outputs.entries()].map(([output, names]) =>
      `<span class="math-variant ${names.map(name => `is-${name}`).join(' ')}">${output}</span>`);
    $(element).replaceWith(`<span class="math-rendered" data-display="${display}">${variants.join('')}</span>`);
  }
  return { html: root.html(), count: math.length };
}

/**
 * MathJax's CHTML stylesheet, with its build-machine font paths rewritten to
 * the public directory.  It is emitted as a normal cacheable stylesheet rather
 * than repeated inline in every note.
 */
export async function mathStylesheet(renderer) {
  renderer ||= await createMathRenderer();
  const { instance, font } = renderer;
  const css = instance.startup.adaptor.outerHTML(instance.chtmlStylesheet());
  const localFonts = path.join(font, 'chtml/woff2');
  return css
    .replace(/^<style[^>]*>/, '')
    .replace(/<\/style>\s*$/, '')
    .replaceAll(localFonts, '/mathjax/mathjax-stix2-font/chtml/woff2');
}

/** Font files are the only MathJax runtime assets static CHTML still needs. */
export function mathFontDirectory(renderer) {
  return path.join(renderer.font, 'chtml/woff2');
}

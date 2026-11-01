/**
 * Typeset MathML into static CommonHTML at build time.
 *
 * The notes arrive from Typst as native MathML.  Running MathJax in the browser
 * to replace that markup made every note download the full MathJax component,
 * wait for it to start, then visibly reflow from MathML to CHTML.  Static CHTML
 * removes all three costs: the first paint already contains the final formula,
 * no typesetting JavaScript is shipped, and there is nothing to hydrate.
 *
 * Display formulas still need fixed break widths, because MathJax precomputes
 * their line stacks during the build and a static page cannot know the reader's
 * column width.  Inline formulas do not: MathJax 4 emits `mjx-break` markers and
 * lets the browser wrap the formula inside the surrounding paragraph.  That is
 * what keeps justified prose from stretching the spaces around an indivisible
 * formula.  Only inline formulas with no browser breakpoint fall back to the
 * width-specific line stacks.
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

// A break inside a fraction, root, script, matrix or accent would tear one
// mathematical object apart. Grouping rows elsewhere are only there to express
// Typst's source structure, so flattening them exposes the operators inside
// parentheses to MathJax's line breaker without touching those atomic shapes.
const INLINE_ATOMIC = 'mfrac, msqrt, mroot, mtable, mtr, mtd, msub, msup, msubsup, munder, mover, munderover, mmultiscripts, menclose';

/**
 * Flatten grouping `mrow`s so MathJax's inline line breaker can see operators
 * nested inside parentheses.  Typst wraps long expressions in these rows,
 * which would otherwise leave only a few coarse break points and let browser
 * justification stretch the surrounding word spaces.
 */
function flattenInlineRows(mathml) {
  const $ = load(`<div id="inline-math-root">${mathml}</div>`);
  const root = $('#inline-math-root');
  const math = root.find('math').first();
  if (!math.length) return mathml;
  // Deepest first keeps the references stable while parent rows are replaced.
  for (const child of [...math.find('mrow').toArray()].reverse()) {
    const row = $(child);
    if (row.closest(INLINE_ATOMIC).length) continue;
    row.replaceWith(row.contents());
  }
  return root.html();
}

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

/**
 * Render one width-specific fallback.  Display formulas need this because their
 * line breaks are chosen during the build; an inline formula that contains no
 * browser breakpoint needs it for the same reason.
 */
async function serialiseMathJax(renderer, mathml, width, display, overflow = 'linebreak') {
  const { instance } = renderer;
  const em = display ? MATH_EM.display : MATH_EM.inline;
  // Precompute a line stack for the fallback inline case.
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
 * Render an inline formula once with MathJax's native browser line breaking.
 * MathJax inserts `mjx-break` elements at legal operators; the browser then
 * wraps the formula as part of the justified paragraph at any width.
 */
async function serialiseInlineMath(renderer, mathml) {
  const { instance } = renderer;
  const em = MATH_EM.inline;
  const node = await instance.mathml2chtmlPromise(flattenInlineRows(mathml), {
    em,
    ex: em / 2,
    containerWidth: MATH_VARIANTS.at(-1).inline,
  });
  const output = instance.startup.adaptor
    .outerHTML(node)
    .replace('<mjx-container class="MathJax"', '<mjx-container class="MathJax not-content"');
  // MathJax marks browser break opportunities with a real space inside
  // mjx-break. Justified text treats that space as stretchable, so a formula
  // landing near the end of a line opens a conspicuous gap. A zero-width space
  // keeps the same break opportunity without giving justification anything to
  // stretch.
  return output.replace(/<mjx-break([^>]*)>\s*<\/mjx-break>/g,
    '<mjx-break$1>&#8203;</mjx-break>');
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
    if (!display) {
      const inline = await serialiseInlineMath(renderer, mathml);
      if (inline.includes('<mjx-break')) {
        $(element).replaceWith(`<span class="math-rendered" data-display="false" data-layout="inline-breakable">${inline}</span>`);
        continue;
      }
    }
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
    const layout = display ? 'display' : 'inline-fallback';
    $(element).replaceWith(`<span class="math-rendered" data-display="${display}" data-layout="${layout}">${variants.join('')}</span>`);
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

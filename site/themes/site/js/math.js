/* Preserve native MathML. Overflow belongs to an HTML box, never the math
   layout tree. No equations, labels, or mathematical text are rewritten.
   The wrapper is a scroll container only while .is-overflowing says so (see
   .math-scroll in src/styles/notes.css): an equation that fits keeps no
   overflow of its own, so it cannot paint a scrollbar. */
(() => {
  const main = document.querySelector('.calepin-website-main');
  if (!main) return;
  /* A formula wider than its column is scaled down until it fits, so an equation
     is always shown whole: the wrapper only sets --math-fit on the root font
     size, and the math tree itself is never rewritten. On a wide screen the fit
     has no limit — the column is generous and the formula simply comes down to
     it. On a phone the column is too narrow for that: an unrestricted fit turned
     sling's display equations into 7px type there, so narrow screens stop at
     MIN_FIT.narrow and let the few formulas that need more scroll instead. */
  const NARROW = '(max-width: 40rem)';
  const MIN_FIT = { wide: 0.05, narrow: 0.66 };
  const narrow = matchMedia(NARROW);
  const boxes = new Set();
  const resize = new ResizeObserver(entries => entries.forEach(({ target }) => update(target)));
  function update(box) {
    const math = box.querySelector('math');
    if (math) fit(box, math);
    // Only a box that overflows by more than a rounding pixel is marked, and
    // only a marked box scrolls. A formula the fit brought inside the column
    // therefore carries no scrollbar on any platform, however its font rounds.
    const overflow = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle('is-overflowing', overflow);
    if (overflow) {
      box.tabIndex = 0;
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Mathematical formula, scroll horizontally');
    } else {
      box.removeAttribute('tabindex');
      box.removeAttribute('role');
      box.removeAttribute('aria-label');
    }
  }
  // Hand the wrapper the ratio that brings the formula inside the column, and
  // correct it against what is really rendered: MathML rounds each glyph advance
  // at its own size, and its ink (stretchy operators, italic corrections) can
  // spill past the formula's own box while still counting towards the wrapper's
  // scrollable overflow — so a proportional estimate that only reads the
  // formula's box can land short of the column and leave the scrollbar behind.
  // Measuring starts from the formula's own size on every pass, so the fit never
  // drifts smaller than the width the reader actually has. A pass stops only at
  // genuine equality: one pixel of slack was where a formula the reader saw as
  // fitting kept a scrollbar on platforms that round the math font differently.
  function fit(box, math) {
    const floor = narrow.matches ? MIN_FIT.narrow : MIN_FIT.wide;
    let ratio = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      box.style.setProperty('--math-fit', String(+ratio.toFixed(3)));
      const over = box.scrollWidth - box.clientWidth;
      if (over <= 0) return;
      const room = availableWidth(math);
      const width = math.getBoundingClientRect().width;
      if (!room || !width || ratio <= floor) return;
      // Shrink by the larger of the two shortfalls: the formula's layout width,
      // and the overflow the wrapper reports. The extra 0.5% leaves the result a
      // hair inside the column, where a sub-pixel difference between browser
      // builds cannot put a scrollbar back (CI's Chromium and this one round
      // these glyphs differently).
      const factor = Math.min(room / width, room / (room + over)) * 0.995;
      if (!(factor < 1)) return;
      ratio = Math.max(floor, ratio * factor);
    }
  }
  function wrap(math, inline = false) {
    // Adopt an existing wrapper too, so reruns remain idempotent and retain
    // keyboard focus and overflow announcements.
    const existing = math.parentElement?.classList.contains('math-scroll') ? math.parentElement : null;
    let box = existing;
    if (!box) {
      box = document.createElement(inline ? 'span' : 'div');
      box.className = inline ? 'math-scroll math-scroll-inline' : 'math-scroll';
      math.before(box);
      box.append(math);
    }
    boxes.add(box);
    resize.observe(box);
    update(box);
  }
  main.querySelectorAll('math[display="block"]').forEach(math => wrap(math));
  // Compare against the local text column: lists and theorem boxes can be
  // narrower than the article. Keep small expressions on their native baseline.
  function availableWidth(math) {
    let container = math.parentElement;
    while (container && container !== main && getComputedStyle(container).display === 'inline') {
      container = container.parentElement;
    }
    const style = getComputedStyle(container || main);
    return (container || main).clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }
  function checkInline() {
    main.querySelectorAll('math:not([display="block"])').forEach(math => {
      if (math.getBoundingClientRect().width > availableWidth(math)) wrap(math, true);
    });
    boxes.forEach(update);
  }
  new ResizeObserver(checkInline).observe(main);
  // Crossing the breakpoint changes the floor, not the layout the resize above
  // already watched, so re-fit the wrappers on the query itself.
  narrow.addEventListener('change', () => boxes.forEach(update));
  document.fonts.ready.then(checkInline);
})();

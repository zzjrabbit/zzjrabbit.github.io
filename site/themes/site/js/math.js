/* Preserve native MathML. Overflow belongs to an HTML box, never the math
   layout tree. No equations, labels, or mathematical text are rewritten. */
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
  // at its own size, so one proportional estimate can land a few pixels short of
  // the column and leave a scrollbar behind. Measuring starts from the formula's
  // own size on every pass, so the fit never drifts smaller than the width the
  // reader actually has.
  function fit(box, math) {
    const floor = narrow.matches ? MIN_FIT.narrow : MIN_FIT.wide;
    let ratio = 1;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      box.style.setProperty('--math-fit', String(+ratio.toFixed(3)));
      if (box.scrollWidth <= box.clientWidth + 1) return;
      const available = availableWidth(math);
      const width = math.getBoundingClientRect().width;
      if (!available || !width || available >= width || ratio <= floor) return;
      ratio = Math.max(floor, ratio * (available / width));
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

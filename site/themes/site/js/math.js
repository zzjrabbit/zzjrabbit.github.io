/* Preserve native MathML. Overflow belongs to an HTML box, never the math
   layout tree. No equations, labels, or mathematical text are rewritten. */
(() => {
  const main = document.querySelector('.calepin-website-main');
  if (!main) return;
  const boxes = new Set();
  function update(box) {
    const overflow = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle('is-overflowing', overflow);
    if (overflow) {
      box.tabIndex = 0;
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', '数学公式，可左右滚动');
    } else {
      box.removeAttribute('tabindex');
      box.removeAttribute('role');
      box.removeAttribute('aria-label');
    }
  }
  const resize = new ResizeObserver(entries => entries.forEach(({target}) => update(target)));
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
  document.fonts.ready.then(checkInline);
})();

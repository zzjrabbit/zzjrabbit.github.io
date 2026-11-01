/**
 * Break note prose and inline mathematics as one paragraph, then justify the
 * chosen lines.  The browser's greedy breaker tends to strand the clause before
 * a long formula and hand the remaining width to one or two word spaces.  This
 * small progressive enhancement minimises the total badness instead, using
 * MathJax's existing `mjx-break` points as additional break opportunities.
 *
 * The static HTML remains complete without JavaScript: on a failed validation,
 * a resize, or before printing, the original children are restored.
 */
(() => {
  "use strict";

  const article = document.querySelector(".typst-article");
  const canvas = document.createElement("canvas").getContext("2d");
  if (!article || !canvas) return;

  const originals = new WeakMap();
  const formulas = new WeakMap();
  // Keep a stable identity on source wrappers. When a formula is split across
  // lines each cloned fragment inherits it, so tests can still count one source
  // formula rather than one fragment per line.
  [...article.querySelectorAll(".math-rendered")].forEach((wrapper, index) => {
    wrapper.dataset.kpSource = String(index);
  });
  const zeroWidthSpace = /\u200B/g;
  const safety = 22;
  const minWidth = 220;
  const allowed = /^(A|EM|STRONG|SPAN|BR|MJX-CONTAINER)$/;

  const fontFor = element => {
    const style = getComputedStyle(element);
    return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  };
  const measure = (text, element) => {
    canvas.font = fontFor(element);
    return canvas.measureText(text).width;
  };
  // CHTML renders every glyph as an inline-block with nested text, so a range's
  // client rect list contains overlapping duplicates. Summing those rects makes
  // a formula look almost twice as wide as it is, and the line breaker then
  // leaves half-empty lines which justification stretches into huge gaps. The
  // bounding rect is the one measurement that includes MathJax's spacing
  // margins without counting any glyph twice.
  const rangeWidth = range => range.getBoundingClientRect().width;
  const boundary = (node, offset, formula = null) => ({ node, offset, formula });

  function restore(paragraph) {
    const original = originals.get(paragraph);
    if (!original) return;
    paragraph.replaceChildren(...original);
    delete paragraph.dataset.kpLayout;
  }

  /** Represent an inline CHTML formula as atomic boxes and zero-width breaks. */
  function formulaModel(container, nodes, space) {
    const math = container.querySelector(":scope > mjx-math");
    if (!math) return;
    formulas.set(math, { container, wrapper: container.closest(".math-rendered") });
    const children = [...math.childNodes];
    let start = 0;
    for (let index = 0; index <= children.length; index++) {
      if (index < children.length && children[index].tagName !== "MJX-BREAK") continue;
      if (index > start) {
        const range = document.createRange();
        range.setStart(math, start);
        range.setEnd(math, index);
        nodes.push({ type: "box", width: rangeWidth(range), value: "math" });
      }
      if (index < children.length) {
        // The zero-width span becomes a real word-space during justification,
        // so a line made mostly of formula can still reach the right margin.
        nodes.push({
          type: "penalty", width: 0, stretch: space / 2, shrink: 0, penalty: 0,
          end: boundary(math, index, math),
          next: boundary(math, index + 1, math),
        });
      }
      start = index + 1;
    }
  }

  /** Split on Typst's hard line breaks and model each section in DOM order. */
  function models(paragraph) {
    const sections = [];
    const space = measure(" ", paragraph);
    let nodes = [];
    let start = boundary(paragraph, 0);
    const finish = end => {
      nodes.push({
        type: "penalty", width: 0, stretch: 0, shrink: 0, penalty: -10000,
        end,
        next: end,
      });
      sections.push({ start, end, nodes });
      nodes = [];
    };
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
        if (node.matches('.math-rendered[data-layout="inline-fallback"]')) return NodeFilter.FILTER_ACCEPT;
        if (node.closest('.math-rendered[data-layout="inline-fallback"]')) return NodeFilter.FILTER_REJECT;
        if (node.matches("mjx-container")) return NodeFilter.FILTER_ACCEPT;
        if (node.closest("mjx-container")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === "BR") {
          const parent = node.parentNode;
          const index = [...parent.childNodes].indexOf(node);
          finish(boundary(parent, index));
          start = boundary(parent, index + 1);
        } else if (node.matches('.math-rendered[data-layout="inline-fallback"]')) {
          nodes.push({ type: "box", width: node.getBoundingClientRect().width, value: "math-fallback" });
        } else if (node.matches("mjx-container")) {
          formulaModel(node, nodes, space);
        }
        continue;
      }
      for (const part of node.data.matchAll(/\s+|\S+/g)) {
        if (/^\s/.test(part[0])) {
          const at = part.index + part[0].length;
          nodes.push({
            type: "glue", width: space, stretch: space / 2, shrink: space / 3,
            end: boundary(node, at),
            next: boundary(node, at),
          });
        } else {
          const range = document.createRange();
          range.setStart(node, part.index);
          range.setEnd(node, part.index + part[0].length);
          nodes.push({ type: "box", width: rangeWidth(range), value: part[0] });
        }
      }
    }
    finish(boundary(paragraph, paragraph.childNodes.length));
    return sections;
  }

  /**
   * Dynamic-programming line breaker.  Every glue or MathJax break is a
   * candidate ending; the objective is total cubic badness.  The final line of
   * a hard-break section is free because it is set ragged, as in a PDF.
   */
  function solve(nodes, target, maxRatio = 10) {
    const prefix = { width: [0], stretch: [0], shrink: [0] };
    for (const node of nodes) {
      prefix.width.push(prefix.width.at(-1) + (node.type === "penalty" ? 0 : node.width));
      prefix.stretch.push(prefix.stretch.at(-1) + (node.stretch || 0));
      prefix.shrink.push(prefix.shrink.at(-1) + (node.type === "glue" ? node.shrink : 0));
    }
    const points = [{ at: -1, start: 0, final: false }];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.type === "glue") points.push({ at: index, start: index + 1, final: false });
      if (node.type === "penalty" && node.penalty !== 10000) {
        points.push({ at: index, start: index + 1, final: node.penalty === -10000 });
      }
    }
    const best = Array(points.length).fill(Infinity);
    const from = Array(points.length).fill(-1);
    const ratios = Array(points.length).fill(0);
    best[0] = 0;
    for (let fromIndex = 0; fromIndex < points.length; fromIndex++) {
      if (best[fromIndex] === Infinity) continue;
      const start = points[fromIndex].start;
      for (let toIndex = fromIndex + 1; toIndex < points.length; toIndex++) {
        const end = points[toIndex].at;
        const width = prefix.width[end] - prefix.width[start];
        if (width <= 0) continue;
        const stretch = prefix.stretch[end] - prefix.stretch[start];
        const shrink = prefix.shrink[end] - prefix.shrink[start];
        let ratio;
        if (width < target) {
          ratio = stretch ? (target - width) / stretch : 10000;
        } else if (width > target) {
          if (!shrink) continue;
          ratio = (target - width) / shrink;
          if (ratio < -1) continue;
        } else {
          ratio = 0;
        }
        if (!points[toIndex].final && ratio > maxRatio) continue;
        const badness = Math.min(10000, 100 * Math.abs(ratio) ** 3);
        const cost = points[toIndex].final && width <= target ? 0 : (10 + badness) ** 2;
        const total = best[fromIndex] + cost;
        if (total < best[toIndex]) {
          best[toIndex] = total;
          from[toIndex] = fromIndex;
          ratios[toIndex] = ratio;
        }
      }
    }
    let end = points.length - 1;
    if (best[end] === Infinity) return [];
    const result = [];
    while (end > 0) {
      result.push({ position: points[end].at, ratio: ratios[end] });
      end = from[end];
    }
    result.push({ position: 0, ratio: 0 });
    return result.reverse();
  }

  /** Clone the selected range; replace internal math breaks by justified glue. */
  function lineFragment(start, end, keepBreakPoints = false) {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const fragment = range.cloneContents();
    if (!keepBreakPoints) {
      fragment.querySelectorAll?.("mjx-break").forEach(node => {
        const glue = document.createElement("span");
        glue.className = "kp-math-glue";
        glue.textContent = " ";
        node.replaceWith(glue);
      });
    }
    if (start.formula && start.formula === end.formula) {
      const formula = formulas.get(start.formula);
      if (!formula) return fragment;
      const math = start.formula.cloneNode(false);
      const shell = formula.container.cloneNode(false);
      math.append(fragment);
      shell.append(math);
      const wrapper = formula.wrapper.cloneNode(false);
      wrapper.append(shell);
      return wrapper;
    }
    return fragment;
  }

  function build(paragraph, width) {
    const sections = [];
    for (const section of models(paragraph)) {
      let breaks = solve(section.nodes, width - safety);
      if (!breaks.length) {
        // If the strict typographic limits leave a gap with no legal line
        // sequence, prefer a slightly looser justified paragraph over silently
        // restoring the browser's greedy layout for the whole section.
        breaks = solve(section.nodes, width - safety, Infinity);
      }
      const block = document.createElement("span");
      block.className = "kp-section";
      if (breaks.length < 3 || breaks.at(-1).position !== section.nodes.length - 1) {
        // This section has no feasible all-at-once solution. Keep its native
        // MathJax break points so a long formula can still wrap instead of
        // overflowing the narrow column.
        block.append(lineFragment(section.start, section.end, true));
        sections.push(block);
        continue;
      }
      let start = section.start;
      for (let index = 1; index < breaks.length; index++) {
        const node = section.nodes[breaks[index].position];
        if (!node.end || !node.next) return null;
        const line = document.createElement("span");
        line.className = "kp-line";
        line.append(lineFragment(start, node.end));
        block.append(line);
        start = node.next;
      }
      sections.push(block);
    }
    return sections;
  }

  function typeset(paragraph) {
    restore(paragraph);
    const width = paragraph.clientWidth;
    if (width < minWidth) return;
    const sections = build(paragraph, width);
    if (!sections) return;
    const original = [...paragraph.childNodes];
    const normalise = text => text.replace(zeroWidthSpace, "").replace(/\s+/g, "");
    const before = normalise(paragraph.innerText);
    paragraph.replaceChildren(...sections);
    const after = normalise(paragraph.innerText);
    const overflow = [...paragraph.querySelectorAll(".kp-line")]
      .some(line => line.scrollWidth > line.clientWidth + 1);
    if (after !== before || overflow) {
      paragraph.replaceChildren(...original);
      return;
    }
    originals.set(paragraph, original);
    paragraph.dataset.kpLayout = "";
  }

  function eligible(paragraph) {
    if (paragraph.textContent.length < 80 || paragraph.textContent.length > 7000) return false;
    if (paragraph.closest(".note-align-center, .note-align-start, .note-align-end")) return false;
    if (paragraph.querySelector('img, svg, pre, code, table, figure, .note-diagram-block, .math-rendered[data-display="true"]')) return false;
    return [...paragraph.querySelectorAll("*")].every(element =>
      element.matches("mjx-container, mjx-container *")
      || (allowed.test(element.tagName) && !element.matches("[id], [role], [tabindex]")));
  }

  const paragraphs = [...article.querySelectorAll("p")].filter(eligible);
  let scheduled = 0;
  let printing = false;
  function run() {
    scheduled = 0;
    if (printing) return;
    for (const paragraph of paragraphs) typeset(paragraph);
  }
  function schedule() {
    if (scheduled || printing) return;
    scheduled = requestAnimationFrame(run);
  }

  document.fonts.ready.then(schedule);
  let previous = article.clientWidth;
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - previous) <= 0.5) return;
    previous = width;
    for (const paragraph of paragraphs) restore(paragraph);
    schedule();
  }).observe(article);
  addEventListener("beforeprint", () => {
    printing = true;
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    for (const paragraph of paragraphs) restore(paragraph);
  });
  addEventListener("afterprint", () => {
    printing = false;
    schedule();
  });
})();

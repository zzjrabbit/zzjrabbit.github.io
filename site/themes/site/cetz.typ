// Website-only CeTZ adapter.
//
// Why this file exists: `cetz.canvas` returns a block of `place`d curves and
// text, and Typst's HTML export silently drops that block — a page that draws
// with CeTZ shows a hole where the figure should be. `html.frame` keeps the very
// same canvas as a vector SVG.
//
// No note has to import this file: `scripts/sync-notes.sh` rewrites the package
// path of every CeTZ import in the synchronized copies to this module, so all
// spellings land here, single-line or multi-line, aliased or selective:
//
//   #import "@preview/cetz:0.5.2"                    // binds `cetz`
//   #import "@preview/cetz:0.5.2" as cetz
//   #import "@preview/cetz:0.5.2": canvas, draw
//   #import "@preview/cetz:0.5.2": *
//
// Three details are load-bearing. tests/cetz.test.mjs guards the first two, and
// scripts/sync-notes.sh enforces the third.
//
// 1. The file must stay named `cetz.typ`. A bare `#import ".../cetz.typ"` binds
//    the file stem, exactly as `#import "@preview/cetz:0.5.2"` binds the package
//    name, so rewritten `cetz.canvas(...)` and `import cetz.draw: *` still
//    resolve to this module.
// 2. The public API is re-exported with a glob import, not a hand-written list,
//    so `draw`, `decorations`, `coordinate`, `mark`, ... stay available under
//    every import form and a CeTZ upgrade cannot silently drop one.
// 3. The pinned version must match the version the notes ask for; otherwise the
//    notes would compile against a version they never chose. The synchronizer
//    checks that and stops with the exact edit to make.

#import "@preview/cetz:0.5.2" as cetz-original
#import "@preview/cetz:0.5.2": *

#let web = sys.inputs.at("calepin-target", default: "") == "html"

// CeTZ's `canvas`, with the HTML export fixed.
//
// PDFs get CeTZ's own output untouched, so print layout and page breaks are
// exactly as before. HTML gets the canvas inside `html.frame`, which
// `scripts/prepare-starlight.mjs` then re-inks for the current theme.
//
// - web-align (alignment, none): Where a *block-level* canvas sits in the HTML
//   export. `center` (the default) matches the `#align(center)[...]` notes wrap
//   figures in, which HTML export otherwise ignores, so the web page lines up
//   with the PDF twin. `start`/`end`/`left`/`right` put it at an edge, and `none`
//   emits the bare frame. Canvases with a `baseline` are inline and never
//   wrapped. This option affects HTML only; it is dropped before CeTZ sees the
//   call and does nothing in a PDF.
// -> content
#let canvas(..args) = {
  let named = args.named()
  let web-align = named.at("web-align", default: center)

  // Forward the call verbatim unless `web-align` has to be removed: a canvas
  // body is positional in CeTZ, and every other option must reach CeTZ exactly
  // as the note wrote it.
  let figure = if "web-align" in named {
    let forwarded = (:)
    for (key, value) in named {
      if key != "web-align" { forwarded.insert(key, value) }
    }
    cetz-original.canvas(..args.pos(), ..forwarded)
  } else {
    cetz-original.canvas(..args)
  }

  if not web { return figure }

  let framed = html.frame(figure)
  // An inline canvas (`baseline:`) has to stay in its line box.
  if web-align == none or named.at("baseline", default: none) != none { return framed }

  let edge = web-align.x
  let class = if edge == center { "note-diagram-block" }
    else if edge == end or edge == right { "note-diagram-block is-end" }
    else { "note-diagram-block is-start" }
  html.elem("div", attrs: (class: class), framed)
}

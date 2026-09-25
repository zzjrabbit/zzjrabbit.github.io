// Website-only adapter. Imported after noteworthy in synchronized copies.
// Keep theorem counters, references, options and QED handling in theoretic.
//
// CeTZ is adapted next to this file (themes/site/cetz.typ), because a canvas has
// to be intercepted where it is called, whatever name it was imported under. The
// synchronizer points every CeTZ import there; re-exporting `canvas` here keeps
// `canvas(...)` working in notes that only import this adapter, and both names
// resolve to the same function, so a note can never frame its canvas twice.
#import "@preview/noteworthy:0.4.0" as original
#import "@preview/theoretic:0.3.1" as theoretic
#import "/themes/site/cetz.typ": canvas, web

// Typst's HTML export ignores `align` and drops everything inside it, warning
// only in the build log. `#align(center)[...]` is how notes place figures, so a
// diagram wrapped that way reaches the web page as nothing at all. Paged output
// keeps the original `align`; HTML gets the same alignment as an element that
// `src/styles/notes.css` styles.
//
// The signature is Typst's two call arguments — `dx`/`dy` are element fields of
// `align`, not call arguments, and HTML flow has a horizontal axis only, so they
// stay paged. A note must not use `#set align(...)` either: a set rule needs an
// element function and this replacement is an ordinary function, which fails
// loudly at compile time rather than dropping content.
#let _align = align
#let align(alignment, body) = {
  if not web { return _align(alignment, body) }
  let edge = alignment.x
  let class = if edge == center { "note-align-center" }
    else if edge == end or edge == right { "note-align-end" }
    else { "note-align-start" }
  html.elem("div", attrs: (class: class), body)
}

#let render(it) = {
  if web {
    html.elem("section", attrs: (class: "note-environment note-" + it.variant), {
      html.elem("div", attrs: (class: "note-environment-title"), {
        let head = [#it.supplement#if it.number != none [ #it.number]]
        let target = it.options.at("link", default: none)
        if target != none { link(target, head) } else { head }
        if it.title != none [ — #it.title]
      })
      html.elem("div", attrs: (class: "note-environment-body"), it.body)
    })
  } else { theoretic.show-theorem(it) }
}

#let adapt(environment) = if web { environment.with(show-theorem: render) } else { environment }
#let theorem = adapt(original.theorem)
#let proposition = adapt(original.proposition)
#let lemma = adapt(original.lemma)
#let corollary = adapt(original.corollary)
#let algorithm = adapt(original.algorithm)
#let axiom = adapt(original.axiom)
#let definition = adapt(original.definition)
#let exercise = adapt(original.exercise)
#let example = adapt(original.example)
#let counter-example = adapt(original.counter-example)
#let remark = adapt(original.remark)
#let note = adapt(original.note)
#let claim = adapt(original.claim)
#let proof = adapt(original.proof)
#let solution = adapt(original.solution)

// Equation numbering lives in the notes repository, next to `tylenotes`, so that
// the same `#show: equations` line works whether a note is compiled on its own or
// published here — the pattern the title template already follows. This file used
// to carry its own copy, which meant the website could drift from what a note
// compiles with locally. Only the HTML the number is drawn into is the theme's
// business; `html.elem` cannot be exercised outside a build, but it is also the
// only part a note never needs on its own.
#import "/typ/shared.typ": equations, web-equations

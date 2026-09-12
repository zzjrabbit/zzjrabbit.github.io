// Website-only adapter. Imported after noteworthy in synchronized copies.
// Keep theorem counters, references, options and QED handling in theoretic.
#import "@preview/noteworthy:0.4.0" as original
#import "@preview/theoretic:0.3.1" as theoretic
#import "@preview/cetz:0.5.2" as cetz

#let web = sys.inputs.at("calepin-target", default: "") == "html"
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

// Preserve vector diagrams instead of silently dropping the CeTZ canvas in HTML.
#let canvas(..args) = {
  if web { html.frame(cetz.canvas(..args)) }
  else { cetz.canvas(..args) }
}

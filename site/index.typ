#import "/.calepin/calepin.typ" as calepin
#show: calepin.document

#set document(title: [zzj — Mathematical Notes])

#metadata((
  tags: ("index",),
  summary: "A personal mathematical notebook: Lean 4 formal proofs and Typst notes.",
  pdf: false,
)) <website-metadata>

#html.elem("div", attrs: (class: "notes-eyebrow"))[MATHEMATICAL NOTES]
#title()
#html.elem("p", attrs: (class: "notes-intro"))[
  From intuition to proof: ideas and derivations from learning mathematics.
  Read the notes online, switch to PDF, or explore the Typst source and Lean formalizations.
]
#html.elem("p", attrs: (class: "notes-meta"))[zzj · Mathematics / Formal proofs / Computational experiments]

#let notes = calepin.pages().filter(p => p.path != "index.typ" and p.path != "404.typ")
#let repo = "https://github.com/zzjrabbit/notes"

// 分类取自路径：typ/<category>/... → <category>；models/<crate>/... → models
#let category(p) = {
  let segs = p.path.split("/")
  if segs.len() >= 2 and segs.first() == "typ" { segs.at(1) } else { "models" }
}

#let cat-name = (
  "lie": "Lie theory",
  "topology": "Topology",
  "geometry": "Geometry",
  "real": "Real analysis",
  "models": "Computational models",
)

#let cats = ("topology", "geometry", "lie", "real", "models") + notes.map(category).dedup().filter(c => c not in cat-name)
#let cats = cats.filter(c => notes.any(p => category(p) == c))

#for c in cats [
  = #cat-name.at(c, default: c)

  #let items = notes.filter(p => category(p) == c).sorted(key: p => p.meta.at("date", default: "")).rev()

  #html.elem("div", attrs: (class: "notes-grid"))[
    #for p in items [
      #html.elem("article", attrs: (class: "note-card"))[
        #html.elem("a", attrs: (href: p.href, class: "note-title"))[#p.title]
        #if p.meta.at("summary", default: "") != "" [
          #html.elem("p")[#p.meta.summary]
        ]
        #html.elem("div", attrs: (class: "notes-meta"))[
          #html.elem("span")[#p.meta.at("date", default: "")]
          #if p.path.starts-with("typ/") [
            #link(repo + "/blob/main/lean/" + p.path.slice(4).replace(".typ", ".lean"))[Lean formalization ↗]
          ]
        ]
      ]
    ]
  ]
]

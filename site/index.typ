#import "/.calepin/calepin.typ" as calepin
#show: calepin.document

#set document(title: [zzj — Mathematics & Physics Notes])

#metadata((
  tags: ("index",),
  summary: "Mathematics and physics developed side by side: Typst exposition, Lean 4 proofs and computational models.",
  pdf: false,
)) <website-metadata>

#html.elem("div", attrs: (class: "notes-eyebrow"))[MATHEMATICS & PHYSICS]
#title()
#html.elem("p", attrs: (class: "notes-intro"))[
  From intuition to something checkable: mathematical exposition and physical derivation,
  formal proofs, and small models that can be rerun.
  Read the notes online, switch to PDF, or explore the Typst source and Lean formalizations.
]
#html.elem("p", attrs: (class: "notes-meta"))[zzj · Mathematics / Physics / Modeling & computation]

#let notes = calepin.pages().filter(p => p.path != "index.typ" and p.path != "404.typ")
#let repo = "https://github.com/zzjrabbit/notes"

// 三条并行轨道，顺序与网站一致；暂时没有笔记的轨道照常出现并说明，不静默消失。
#let track-name = (
  "mathematics": "Mathematics",
  "physics": "Physics",
  "modeling": "Modeling & computation",
)

// 轨道只看顶层目录：typ/ 一律是数学（目录名不会把它挪到物理），phys/（别名 physics/）是物理，models/ 是建模。
#let track(p) = {
  let root = p.path.split("/").first()
  if root in ("phys", "physics") { "physics" } else if root == "models" { "modeling" } else { "mathematics" }
}

// 学科取自路径：typ/<学科>/… 与 phys/<学科>/… 取第二层目录；models/… 的顶层目录本身就是学科。
#let subject(p) = {
  let segs = p.path.split("/")
  if segs.len() >= 2 and segs.first() in ("typ", "phys", "physics") { segs.at(1) } else { segs.first() }
}

// 学科名完全由目录名自动得出，不依赖任何登记表：连字符/下划线变空格，首字母大写；
// 作者写成全大写的目录（如 PDE）保持原样。
#let subject-label(key) = {
  let raw = key.split("/").last().replace(regex("[-_]+"), " ")
  if raw == "" { "Other notes" } else if raw == upper(raw) { raw } else { upper(raw.first()) + raw.slice(1) }
}

#for t in ("mathematics", "physics", "modeling") [
  = #track-name.at(t)

  #let items = notes.filter(p => track(p) == t)
  #if items.len() == 0 [
    This track is still gathering its first notes; its subjects will appear here as soon as they are written.
  ] else [
    // 学科按目录名排序，彼此独立，不需要在网站里登记或排序。
    #for s in items.map(subject).dedup().sorted() [
      == #subject-label(s)

      #html.elem("div", attrs: (class: "notes-grid"))[
        #for p in items.filter(p => subject(p) == s).sorted(key: p => p.meta.at("date", default: "")).rev() [
          #html.elem("article", attrs: (class: "note-card"))[
            #html.elem("a", attrs: (href: p.href, class: "note-title"))[#p.title]
            #if p.meta.at("summary", default: "") != "" [
              #html.elem("p")[#p.meta.summary]
            ]
            #html.elem("div", attrs: (class: "notes-meta"))[
              #html.elem("span")[#p.meta.at("date", default: "")]
              // 只有数学笔记有 Lean 伴生文件（lean/<学科>/x.lean）；物理与建模笔记不链接 Lean。
              #if p.path.starts-with("typ/") [
                #link(repo + "/blob/main/lean/" + p.path.slice(4).replace(".typ", ".lean"))[Lean formalization ↗]
              ]
            ]
          ]
        ]
      ]
    ]
  ]
]

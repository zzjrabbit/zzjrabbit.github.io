#import "/.calepin/calepin.typ" as calepin
#show: calepin.document

#set document(title: [zzj — Mathematical Notes])

#metadata((
  tags: ("index",),
  summary: "个人数学笔记入口：Lean 4 形式化证明与 Typst 数学笔记。",
  pdf: false,
)) <website-metadata>

#html.elem("div", attrs: (class: "notes-eyebrow"))[MATHEMATICAL NOTES]
#title()
#html.elem("p", attrs: (class: "notes-intro"))[
  从直觉到证明，记录数学学习中的思考与推导。
  在网页中阅读笔记，也可以切换到 PDF，或查看 Typst 源码与 Lean 形式化。
]
#html.elem("p", attrs: (class: "notes-meta"))[zzj · 数学 / 形式化证明 / 计算实验]

#let notes = calepin.pages().filter(p => p.path != "index.typ" and p.path != "404.typ")
#let repo = "https://github.com/zzjrabbit/notes"

// 分类取自路径：typ/<category>/... → <category>；models/<crate>/... → models
#let category(p) = {
  let segs = p.path.split("/")
  if segs.len() >= 2 and segs.first() == "typ" { segs.at(1) } else { "models" }
}

#let cat-name = (
  "lie": "Lie 理论",
  "topology": "拓扑",
  "geometry": "几何",
  "real": "实分析",
  "models": "计算模型",
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
            #link(repo + "/blob/main/lean/" + p.path.slice(4).replace(".typ", ".lean"))[Lean 形式化 ↗]
          ]
        ]
      ]
    ]
  ]
]

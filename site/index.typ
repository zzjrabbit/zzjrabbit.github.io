#import "/.calepin/calepin.typ" as calepin
#show: calepin.document

#set document(title: [Zeng Zhenjia — Mathematical Notes])

#metadata((
  tags: ("index",),
  summary: "个人数学笔记入口：Lean 4 形式化证明与 Typst 数学笔记。",
  pdf: false,
)) <website-metadata>

#title()

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

#let cats = notes.map(category).dedup()

#for c in cats [
  == #cat-name.at(c, default: c)

  #let items = notes.filter(p => category(p) == c).sorted(key: p => p.meta.at("date", default: "")).rev()

  #for p in items [
    - #link(p.href)[#p.title]
      #h(0.6em)
      #text(fill: luma(130), size: 0.9em)[#p.meta.at("date", default: "")]
      #if p.path.starts-with("typ/") [
        #h(0.6em)
        #text(size: 0.85em)[
          #link(repo + "/blob/main/lean/" + p.path.slice(4).replace(".typ", ".lean"))[Lean 形式化]
        ]
      ]
  ]
]

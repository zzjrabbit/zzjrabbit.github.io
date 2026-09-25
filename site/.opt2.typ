#import "/typ/shared.typ": *
#import "/themes/site/notes.typ": *
#show: web-equations
#set math.equation(numbering: "(1)")

$ A = 1 $ <eq:a>

#[
  #set math.equation(numbering: none)
  $ B = 2 $
]

$ D = 4 $ <eq:d>

See @eq:a and @eq:d.

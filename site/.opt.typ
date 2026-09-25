#import "/typ/shared.typ": *
#show: equations

$ A = 1 $ <eq:a>

A: #[
  #set math.equation(numbering: none)
  $ B = 2 $ <eq:b>
]

B: #math.equation(block: true, numbering: none, $ C = 3 $) <eq:c>

$ D = 4 $ <eq:d>

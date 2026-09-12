#!/usr/bin/env bash
# Build first with scripts/build.sh. No browser or server required.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
perl -0777 -e '
  use strict; use warnings;
  my $root = shift;
  sub page { my ($path) = @_; open my $fh, "<", "$root/_site/$path" or die "$path: $!"; local $/; return <$fh>; }
  my $continuous = page("typ/topology/continuous.html");
  for my $class (qw(note-plain note-proof)) {
    die "Missing semantic environment: $class\n" unless $continuous =~ /<section class="note-environment $class"/;
  }
  die "Native MathML missing\n" unless $continuous =~ /<math\b/;
  my $lie = page("typ/lie/cover_linear.html");
  die "CeTZ SVG missing\n" unless $lie =~ /<svg\b[^>]*xmlns:h5="http:\/\/www\.w3\.org\/1999\/xhtml"/;
  print "OK: semantic statements/proofs, native MathML and Typst SVG\n";
' "$root"

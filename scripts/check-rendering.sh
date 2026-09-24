#!/usr/bin/env bash
# Build first with scripts/build.sh. No browser or server required.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
perl -0777 -e '
  use strict; use warnings;
  use File::Find;
  my $root = shift;
  sub page { my ($path) = @_; open my $fh, "<", "$root/_site/$path" or die "$path: $!\n"; local $/; return <$fh>; }
  my $continuous = page("typ/topology/continuous.html");
  for my $class (qw(note-plain note-proof)) {
    die "Missing semantic environment: $class\n" unless $continuous =~ /<section class="note-environment $class"/;
  }
  die "Native MathML missing\n" unless $continuous =~ /<math\b/;

  # Every note that draws with CeTZ must reach its page as vector diagrams.
  # The synchronizer points those imports at themes/site/cetz.typ, and Typst
  # silently drops a canvas that is not wrapped in html.frame — as it drops
  # everything inside `#align(...)`, which is where notes put their figures. So a
  # page that draws with CeTZ but carries fewer SVG frames than it has canvas
  # calls lost a figure, whatever the reason.
  my @sources;
  for my $collection (qw(typ phys physics models)) {
    my $dir = "$root/site/$collection";
    next unless -d $dir;
    find(sub { push @sources, $File::Find::name if /\.typ\z/ }, $dir);
  }

  my $checked = 0;
  for my $source (sort @sources) {
    open my $fh, "<", $source or die "$source: $!\n";
    my $text = do { local $/; <$fh> };
    next unless $text =~ m{/themes/site/cetz\.typ};
    (my $rel = $source) =~ s{^\Q$root/site/\E}{};
    # A collection shared library is not a page.
    next if $rel =~ m{(?:\A|/)shared\.typ\z};
    (my $html = $rel) =~ s{\.typ\z}{.html};
    my $page = page($html);
    my $canvases = () = $text =~ /\bcanvas\s*\(/g;
    my $frames = () = $page =~ /<svg\b[^>]*xmlns:h5="http:\/\/www\.w3\.org\/1999\/xhtml"/g;
    die "$rel calls canvas $canvases time(s) but $html carries $frames Typst SVG frame(s)\n"
      if $frames < $canvases;
    $checked++;
  }
  die "No CeTZ page found: does the synchronizer still rewrite CeTZ imports to themes/site/cetz.typ?\n"
    unless $checked;
  print "OK: semantic statements/proofs, native MathML and $checked CeTZ page(s) with Typst SVG\n";
' "$root"

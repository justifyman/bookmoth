#!/bin/sh
# Makes half-size (1k) copies of the texture sets for the Balanced and Light quality
# settings. Uses sips, which ships with macOS. Run after scripts/fetch-assets.mjs.
cd "$(dirname "$0")/../public/assets/textures" || exit 1
for dir in */; do
  mkdir -p "$dir/1k"
  for map in albedo normal arm; do
    [ -f "$dir/1k/$map.jpg" ] || sips -Z 1024 -s format jpeg -s formatOptions 78 "$dir/$map.jpg" --out "$dir/1k/$map.jpg" >/dev/null
  done
done
du -sh */1k | cat

#!/bin/sh
# New worktrees share the main checkout's card-art mirror instead of downloading ~110 MB from TCGdex again.
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
if [ ! -e assets/tcg ] && [ -d "$main/assets/tcg" ]; then mkdir -p assets && ln -s "$main/assets/tcg" assets/tcg; fi
[ -e assets/tcg ] || node scripts/fetch-images.mjs

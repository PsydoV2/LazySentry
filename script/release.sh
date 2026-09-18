#!/usr/bin/env bash
# Cuts a release: bumps every workspace package.json to the given version,
# commits, tags vX.Y.Z, and (after confirmation) pushes both — which is what
# triggers .github/workflows/docker-publish.yml to build and push the
# tagged image to GHCR.
#
# Usage: ./release.sh 1.2.3   (Git Bash on Windows, or any POSIX shell)

set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 X.Y.Z" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — commit or stash first." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Not on main (currently on '$branch') — switch to main first." >&2
  exit 1
fi

git fetch origin main --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "main is not up to date with origin/main — pull first." >&2
  exit 1
fi

if git rev-parse "v$version" >/dev/null 2>&1; then
  echo "Tag v$version already exists." >&2
  exit 1
fi

files=(package.json apps/api/package.json apps/web/package.json packages/shared/package.json)
for f in "${files[@]}"; do
  node -e "
    const fs = require('fs');
    const path = '$f';
    const content = fs.readFileSync(path, 'utf8');
    const updated = content.replace(/\"version\": \"[^\"]*\"/, '\"version\": \"$version\"');
    fs.writeFileSync(path, updated);
  "
done

git add "${files[@]}"
git commit -m "chore: bump version to $version"
git tag -a "v$version" -m "v$version"

echo
echo "Committed and tagged v$version locally. Pushing triggers the Docker publish workflow."
read -r -p "Push origin main + v$version now? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Not pushed. To undo: git reset --hard HEAD~1 && git tag -d v$version"
  exit 0
fi

git push origin main
git push origin "v$version"

echo "Done — https://github.com/PsydoV2/LazySentry/actions"

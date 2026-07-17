#!/usr/bin/env bash
set -euo pipefail

# Publish monocrate to npm
# Steps:
# 1. Clean build
# 2. Run tests
# 3. Copy to a clean directory
# 4. Get latest published version, set it, bump minor
# 5. Run npm publish
# 6. Add git tag 'published@x.y.z' and push

PACKAGE_NAME="monocrate"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "==> Checking for uncommitted changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

echo "==> Clean build..."
rm -rf dist
npm run build

echo "==> Running tests..."
npm test

echo "==> Creating clean publish directory..."
PUBLISH_DIR=$(mktemp -d)
trap 'rm -rf "$PUBLISH_DIR"' EXIT

echo "==> Copying files to $PUBLISH_DIR..."
cp -r dist "$PUBLISH_DIR/"
cp package.json "$PUBLISH_DIR/"
cp README.md "$PUBLISH_DIR/" 2>/dev/null || true
cp LICENSE "$PUBLISH_DIR/" 2>/dev/null || true

echo "==> Getting latest published version..."
LATEST_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null || echo "0.0.0")
echo "    Latest published version: $LATEST_VERSION"

echo "==> Setting version and bumping minor..."
cd "$PUBLISH_DIR"
npm pkg set version="$LATEST_VERSION"
NEW_VERSION=$(npm version minor --no-git-tag-version)
NEW_VERSION="${NEW_VERSION#v}"  # Remove 'v' prefix if present
echo "    New version: $NEW_VERSION"

echo "==> Publishing to npm..."
npm publish

echo "==> Creating and pushing git tag..."
cd "$PROJECT_ROOT"
TAG_NAME="published@$NEW_VERSION"
git tag "$TAG_NAME"
git push --tags

echo ""
echo "==> Successfully published $PACKAGE_NAME@$NEW_VERSION"
echo "==> Tag '$TAG_NAME' pushed to origin"

#!/usr/bin/env bash
# i18n-check.sh — Compare translation keys across Hugo i18n TOML files.
#
# Reports missing keys, extra keys, and a summary for each non-English
# locale file relative to en.toml (the source of truth).
#
# Usage:
#   ./scripts/i18n-check.sh            # check all locales
#   ./scripts/i18n-check.sh es          # check only es.toml

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
I18N_DIR="$REPO_ROOT/hugo/site/i18n"
EN_FILE="$I18N_DIR/en.toml"

if [ ! -f "$EN_FILE" ]; then
  echo "ERROR: $EN_FILE not found" >&2
  exit 1
fi

# Extract [key] lines from a TOML i18n file, sorted.
extract_keys() {
  grep -oP '^\[\K[^\]]+' "$1" | sort
}

en_keys=$(extract_keys "$EN_FILE")
en_count=$(echo "$en_keys" | wc -l)

echo "Reference: en.toml ($en_count keys)"
echo "────────────────────────────────────"

exit_code=0

for locale_file in "$I18N_DIR"/*.toml; do
  [ "$locale_file" = "$EN_FILE" ] && continue

  locale=$(basename "$locale_file" .toml)

  # If a specific locale was requested, skip others.
  if [ $# -ge 1 ] && [ "$1" != "$locale" ]; then
    continue
  fi

  locale_keys=$(extract_keys "$locale_file")
  locale_count=$(echo "$locale_keys" | wc -l)

  missing=$(comm -23 <(echo "$en_keys") <(echo "$locale_keys"))
  extra=$(comm -13 <(echo "$en_keys") <(echo "$locale_keys"))

  missing_count=0
  extra_count=0
  [ -n "$missing" ] && missing_count=$(echo "$missing" | wc -l)
  [ -n "$extra" ] && extra_count=$(echo "$extra" | wc -l)

  echo ""
  echo "$locale.toml: $locale_count / $en_count keys"

  if [ "$missing_count" -gt 0 ]; then
    echo "  ✗ Missing $missing_count key(s):"
    echo "$missing" | sed 's/^/    - /'
    exit_code=1
  fi

  if [ "$extra_count" -gt 0 ]; then
    echo "  ⚠ Extra $extra_count key(s) (not in en.toml):"
    echo "$extra" | sed 's/^/    - /'
  fi

  if [ "$missing_count" -eq 0 ] && [ "$extra_count" -eq 0 ]; then
    echo "  ✓ All keys present and in sync"
  fi
done

echo ""
if [ "$exit_code" -eq 0 ]; then
  echo "All locales are in sync ✓"
else
  echo "Some locales have missing keys ✗"
fi
exit $exit_code

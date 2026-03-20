#!/usr/bin/env python3
"""
Generate Hugo country page body content from anthems.json.

Reads hugo/site/static/data/anthems.json and updates each country's .md file
with SEO-friendly body content, preserving the existing frontmatter.

Usage:
    python3 scripts/generate-country-pages.py
    python3 scripts/generate-country-pages.py --dry-run
    python3 scripts/generate-country-pages.py --iso USA GBR FRA
"""

import json
import os
import re
import sys
import argparse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANTHEMS_JSON = os.path.join(REPO_ROOT, "hugo", "site", "static", "data", "anthems.json")
COUNTRIES_DIR = os.path.join(REPO_ROOT, "hugo", "site", "content", "countries")


def load_anthems():
    with open(ANTHEMS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_md_frontmatter(text):
    """Split a markdown file into (frontmatter_text, body_text). Returns (fm, body)."""
    if not text.startswith("---"):
        return "", text
    end = text.find("---", 3)
    if end == -1:
        return "", text
    frontmatter = text[: end + 3]
    body = text[end + 3:].lstrip("\n")
    return frontmatter, body


def get_frontmatter_iso(frontmatter_text):
    """Extract iso field value from frontmatter."""
    m = re.search(r'^iso:\s*"?([A-Z]{3})"?', frontmatter_text, re.MULTILINE)
    return m.group(1) if m else None


def build_content(country):
    """Build SEO markdown body content for a country page."""
    name = country.get("common_name") or country.get("name", "")
    region = country.get("region", "")
    subregion = country.get("subregion", "")
    capital = country.get("capital", "")
    anthem = country.get("anthem") or {}
    audio_files = country.get("audio_files") or []

    anthem_name = anthem.get("name", "")
    anthem_title_en = anthem.get("title_en", "")
    composer = anthem.get("composer", "")
    lyricist = anthem.get("lyricist", "")
    adopted = anthem.get("adopted_date", "")
    history = anthem.get("history", "")
    wikidata_id = anthem.get("wikidata_id", "")

    # Clean up generic/redundant title_en values; strip stray leading quotes
    if anthem_title_en:
        anthem_title_en = anthem_title_en.strip('"').strip("'").strip()
    if anthem_title_en and anthem_title_en.lower() in ("national anthem", anthem_name.lower()):
        anthem_title_en = ""

    # If history is just "adopted YYYY", promote it to adopted_date if unset
    if history and re.match(r'^adopted\s+\d{4}$', history.strip(), re.IGNORECASE):
        if not adopted:
            # Strip the "adopted " prefix since the label already says "Adopted"
            adopted = re.sub(r'^adopted\s+', '', history.strip(), flags=re.IGNORECASE)
        history = ""

    lines = []

    # Intro paragraph
    if region or subregion:
        location = f"{subregion}, {region}" if subregion else region
        location_phrase = f" in {location}"
    else:
        location_phrase = ""

    if anthem_name:
        title_str = f' ("{anthem_title_en}")' if anthem_title_en else ""
        intro = f"**{name}** is a country{location_phrase}."
        if capital:
            intro += f" Its capital is {capital}."
        intro += f" The national anthem is *{anthem_name}*{title_str}."
        lines.append(intro)
    else:
        intro = f"**{name}** is a country{location_phrase}."
        if capital:
            intro += f" Its capital is {capital}."
        lines.append(intro)

    lines.append("")

    # Anthem details section
    if anthem_name:
        lines.append("## National Anthem")
        lines.append("")

        details = []
        if anthem_title_en:
            details.append(f"**English title:** {anthem_title_en}")
        if composer:
            details.append(f"**Composer:** {composer}")
        if lyricist:
            details.append(f"**Lyricist:** {lyricist}")
        if adopted:
            details.append(f"**Adopted:** {adopted}")
        for d in details:
            lines.append(d)
            lines.append("")

        if history:
            # Trim to a reasonable length for SEO (first ~800 chars)
            hist = history.strip()
            if len(hist) > 900:
                hist = hist[:900].rsplit(" ", 1)[0] + "…"
            lines.append(hist)
            lines.append("")

        if wikidata_id:
            lines.append(
                f'[Learn more on Wikidata](https://www.wikidata.org/wiki/{wikidata_id})'
            )
            lines.append("")

    # Audio section
    if audio_files:
        count = len(audio_files)
        noun = "recording" if count == 1 else "recordings"
        lines.append(f"## Listen")
        lines.append("")
        lines.append(f"{count} audio {noun} available.")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def update_md_file(filepath, content, dry_run=False):
    """Rewrite the .md file with updated body content, preserving frontmatter."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    frontmatter, _old_body = parse_md_frontmatter(text)
    if not frontmatter:
        print(f"  SKIP (no frontmatter): {filepath}")
        return False

    new_text = frontmatter + "\n" + content

    if dry_run:
        return True

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_text)
    return True


def main():
    parser = argparse.ArgumentParser(description="Generate country page content from anthems.json")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    parser.add_argument("--iso", nargs="+", metavar="ISO", help="Only update specific ISO codes (e.g. USA GBR)")
    args = parser.parse_args()

    print(f"Loading anthem data from {ANTHEMS_JSON}")
    anthems = load_anthems()
    print(f"  {len(anthems)} countries loaded")

    # Build lookup: ISO alpha-3 → country data (data is keyed by uppercase ISO-3)
    iso_to_data = {k.upper(): v for k, v in anthems.items()}

    # Find all .md files
    md_files = [
        f for f in os.listdir(COUNTRIES_DIR)
        if f.endswith(".md") and not f.endswith(".es.md") and f != "_index.md"
    ]

    if args.iso:
        target_isos = {iso.upper() for iso in args.iso}
        md_files = [f for f in md_files if f.replace(".md", "").upper() in target_isos]

    updated = 0
    skipped = 0
    no_data = 0

    for fname in sorted(md_files):
        fpath = os.path.join(COUNTRIES_DIR, fname)

        with open(fpath, "r", encoding="utf-8") as f:
            text = f.read()

        frontmatter, _ = parse_md_frontmatter(text)
        iso = get_frontmatter_iso(frontmatter)
        if not iso:
            # Try deriving from filename
            iso = fname.replace(".md", "").upper()

        country_data = iso_to_data.get(iso)
        if not country_data:
            no_data += 1
            continue

        content = build_content(country_data)

        if update_md_file(fpath, content, dry_run=args.dry_run):
            updated += 1
            if args.dry_run and updated <= 3:
                print(f"\n--- Preview: {fname} ---")
                print(content[:400])
        else:
            skipped += 1

    action = "Would update" if args.dry_run else "Updated"
    print(f"\n{action}: {updated} files")
    print(f"No anthem data: {no_data} files")
    print(f"Skipped (no frontmatter): {skipped} files")

    if args.dry_run:
        print("\nRe-run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()

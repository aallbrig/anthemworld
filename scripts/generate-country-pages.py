#!/usr/bin/env python3
"""
Generate Hugo country page body content from anthems.json.

Reads hugo/site/static/data/anthems.json and updates each country's .md file
(and locale variants like .es.md) with SEO-friendly body content, preserving
the existing frontmatter.

Usage:
    python3 scripts/generate-country-pages.py
    python3 scripts/generate-country-pages.py --dry-run
    python3 scripts/generate-country-pages.py --iso USA GBR FRA
    python3 scripts/generate-country-pages.py --lang es      # only Spanish
    python3 scripts/generate-country-pages.py --lang en es    # both (default)
"""

import json
import os
import re
import sys
import argparse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANTHEMS_JSON = os.path.join(REPO_ROOT, "hugo", "site", "static", "data", "anthems.json")
COUNTRIES_DIR = os.path.join(REPO_ROOT, "hugo", "site", "content", "countries")


# ── Locale templates ─────────────────────────────────────────────────────────
# To add a new language: add a dict entry here with all the template strings,
# then create the corresponding .{lang}.md frontmatter stubs in content/countries/.

LOCALE_STRINGS = {
    "en": {
        "is_a_country":         "is a country",
        "in":                   "in",
        "capital_intro":        "Its capital is",
        "anthem_intro":         "The national anthem is",
        "anthem_heading":       "## National Anthem",
        "english_title_label":  "**English title:**",
        "composer_label":       "**Composer:**",
        "lyricist_label":       "**Lyricist:**",
        "adopted_label":        "**Adopted:**",
        "learn_more":           "Learn more on Wikidata",
        "listen_heading":       "## Listen",
        "recording_singular":   "audio recording available.",
        "recording_plural":     "audio recordings available.",
    },
    "es": {
        "is_a_country":         "es un país",
        "in":                   "en",
        "capital_intro":        "Su capital es",
        "anthem_intro":         "El himno nacional es",
        "anthem_heading":       "## Himno Nacional",
        "english_title_label":  "**Título en inglés:**",
        "composer_label":       "**Compositor:**",
        "lyricist_label":       "**Letrista:**",
        "adopted_label":        "**Adoptado:**",
        "learn_more":           "Más información en Wikidata",
        "listen_heading":       "## Escuchar",
        "recording_singular":   "grabación de audio disponible.",
        "recording_plural":     "grabaciones de audio disponibles.",
    },
}

# All supported locale suffixes (used to discover .{lang}.md files).
SUPPORTED_LOCALES = list(LOCALE_STRINGS.keys())


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


def get_frontmatter_field(frontmatter_text, field):
    """Extract a quoted field value from frontmatter."""
    m = re.search(rf'^{field}:\s*"([^"]*)"', frontmatter_text, re.MULTILINE)
    return m.group(1) if m else None


def get_frontmatter_iso(frontmatter_text):
    """Extract iso field value from frontmatter."""
    return get_frontmatter_field(frontmatter_text, "iso")


def build_content(country, locale="en"):
    """Build SEO markdown body content for a country page in the given locale."""
    s = LOCALE_STRINGS[locale]

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
            adopted = re.sub(r'^adopted\s+', '', history.strip(), flags=re.IGNORECASE)
        history = ""

    lines = []

    # Intro paragraph
    if region or subregion:
        location = f"{subregion}, {region}" if subregion else region
        location_phrase = f" {s['in']} {location}"
    else:
        location_phrase = ""

    if anthem_name:
        title_str = f' ("{anthem_title_en}")' if anthem_title_en else ""
        intro = f"**{name}** {s['is_a_country']}{location_phrase}."
        if capital:
            intro += f" {s['capital_intro']} {capital}."
        intro += f" {s['anthem_intro']} *{anthem_name}*{title_str}."
        lines.append(intro)
    else:
        intro = f"**{name}** {s['is_a_country']}{location_phrase}."
        if capital:
            intro += f" {s['capital_intro']} {capital}."
        lines.append(intro)

    lines.append("")

    # Anthem details section
    if anthem_name:
        lines.append(s["anthem_heading"])
        lines.append("")

        details = []
        if anthem_title_en:
            details.append(f"{s['english_title_label']} {anthem_title_en}")
        if composer:
            details.append(f"{s['composer_label']} {composer}")
        if lyricist:
            details.append(f"{s['lyricist_label']} {lyricist}")
        if adopted:
            details.append(f"{s['adopted_label']} {adopted}")
        for d in details:
            lines.append(d)
            lines.append("")

        if history:
            hist = history.strip()
            if len(hist) > 900:
                hist = hist[:900].rsplit(" ", 1)[0] + "…"
            lines.append(hist)
            lines.append("")

        if wikidata_id:
            lines.append(
                f'[{s["learn_more"]}](https://www.wikidata.org/wiki/{wikidata_id})'
            )
            lines.append("")

    # Audio section
    if audio_files:
        count = len(audio_files)
        noun = s["recording_singular"] if count == 1 else s["recording_plural"]
        lines.append(s["listen_heading"])
        lines.append("")
        lines.append(f"{count} {noun}")
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


def file_suffix_for_locale(locale):
    """Return the .md filename suffix for a locale (.md for en, .es.md for es, etc.)."""
    if locale == "en":
        return ".md"
    return f".{locale}.md"


def collect_md_files(locale, target_isos=None):
    """Collect country .md files for a given locale. Returns list of (filename, filepath)."""
    suffix = file_suffix_for_locale(locale)
    files = []
    for f in os.listdir(COUNTRIES_DIR):
        if not f.endswith(suffix):
            continue
        if f == "_index.md" or f.startswith("_index."):
            continue
        # For non-English locales, avoid matching a shorter suffix
        # e.g. ".md" should not match ".es.md"
        if locale == "en" and any(f.endswith(f".{lc}.md") for lc in SUPPORTED_LOCALES if lc != "en"):
            continue
        if target_isos:
            # Derive ISO from filename: e.g. "usa.es.md" → "USA", "usa.md" → "USA"
            base = f.replace(suffix, "").upper()
            if base not in target_isos:
                continue
        files.append((f, os.path.join(COUNTRIES_DIR, f)))
    return sorted(files, key=lambda x: x[0])


def process_locale(locale, iso_to_data, target_isos=None, dry_run=False):
    """Generate content for all country pages in a given locale."""
    suffix = file_suffix_for_locale(locale)
    files = collect_md_files(locale, target_isos)
    updated = 0
    skipped = 0
    no_data = 0

    for fname, fpath in files:
        with open(fpath, "r", encoding="utf-8") as f:
            text = f.read()

        frontmatter, _ = parse_md_frontmatter(text)
        iso = get_frontmatter_iso(frontmatter)
        if not iso:
            iso = fname.replace(suffix, "").upper()

        country_data = iso_to_data.get(iso)
        if not country_data:
            no_data += 1
            continue

        # Use the frontmatter title if available (may be localized)
        title = get_frontmatter_field(frontmatter, "title")
        if title:
            localized_data = dict(country_data)
            localized_data["common_name"] = title
        else:
            localized_data = country_data

        content = build_content(localized_data, locale=locale)

        if update_md_file(fpath, content, dry_run=dry_run):
            updated += 1
            if dry_run and updated <= 3:
                print(f"\n--- Preview: {fname} ---")
                print(content[:400])
        else:
            skipped += 1

    return updated, skipped, no_data


def main():
    parser = argparse.ArgumentParser(description="Generate country page content from anthems.json")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    parser.add_argument("--iso", nargs="+", metavar="ISO", help="Only update specific ISO codes (e.g. USA GBR)")
    parser.add_argument(
        "--lang", nargs="+", metavar="LANG", default=SUPPORTED_LOCALES,
        help=f"Locales to generate (default: all). Choices: {', '.join(SUPPORTED_LOCALES)}",
    )
    args = parser.parse_args()

    # Validate locales
    for lang in args.lang:
        if lang not in LOCALE_STRINGS:
            print(f"ERROR: unsupported locale '{lang}'. Available: {', '.join(SUPPORTED_LOCALES)}")
            sys.exit(1)

    print(f"Loading anthem data from {ANTHEMS_JSON}")
    anthems = load_anthems()
    print(f"  {len(anthems)} countries loaded")

    iso_to_data = {k.upper(): v for k, v in anthems.items()}
    target_isos = {iso.upper() for iso in args.iso} if args.iso else None

    for locale in args.lang:
        print(f"\n── {locale} ──")
        updated, skipped, no_data = process_locale(
            locale, iso_to_data, target_isos=target_isos, dry_run=args.dry_run
        )
        action = "Would update" if args.dry_run else "Updated"
        print(f"  {action}: {updated} files")
        if no_data:
            print(f"  No anthem data: {no_data} files")
        if skipped:
            print(f"  Skipped (no frontmatter): {skipped} files")

    if args.dry_run:
        print("\nRe-run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()

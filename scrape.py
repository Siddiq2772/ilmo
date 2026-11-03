
import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag


# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL = "https://ytubeinfluencers.com/category/islam/"

EXPECTED_CHANNELS = 962
DEFAULT_PAGE_COUNT = 49

OUTPUT_DIR = Path(__file__).resolve().parent
CACHE_DIR = OUTPUT_DIR / "page_cache"

CSV_FILE = OUTPUT_DIR / "islam_channels.csv"
JSON_FILE = OUTPUT_DIR / "islam_channels.json"
REPORT_FILE = OUTPUT_DIR / "scrape_report.json"

REFRESH_CACHE = "--refresh" in sys.argv

REQUEST_DELAY = 1.0
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9"
}


CSV_FIELDS = [
    "rank",
    "channel_name",
    "handle",
    "channel_url",
    "country",
    "subscribers",
    "total_views",
    "video_count",
    "profile_description",
    "detailed_description",
    "unique_value",
    "upload_frequency",
    "language",
    "target_audience",
    "content_formats",
    "primary_topics",
    "tags",
    "featured_video_title",
    "featured_video_duration",
    "featured_video_stats",
    "profile_image_url",
    "featured_video_thumbnail_url",
    "source_page"
]


# ============================================================
# TEXT UTILITIES
# ============================================================

LABELS = {
    "subscribers",
    "total views",
    "videos",
    "what makes this channel unique",
    "target audience",
    "content formats",
    "primary topics",
    "show more",
    "view channel",
    "previous",
    "next"
}


def clean(value):
    """Normalize whitespace in extracted text."""

    return re.sub(
        r"\s+",
        " ",
        str(value or "")
    ).strip()


def normalize_label(value):
    return clean(value).casefold().rstrip(":")


def get_text_items(node):
    """
    Extract individual text nodes.

    This is important because the website displays
    content formats and primary topics as separate chips.
    """

    return [
        clean(value)
        for value in node.stripped_strings
        if clean(value)
    ]


def find_label_index(values, label):
    """Find a section label without case sensitivity."""

    target = normalize_label(label)

    for index, value in enumerate(values):

        if normalize_label(value) == target:
            return index

    return None


def get_value_after(values, label):
    """Get the first value after a metadata label."""

    index = find_label_index(values, label)

    if index is None:
        return ""

    for value in values[index + 1:]:

        if normalize_label(value) not in LABELS:
            return value

    return ""


def extract_section(values, start_label, end_label=None):
    """
    Extract text between two section labels.

    Example:
        Target Audience -> Content Formats
    """

    start = find_label_index(values, start_label)

    if start is None:
        return []

    end = None

    if end_label:
        end = find_label_index(values, end_label)

    if end is None:
        end = len(values)

    result = []

    for value in values[start + 1:end]:

        value = clean(value)

        if not value:
            continue

        if normalize_label(value) in LABELS:
            continue

        result.append(value)

    return result


def extract_chips(values):
    """
    Preserve individual website labels as arrays.

    Handles both separate HTML elements and
    labels separated by common delimiters.
    """

    result = []

    for value in values:

        parts = re.split(
            r"\s*[|;•]\s*",
            clean(value)
        )

        for part in parts:

            part = clean(part)

            if not part:
                continue

            if normalize_label(part) in LABELS:
                continue

            if part not in result:
                result.append(part)

    return result


# ============================================================
# UPLOAD FREQUENCY DETECTION
# ============================================================

FREQUENCY_RE = re.compile(
    r"""
    \b(
        daily |
        weekly |
        bi[\s-]?weekly |
        fortnightly |
        monthly |
        quarterly |
        yearly |
        annually |
        irregular |
        multiple\s+times |
        several\s+times |
        every\s+\d+ |
        per\s+(?:day|week|month|year) |
        videos?\s+(?:per|a)\s+(?:day|week|month|year) |
        uploads?\s+(?:per|a)\s+(?:day|week|month|year)
    )\b
    """,
    re.I | re.X
)


def extract_unique_frequency_language(values):
    """
    Extract three fields from the section:

    1. Unique description
    2. Upload frequency
    3. Language

    Language is optional because some channel profiles
    do not display it.
    """

    frequency_index = None

    # Skip the first item because it normally contains
    # the actual unique channel description.

    for index, value in enumerate(values):

        if index == 0:
            continue

        if FREQUENCY_RE.search(value):
            frequency_index = index
            break

    if frequency_index is None:

        return {
            "unique_value": " ".join(values),
            "upload_frequency": "",
            "language": ""
        }

    unique_value = " ".join(
        values[:frequency_index]
    )

    frequency = values[frequency_index]

    remaining = values[frequency_index + 1:]

    language = " ".join(remaining)

    return {
        "unique_value": clean(unique_value),
        "upload_frequency": clean(frequency),
        "language": clean(language)
    }


# ============================================================
# IMAGE EXTRACTION
# ============================================================

def get_image_url(img, page_url):

    if not img:
        return ""

    possible_attributes = [
        "src",
        "data-src",
        "data-lazy-src",
        "data-original"
    ]

    for attribute in possible_attributes:

        value = img.get(attribute)

        if value and not str(value).startswith("data:"):

            return urljoin(
                page_url,
                str(value)
            )

    return ""


# ============================================================
# CHANNEL CARD DETECTION
# ============================================================

def find_channel_card(heading):
    """
    Find the smallest parent containing one channel card.

    The card must contain:
    - Channel heading
    - Subscribers information
    - YouTube handle
    - View Channel link
    """

    for parent in heading.parents:

        if not isinstance(parent, Tag):
            continue

        if parent.name in ("body", "html"):
            break

        text = parent.get_text(" ", strip=True)

        if "Subscribers" not in text:
            continue

        links = parent.find_all("a", href=True)

        has_view_link = any(
            "view channel" in clean(
                link.get_text(" ", strip=True)
            ).casefold()
            for link in links
        )

        if not has_view_link:
            continue

        if not re.search(
            r"(?<!\S)@[A-Za-z0-9._-]{2,}",
            text
        ):
            continue

        headings = parent.find_all(
            ["h2", "h3"]
        )

        if len(headings) == 1:
            return parent

    return None


# ============================================================
# CHANNEL CARD PARSER
# ============================================================

def parse_channel_card(heading, card, page_url):

    values = get_text_items(card)

    name = clean(
        heading.get_text(" ", strip=True)
    )

    if not name:
        return None

    flat_text = card.get_text(
        " ",
        strip=True
    )

    # --------------------------------------------------------
    # CHANNEL HANDLE
    # --------------------------------------------------------

    handle_match = re.search(
        r"(?<!\S)@[A-Za-z0-9._-]{2,}",
        flat_text
    )

    handle = (
        handle_match.group(0)
        if handle_match
        else ""
    )

    # --------------------------------------------------------
    # YOUTUBE CHANNEL URL
    # --------------------------------------------------------

    channel_link = None

    for anchor in card.find_all("a", href=True):

        anchor_text = clean(
            anchor.get_text(" ", strip=True)
        ).casefold()

        if "view channel" in anchor_text:

            channel_link = anchor
            break

    channel_url = ""

    if channel_link:

        channel_url = urljoin(
            page_url,
            channel_link["href"]
        )

    # --------------------------------------------------------
    # RANK
    # --------------------------------------------------------

    rank = ""

    for index, value in enumerate(values):

        if (
            value == name
            and index > 0
            and re.fullmatch(
                r"\d{1,4}",
                values[index - 1]
            )
        ):

            rank = values[index - 1]
            break

    # --------------------------------------------------------
    # COUNTRY AND SHORT DESCRIPTION
    # --------------------------------------------------------

    subscribers_index = find_label_index(
        values,
        "Subscribers"
    )

    handle_index = next(
        (
            index
            for index, value in enumerate(values)
            if handle and handle in value
        ),
        None
    )

    country = ""
    profile_description = ""

    if (
        handle_index is not None
        and subscribers_index is not None
        and subscribers_index > handle_index
    ):

        profile_parts = values[
            handle_index + 1:subscribers_index
        ]

        if profile_parts:

            country = profile_parts[-1]

            profile_description = " ".join(
                profile_parts[:-1]
            )

    # --------------------------------------------------------
    # BASIC STATISTICS
    # --------------------------------------------------------

    subscribers = get_value_after(
        values,
        "Subscribers"
    )

    total_views = get_value_after(
        values,
        "Total Views"
    )

    video_count = get_value_after(
        values,
        "Videos"
    )

    # --------------------------------------------------------
    # PROFILE IMAGE
    # --------------------------------------------------------

    profile_img = None

    for img in card.find_all("img"):

        alt = clean(
            img.get("alt", "")
        ).casefold()

        if "profile picture" in alt:

            profile_img = img
            break

    profile_image_url = get_image_url(
        profile_img,
        page_url
    )

    # --------------------------------------------------------
    # FEATURED VIDEO
    # --------------------------------------------------------

    thumbnail_img = None

    for img in card.find_all("img"):

        alt = clean(
            img.get("alt", "")
        ).casefold()

        if "thumbnail" in alt:

            thumbnail_img = img
            break

    thumbnail_url = get_image_url(
        thumbnail_img,
        page_url
    )

    video_heading = card.find("h4")

    featured_video_title = ""

    if video_heading:

        featured_video_title = clean(
            video_heading.get_text(" ", strip=True)
        )

    featured_video_duration = ""

    for value in values:

        if re.fullmatch(
            r"\d{1,2}:\d{2}(?::\d{2})?",
            value
        ):

            featured_video_duration = value
            break

    featured_video_stats = ""

    for value in values:

        if re.search(
            r"(?:views|view|unknown views).*\bago\b",
            value,
            re.I
        ):

            featured_video_stats = value
            break

    # --------------------------------------------------------
    # DETAILED CHANNEL DESCRIPTION
    # --------------------------------------------------------

    detailed_description = ""

    show_more_index = find_label_index(
        values,
        "Show more"
    )

    if show_more_index is not None:

        start_index = 0

        if (
            featured_video_stats
            and featured_video_stats in values
        ):

            start_index = (
                values.index(featured_video_stats) + 1
            )

        description_parts = values[
            start_index:show_more_index
        ]

        description_parts = [
            value
            for value in description_parts
            if normalize_label(value) not in LABELS
            and value != name
        ]

        detailed_description = " ".join(
            description_parts
        )

    # --------------------------------------------------------
    # UNIQUE VALUE, UPLOAD FREQUENCY, LANGUAGE
    # --------------------------------------------------------

    unique_section = extract_section(
        values,
        "What Makes This Channel Unique",
        "Target Audience"
    )

    unique_data = extract_unique_frequency_language(
        unique_section
    )

    unique_value = unique_data["unique_value"]

    upload_frequency = unique_data[
        "upload_frequency"
    ]

    language = unique_data["language"]

    # --------------------------------------------------------
    # TARGET AUDIENCE
    # --------------------------------------------------------

    audience_parts = extract_section(
        values,
        "Target Audience",
        "Content Formats"
    )

    target_audience = " ".join(
        audience_parts
    )

    # --------------------------------------------------------
    # CONTENT FORMATS
    # --------------------------------------------------------

    content_format_parts = extract_section(
        values,
        "Content Formats",
        "Primary Topics"
    )

    content_formats = extract_chips(
        content_format_parts
    )

    # --------------------------------------------------------
    # PRIMARY TOPICS
    # --------------------------------------------------------

    topic_parts = extract_section(
        values,
        "Primary Topics"
    )

    primary_topics = extract_chips(
        topic_parts
    )

    # The website's actual topic labels become tags.
    tags = primary_topics.copy()

    # --------------------------------------------------------
    # FINAL CHANNEL RECORD
    # --------------------------------------------------------

    return {

        "rank": rank,

        "channel_name": name,

        "handle": handle,

        "channel_url": channel_url,

        "country": country,

        "subscribers": subscribers,

        "total_views": total_views,

        "video_count": video_count,

        "profile_description": profile_description,

        "detailed_description": detailed_description,

        "unique_value": unique_value,

        "upload_frequency": upload_frequency,

        "language": language,

        "target_audience": target_audience,

        "content_formats": content_formats,

        "primary_topics": primary_topics,

        "tags": tags,

        "featured_video_title": featured_video_title,

        "featured_video_duration": featured_video_duration,

        "featured_video_stats": featured_video_stats,

        "profile_image_url": profile_image_url,

        "featured_video_thumbnail_url": thumbnail_url,

        "source_page": page_url
    }


# ============================================================
# PAGE PARSER
# ============================================================

def parse_page(html, page_url):

    soup = BeautifulSoup(
        html,
        "html.parser"
    )

    channels = []
    seen = set()

    for heading in soup.find_all(["h2", "h3"]):

        card = find_channel_card(heading)

        if card is None:
            continue

        record = parse_channel_card(
            heading,
            card,
            page_url
        )

        if not record:
            continue

        key = (
            record["handle"]
            or record["channel_name"]
        ).casefold()

        if key in seen:
            continue

        seen.add(key)
        channels.append(record)

    return channels


# ============================================================
# HTTP AND PAGE CACHE
# ============================================================

def create_session():

    session = requests.Session()

    session.headers.update(HEADERS)

    return session


def fetch_page(session, page_number):

    CACHE_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    cache_file = CACHE_DIR / (
        f"page_{page_number:02}.html"
    )

    # Reuse existing HTML files unless --refresh is used.

    if cache_file.exists() and not REFRESH_CACHE:

        print(
            f"  Using cached page {page_number}"
        )

        return cache_file.read_text(
            encoding="utf-8"
        )

    if page_number == 1:

        url = BASE_URL

    else:

        url = urljoin(
            BASE_URL,
            f"page/{page_number}/"
        )

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):

        try:

            response = session.get(
                url,
                timeout=45
            )

            response.raise_for_status()

            html = response.text

            if (
                "Subscribers" not in html
                or "View Channel" not in html
            ):

                raise RuntimeError(
                    "Response does not look like a channel page."
                )

            cache_file.write_text(
                html,
                encoding="utf-8"
            )

            return html

        except Exception as error:

            last_error = error

            print(
                f"  Attempt {attempt}/{MAX_RETRIES} failed: {error}"
            )

            if attempt < MAX_RETRIES:

                time.sleep(attempt * 2)

    raise RuntimeError(
        f"Could not download page {page_number}: {last_error}"
    )


# ============================================================
# PAGE COUNT
# ============================================================

def detect_page_count(html):

    soup = BeautifulSoup(
        html,
        "html.parser"
    )

    text = soup.get_text(
        " ",
        strip=True
    )

    match = re.search(
        r"Page\s*1\s*of\s*(\d+)",
        text,
        re.I
    )

    if match:

        return int(match.group(1))

    return DEFAULT_PAGE_COUNT


# ============================================================
# OUTPUT GENERATION
# ============================================================

def save_results(records, failed_pages, total_pages):

    # --------------------------------------------------------
    # JSON
    # --------------------------------------------------------

    with open(
        JSON_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            records,
            file,
            ensure_ascii=False,
            indent=2
        )

    # --------------------------------------------------------
    # CSV
    # --------------------------------------------------------

    with open(
        CSV_FILE,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=CSV_FIELDS,
            extrasaction="ignore"
        )

        writer.writeheader()

        for record in records:

            row = record.copy()

            # Convert arrays to readable CSV strings.

            row["tags"] = " | ".join(
                row.get("tags", [])
            )

            row["primary_topics"] = " | ".join(
                row.get("primary_topics", [])
            )

            row["content_formats"] = " | ".join(
                row.get("content_formats", [])
            )

            writer.writerow(row)

    # --------------------------------------------------------
    # FIELD COMPLETENESS REPORT
    # --------------------------------------------------------

    important_fields = [
        "upload_frequency",
        "language",
        "target_audience",
        "content_formats",
        "primary_topics"
    ]

    field_coverage = {}

    for field in important_fields:

        count = sum(
            1 for record in records
            if record.get(field)
        )

        field_coverage[field] = {
            "filled": count,
            "missing": len(records) - count,
            "percentage": round(
                count / len(records) * 100,
                2
            ) if records else 0
        }

    # --------------------------------------------------------
    # EXECUTION REPORT
    # --------------------------------------------------------

    report = {

        "source": BASE_URL,

        "expected_channels": EXPECTED_CHANNELS,

        "pages_expected": total_pages,

        "pages_failed": failed_pages,

        "pages_failed_count": len(failed_pages),

        "channels_collected": len(records),

        "channels_remaining": max(
            0,
            EXPECTED_CHANNELS - len(records)
        ),

        "complete": (
            len(records) == EXPECTED_CHANNELS
            and not failed_pages
        ),

        "field_coverage": field_coverage,

        "tag_source": "Website Primary Topics",

        "content_format_source": "Website Content Formats",

        "cache_used": not REFRESH_CACHE
    }

    with open(
        REPORT_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            report,
            file,
            ensure_ascii=False,
            indent=2
        )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 60)
    print("       YTUBE INFLUENCERS - ISLAM SCRAPER")
    print("=" * 60)

    print(f"Source: {BASE_URL}")

    print(f"Expected channels: {EXPECTED_CHANNELS}")

    print(
        "Cache mode:",
        "REFRESH" if REFRESH_CACHE else "REUSE"
    )

    print("=" * 60)

    session = create_session()

    # --------------------------------------------------------
    # FIRST PAGE
    # --------------------------------------------------------

    print("\nConnecting to website...\n")

    try:

        first_html = fetch_page(
            session,
            1
        )

    except Exception as error:

        print("\nFATAL ERROR:", error)

        print(
            "\nCheck your internet connection or website availability."
        )

        return

    total_pages = detect_page_count(
        first_html
    )

    print(
        f"Detected {total_pages} pages.\n"
    )

    # --------------------------------------------------------
    # ALL PAGES
    # --------------------------------------------------------

    all_records = []
    failed_pages = []

    for page_number in range(
        1,
        total_pages + 1
    ):

        print(
            f"\n[PAGE {page_number}/{total_pages}]"
        )

        try:

            if page_number == 1:

                html = first_html

            else:

                html = fetch_page(
                    session,
                    page_number
                )

            url = (
                BASE_URL
                if page_number == 1
                else urljoin(
                    BASE_URL,
                    f"page/{page_number}/"
                )
            )

            page_records = parse_page(
                html,
                url
            )

            all_records.extend(
                page_records
            )

            print(
                f"Channels found: {len(page_records)}"
            )

            print(
                f"Total collected: {len(all_records)}"
            )

        except Exception as error:

            print(
                f"PAGE FAILED: {error}"
            )

            failed_pages.append({

                "page": page_number,

                "error": str(error)

            })

        # Save progress after every page.

        unique_records = {}

        for record in all_records:

            key = (
                record["handle"]
                or record["channel_name"]
            ).casefold()

            if key and key not in unique_records:

                unique_records[key] = record

        all_records = list(
            unique_records.values()
        )

        save_results(
            all_records,
            failed_pages,
            total_pages
        )

        if page_number < total_pages:

            time.sleep(REQUEST_DELAY)

    # --------------------------------------------------------
    # FINAL RESULTS
    # --------------------------------------------------------

    print("\n")
    print("=" * 60)
    print("                SCRAPING FINISHED")
    print("=" * 60)

    print(
        f"Expected channels : {EXPECTED_CHANNELS}"
    )

    print(
        f"Collected channels: {len(all_records)}"
    )

    print(
        f"Failed pages      : {len(failed_pages)}"
    )

    print("-" * 60)

    print("\nGenerated files:\n")

    print(f"CSV  : {CSV_FILE}")

    print(f"JSON : {JSON_FILE}")

    print(f"Report: {REPORT_FILE}")

    print(f"Cache: {CACHE_DIR}")

    # --------------------------------------------------------
    # CHECK IMPORTANT METADATA
    # --------------------------------------------------------

    print("\nIMPORTANT FIELD COVERAGE\n")

    for field in [
        "upload_frequency",
        "language",
        "target_audience",
        "content_formats",
        "primary_topics"
    ]:

        filled = sum(
            1 for r in all_records
            if r.get(field)
        )

        print(
            f"{field:22} : {filled}/{len(all_records)}"
        )

    print("\n" + "=" * 60)

    if (
        len(all_records) == EXPECTED_CHANNELS
        and not failed_pages
    ):

        print("SUCCESS: All expected channels collected!")

    else:

        print(
            "WARNING: Collection is incomplete or some pages failed."
        )

        print(
            "Check scrape_report.json for details."
        )

    print("=" * 60)


if __name__ == "__main__":

    main()

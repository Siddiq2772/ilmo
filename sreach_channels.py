
import argparse
import csv
import json
import re
import threading
import time
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from itertools import islice
from pathlib import Path
from urllib.parse import quote_plus

from yt_dlp import YoutubeDL


# =========================
# CONFIGURATION
# =========================

INPUT_FILE = Path("speakers.txt")
CSV_FILE = Path("youtube_channel_candidates.csv")
JSON_FILE = Path("youtube_channel_candidates.json")

MAX_RESULTS = 5
DELAY = 1.0
VIDEO_DELAY = 0.5

FIELDS = [
    "speaker",
    "channel_name",
    "channel_url",
    "channel_id",
    "subscribers",
    "verified",
    "similarity",
    "match_status",
    "youtube_search_url",

    # Channel information
    "channel_description",

    # Latest video information
    "recent_video_title",
    "recent_video_description",
    "recent_video_url",
    "recent_video_id",
    "recent_video_upload_date",
    "recent_video_status",
    "recent_video_error",
]

SUCCESS_STATUSES = {"OK", "NO_UPLOADS", "NO_CHANNEL"}


# =========================
# HELPERS
# =========================

def normalize(text):
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(
        c for c in text
        if not unicodedata.combining(c)
    )
    text = text.lower()

    return re.sub(
        r"[^a-z0-9]+",
        " ",
        text
    ).strip()


def similarity(a, b):
    return SequenceMatcher(
        None,
        normalize(a),
        normalize(b)
    ).ratio()


def get_channel_url(entry):
    channel_id = (
        entry.get("channel_id")
        or (
            entry.get("id", "")
            if str(entry.get("id", "")).startswith("UC")
            else ""
        )
    )

    if channel_id and str(channel_id).startswith("UC"):
        return (
            f"https://www.youtube.com/channel/{channel_id}"
        )

    url = (
        entry.get("channel_url")
        or entry.get("uploader_url")
        or entry.get("url")
        or ""
    )

    if url.startswith("/"):
        url = "https://www.youtube.com" + url

    elif url.startswith("@"):
        url = "https://www.youtube.com/" + url

    return url


def make_search_url(speaker):
    return (
        "https://www.youtube.com/results?"
        f"search_query={quote_plus(speaker)}"
        "&sp=EgIQAg%253D%253D"
    )


def empty_video_details(status="NO_CHANNEL", error=""):
    return {
        "channel_description": "",
        "recent_video_title": "",
        "recent_video_description": "",
        "recent_video_url": "",
        "recent_video_id": "",
        "recent_video_upload_date": "",
        "recent_video_status": status,
        "recent_video_error": error,
    }


# =========================
# READ SPEAKERS
# =========================

def read_names():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            "Create speakers.txt and paste the names first."
        )

    names = []
    seen = set()

    for line in INPUT_FILE.read_text(
        encoding="utf-8-sig"
    ).splitlines():

        name = line.strip()

        name = re.sub(
            r"^\s*[-*•]\s*",
            "",
            name
        ).strip()

        if not name:
            continue

        key = normalize(name)

        if key and key not in seen:
            names.append(name)
            seen.add(key)

    return names


# =========================
# SEARCH YOUTUBE CHANNELS
# =========================

def search_speaker(ydl, speaker):

    search_url = make_search_url(speaker)

    info = ydl.extract_info(
        search_url,
        download=False
    )

    entries = list(
        islice(
            info.get("entries") or [],
            MAX_RESULTS
        )
    )

    results = []

    for entry in entries:

        if not entry:
            continue

        channel_name = (
            entry.get("title")
            or entry.get("channel")
            or entry.get("uploader")
            or ""
        )

        if not channel_name:
            continue

        channel_id = (
            entry.get("channel_id")
            or (
                entry.get("id", "")
                if str(entry.get("id", "")).startswith("UC")
                else ""
            )
        )

        score = similarity(
            speaker,
            channel_name
        )

        if normalize(speaker) == normalize(channel_name):
            status = "EXACT"

        elif score >= 0.65:
            status = "LIKELY"

        else:
            status = "REVIEW"

        results.append({
            "speaker": speaker,
            "channel_name": channel_name,
            "channel_url": get_channel_url(entry),
            "channel_id": channel_id,

            "subscribers": entry.get(
                "channel_follower_count", ""
            ),

            "verified": entry.get(
                "channel_is_verified", ""
            ),

            "similarity": round(score * 100, 1),
            "match_status": status,
            "youtube_search_url": search_url,

            "channel_description": (
                entry.get("channel_description")
                or entry.get("description")
                or ""
            ),

            "recent_video_title": "",
            "recent_video_description": "",
            "recent_video_url": "",
            "recent_video_id": "",
            "recent_video_upload_date": "",
            "recent_video_status": "",
            "recent_video_error": "",
        })

    return results


# =========================
# GET LATEST CHANNEL VIDEO
# =========================

def get_recent_video_details(candidate, ydl_options):

    channel_url = (
        candidate.get("channel_url")
        or get_channel_url(candidate)
    )

    if not channel_url:
        return empty_video_details("NO_CHANNEL")

    try:

        # Get the channel's Videos tab.
        videos_url = channel_url.rstrip("/") + "/videos"

        listing_options = dict(ydl_options)

        listing_options.update({
            "extract_flat": "in_playlist",
            "playlistend": 1,
        })

        with YoutubeDL(listing_options) as ydl:

            channel_info = ydl.extract_info(
                videos_url,
                download=False
            )

        channel_description = (
            channel_info.get("channel_description")
            or channel_info.get("description")
            or candidate.get("channel_description")
            or ""
        )

        subscribers = (
            channel_info.get("channel_follower_count")
            or candidate.get("subscribers")
            or ""
        )

        verified = channel_info.get("channel_is_verified")

        if verified is None:
            verified = candidate.get("verified", "")

        # Get the first upload returned by the Videos tab.
        entries = channel_info.get("entries") or []

        latest = next(
            (item for item in entries if item),
            None
        )

        if not latest:

            details = empty_video_details(
                "NO_UPLOADS"
            )

            details["channel_description"] = channel_description

            return {
                **details,
                "subscribers": subscribers,
                "verified": verified,
            } if False else details

        video_id = latest.get("id") or ""

        video_url = (
            latest.get("webpage_url")
            or latest.get("url")
            or ""
        )

        if not video_url and video_id:
            video_url = (
                f"https://www.youtube.com/watch?v={video_id}"
            )

        elif video_url and not video_url.startswith("http"):

            if video_url.startswith("/"):
                video_url = (
                    "https://www.youtube.com" + video_url
                )
            else:
                video_url = (
                    "https://www.youtube.com/watch?v="
                    + video_url
                )

        if not video_url:
            raise ValueError(
                "Could not obtain the latest video's URL."
            )

        # Extract the actual video information.
        # extract_flat=False is important because we need
        # the complete description, not just the video title.

        detail_options = dict(ydl_options)

        detail_options.update({
            "extract_flat": False,
            "noplaylist": True,
        })

        with YoutubeDL(detail_options) as video_ydl:

            video_info = video_ydl.extract_info(
                video_url,
                download=False
            )

        return {
            "channel_description": channel_description,

            "recent_video_title": (
                video_info.get("title") or ""
            ),

            "recent_video_description": (
                video_info.get("description") or ""
            ),

            "recent_video_url": (
                video_info.get("webpage_url")
                or video_url
            ),

            "recent_video_id": (
                video_info.get("id")
                or video_id
            ),

            "recent_video_upload_date": (
                video_info.get("upload_date")
                or video_info.get("release_date")
                or ""
            ),

            "recent_video_status": "OK",
            "recent_video_error": "",

            # Additional channel details are refreshed
            # by the caller when available.
        }

    except Exception as error:

        details = empty_video_details(
            status="ERROR",
            error=str(error)[:1000]
        )

        return details


# =========================
# ENRICH CHANNEL RECORD
# =========================

def enrich_candidate(candidate, ydl_options, video_delay=0):

    if not candidate.get("channel_url"):
        candidate.update(
            empty_video_details("NO_CHANNEL")
        )
        return candidate

    details = get_recent_video_details(
        candidate,
        ydl_options
    )

    candidate.update(details)

    if video_delay > 0:
        time.sleep(video_delay)

    return candidate


# =========================
# PROCESS ONE SPEAKER
# =========================

def process_speaker(
    speaker,
    index,
    total,
    ydl_options,
    delay,
    video_delay,
    lock,
    writer,
    file
):

    print(
        f"[{index}/{total}] Searching: {speaker}"
    )

    try:

        with YoutubeDL(ydl_options) as ydl:

            results = search_speaker(
                ydl,
                speaker
            )

        if not results:

            row = {
                field: ""
                for field in FIELDS
            }

            row.update({
                "speaker": speaker,
                "match_status": "NO_RESULTS",
                "similarity": 0,
                "youtube_search_url": make_search_url(speaker),
            })

            row.update(
                empty_video_details("NO_CHANNEL")
            )

            results = [row]

        else:

            # Fetch the latest upload for every candidate.
            for candidate_index, result in enumerate(results):

                print(
                    f"    [{index}/{total}] "
                    f"Fetching latest video: "
                    f"{result['channel_name']}"
                )

                enrich_candidate(
                    result,
                    ydl_options,
                    video_delay
                )

                # Store the refreshed channel URL if possible.
                if not result.get("channel_url"):
                    result["channel_url"] = get_channel_url(result)

        # Write all results safely.
        with lock:

            for result in results:
                writer.writerow(result)

            file.flush()

        print(
            f"[{index}/{total}] Completed '{speaker}' "
            f"({len(results)} candidate(s))"
        )

    except Exception as error:

        print(
            f"[{index}/{total}] ERROR for "
            f"'{speaker}': {error}"
        )

        row = {
            field: ""
            for field in FIELDS
        }

        row.update({
            "speaker": speaker,
            "similarity": 0,
            "match_status": "ERROR",
            "youtube_search_url": make_search_url(speaker),
            "recent_video_status": "ERROR",
            "recent_video_error": str(error)[:1000],
        })

        with lock:
            writer.writerow(row)
            file.flush()

    if delay > 0:
        time.sleep(delay)


# =========================
# CSV HELPERS
# =========================

def write_csv(path, rows):

    temp_path = path.with_suffix(
        path.suffix + ".tmp"
    )

    with temp_path.open(
        "w",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        writer = csv.DictWriter(
            file,
            fieldnames=FIELDS,
            extrasaction="ignore"
        )

        writer.writeheader()
        writer.writerows(rows)

    temp_path.replace(path)


def read_existing_csv():

    if not CSV_FILE.exists():
        return []

    with CSV_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        rows = []

        for old_row in reader:

            row = {
                field: old_row.get(field, "") or ""
                for field in FIELDS
            }

            if not row.get("channel_url"):
                row["channel_url"] = get_channel_url(row)

            rows.append(row)

    return rows


# =========================
# MAIN
# =========================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "Search YouTube channels and extract "
            "their latest video metadata."
        )
    )

    parser.add_argument(
        "-w",
        "--workers",
        type=int,
        default=2,
        help="Concurrent workers (default: 2)"
    )

    parser.add_argument(
        "-d",
        "--delay",
        type=float,
        default=DELAY,
        help="Delay between speakers (default: 1.0)"
    )

    parser.add_argument(
        "--video-delay",
        type=float,
        default=VIDEO_DELAY,
        help="Delay between video metadata requests (default: 0.5)"
    )

    args = parser.parse_args()

    args.workers = max(1, args.workers)

    names = read_names()

    print(f"\nTotal speakers: {len(names)}")

    print(
        f"Workers: {args.workers} | "
        f"Speaker delay: {args.delay}s | "
        f"Video delay: {args.video_delay}s"
    )

    # yt-dlp options for channel search.
    ydl_options = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
        "playlistend": MAX_RESULTS,
        "socket_timeout": 30,
        "retries": 2,
        "extractor_retries": 2,
        "ignoreerrors": False,
    }

    # =========================
    # RESUME EXISTING CSV
    # =========================

    existing_rows = read_existing_csv()

    if existing_rows:

        print(
            f"\nExisting candidate records: "
            f"{len(existing_rows)}"
        )

        # Old CSV files may not have recent-video fields.
        # Backfill missing information without searching
        # for the same speakers again.

        todo_indices = [
            index
            for index, row in enumerate(existing_rows)
            if row.get("recent_video_status") not in SUCCESS_STATUSES
        ]

        if todo_indices:

            print(
                f"Fetching latest videos for "
                f"{len(todo_indices)} existing records..."
            )

            with ThreadPoolExecutor(
                max_workers=args.workers
            ) as executor:

                futures = {
                    executor.submit(
                        enrich_candidate,
                        existing_rows[index],
                        ydl_options,
                        args.video_delay
                    ): index

                    for index in todo_indices
                }

                for completed_count, future in enumerate(
                    as_completed(futures),
                    1
                ):

                    index = futures[future]

                    try:
                        existing_rows[index] = future.result()

                    except Exception as error:
                        existing_rows[index].update(
                            empty_video_details(
                                "ERROR",
                                str(error)[:1000]
                            )
                        )

                    if completed_count % 25 == 0:
                        print(
                            f"Backfilled "
                            f"{completed_count}/"
                            f"{len(todo_indices)} records"
                        )

        # Group records by speaker.
        grouped = defaultdict(list)

        for row in existing_rows:
            grouped[row["speaker"]].append(row)

        completed = {
            speaker
            for speaker, rows in grouped.items()
            if all(
                row.get("match_status") != "ERROR"
                and row.get("recent_video_status") in SUCCESS_STATUSES
                for row in rows
            )
        }

        # Remove incomplete old records before retrying
        # those speakers, preventing duplicate CSV entries.
        pending = [
            name
            for name in names
            if name not in completed
        ]

        pending_set = set(pending)

        existing_rows = [
            row
            for row in existing_rows
            if row["speaker"] not in pending_set
        ]

        write_csv(
            CSV_FILE,
            existing_rows
        )

    else:

        completed = set()
        pending = names

    print(
        f"\nPending speakers: {len(pending)}"
    )

    print(
        f"Already completed: {len(completed)}"
    )

    if not pending:
        print(
            "\nAll speakers have already been processed!"
        )

    else:

        lock = threading.Lock()

        new_file = not CSV_FILE.exists()

        with CSV_FILE.open(
            "a",
            encoding="utf-8-sig",
            newline=""
        ) as file:

            writer = csv.DictWriter(
                file,
                fieldnames=FIELDS,
                extrasaction="ignore"
            )

            if new_file:
                writer.writeheader()
                file.flush()

            if args.workers > 1:

                with ThreadPoolExecutor(
                    max_workers=args.workers
                ) as executor:

                    futures = [

                        executor.submit(
                            process_speaker,
                            speaker,
                            index,
                            len(pending),
                            ydl_options,
                            args.delay,
                            args.video_delay,
                            lock,
                            writer,
                            file
                        )

                        for index, speaker in enumerate(
                            pending,
                            1
                        )
                    ]

                    for future in as_completed(futures):
                        try:
                            future.result()

                        except Exception as error:
                            print(
                                f"Worker error: {error}"
                            )

            else:

                for index, speaker in enumerate(
                    pending,
                    1
                ):

                    process_speaker(
                        speaker,
                        index,
                        len(pending),
                        ydl_options,
                        args.delay,
                        args.video_delay,
                        lock,
                        writer,
                        file
                    )

    # =========================
    # GENERATE FINAL JSON
    # =========================

    with CSV_FILE.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        all_results = list(
            csv.DictReader(file)
        )

    JSON_FILE.write_text(
        json.dumps(
            all_results,
            indent=2,
            ensure_ascii=False
        ),
        encoding="utf-8"
    )

    print("\n========== COMPLETE ==========")

    print(f"Input speakers: {len(names)}")

    print(
        f"Candidate records: {len(all_results)}"
    )

    successful = sum(
        1 for row in all_results
        if row.get("recent_video_status") == "OK"
    )

    failed = sum(
        1 for row in all_results
        if row.get("recent_video_status") == "ERROR"
    )

    print(f"Latest videos extracted: {successful}")
    print(f"Video extraction errors: {failed}")

    print(f"\nCSV: {CSV_FILE.resolve()}")
    print(f"JSON: {JSON_FILE.resolve()}")


if __name__ == "__main__":
    main()

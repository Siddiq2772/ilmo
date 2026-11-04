#!/usr/bin/env python3
"""
fetch_feeds.py - YouTube Video Feed Ingestion Pipeline

Fetches the latest videos from Islamic YouTube channels defined in channels.json,
deduplicates them with existing records in videos.json, sorts them newest first,
and writes the updated database atomically.
"""

import os
import sys
import json
import time
import socket
import re
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

# Force UTF-8 on Windows terminal output to prevent charmap crashes
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Ensure IPv4 resolution preference (YouTube RSS endpoints can fail over IPv6 on certain networks)
_orig_getaddrinfo = socket.getaddrinfo

def _ipv4_getaddrinfo(host, port, family=0, socktype=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, socktype, proto, flags)

socket.getaddrinfo = _ipv4_getaddrinfo

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHANNELS_FILE = os.path.join(BASE_DIR, "channels.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "videos.json")
TMP_OUTPUT_FILE = os.path.join(BASE_DIR, "videos.json.tmp")

# Request settings
TIMEOUT = 12
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# XML Namespaces used in YouTube Atom feeds
NAMESPACES = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
    "media": "http://search.yahoo.com/mrss/"
}


def load_channels(filepath):
    """Loads target channels from channels.json."""
    if not os.path.exists(filepath):
        print(f"[ERROR] Channels configuration not found: {filepath}")
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to read {filepath}: {e}")
        return []


def load_existing_videos(filepath):
    """Loads existing videos into a dictionary indexed by video ID for deduplication."""
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return {}
            data = json.loads(content)
            if isinstance(data, list):
                return {v["id"]: v for v in data if isinstance(v, dict) and "id" in v}
    except Exception as e:
        print(f"[WARN] Failed to load existing {filepath}: {e}. Starting fresh.")
    return {}


def fetch_url(url):
    """Fetches text content from a URL with browser headers and timeout."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", errors="ignore")


def is_valid_video_id(vid):
    """Validates that an ID is a genuine 11-char YouTube video ID, not a playlist."""
    return bool(vid and len(vid) == 11 and not vid.startswith(('PL', 'OL', 'FL')) and re.match(r'^[a-zA-Z0-9_-]{11}$', vid))


def parse_rss_feed(xml_content, channel_meta):
    """Parses Atom/RSS XML string from YouTube into structured video dictionaries."""
    videos = []
    root = ET.fromstring(xml_content)
    
    entries = root.findall("atom:entry", NAMESPACES)
    for entry in entries:
        video_id_el = entry.find("yt:videoId", NAMESPACES)
        title_el = entry.find("atom:title", NAMESPACES)
        published_el = entry.find("atom:published", NAMESPACES)
        desc_el = entry.find("media:group/media:description", NAMESPACES)
        thumb_el = entry.find("media:group/media:thumbnail", NAMESPACES)

        video_id = video_id_el.text.strip() if video_id_el is not None and video_id_el.text else None
        if not video_id or not is_valid_video_id(video_id):
            continue

        title = title_el.text.strip() if title_el is not None and title_el.text else "Untitled"
        published_at = published_el.text.strip() if published_el is not None and published_el.text else ""
        description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
        
        thumbnail = (
            thumb_el.attrib.get("url")
            if thumb_el is not None and "url" in thumb_el.attrib
            else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        )

        videos.append({
            "id": video_id,
            "title": title,
            "channelId": channel_meta.get("id", ""),
            "channel": channel_meta.get("name", ""),
            "category": channel_meta.get("category", "General"),
            "publishedAt": published_at,
            "thumbnail": thumbnail,
            "description": description
        })
    return videos


def extract_from_channel_page(html_content, channel_meta):
    """Fallback extractor: scrapes recent videos from channel page via ytInitialData."""
    videos = []

    # Auto-discover channelId if not already known
    if not channel_meta.get("id"):
        m_cid = re.search(r'externalId":"(UC[a-zA-Z0-9_-]{22})"', html_content)
        if not m_cid:
            m_cid = re.search(r'"browseId":"(UC[a-zA-Z0-9_-]{22})"', html_content)
        if m_cid:
            channel_meta["id"] = m_cid.group(1)

    m = re.search(r'var ytInitialData\s*=\s*({.*?});</script>', html_content)
    if not m:
        m = re.search(r'ytInitialData\s*=\s*({.*?});', html_content)
    if not m:
        return videos

    try:
        data = json.loads(m.group(1))
    except Exception:
        return videos

    # Find videos from lockupViewModel or videoRenderer anywhere in JSON
    def search_items(obj):
        found = []
        if isinstance(obj, dict):
            # Modern YouTube lockupViewModel (2024-2026)
            if "lockupViewModel" in obj:
                lvm = obj["lockupViewModel"]
                cid = lvm.get("contentId")
                meta = lvm.get("metadata", {}).get("lockupMetadataViewModel", {})
                title = meta.get("title", {}).get("content", "")
                if cid and title and is_valid_video_id(cid):
                    found.append({
                        "id": cid,
                        "title": title,
                        "channelId": channel_meta.get("id", ""),
                        "channel": channel_meta.get("name", ""),
                        "category": channel_meta.get("category", "General"),
                        "publishedAt": datetime.now(timezone.utc).isoformat(),
                        "thumbnail": f"https://i.ytimg.com/vi/{cid}/hqdefault.jpg",
                        "description": ""
                    })
            # Classic videoRenderer / gridVideoRenderer
            elif "videoRenderer" in obj:
                vr = obj["videoRenderer"]
                vid = vr.get("videoId")
                title = vr.get("title", {}).get("runs", [{}])[0].get("text", "")
                if vid and title and is_valid_video_id(vid):
                    found.append({
                        "id": vid,
                        "title": title,
                        "channelId": channel_meta.get("id", ""),
                        "channel": channel_meta.get("name", ""),
                        "category": channel_meta.get("category", "General"),
                        "publishedAt": datetime.now(timezone.utc).isoformat(),
                        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                        "description": ""
                    })
            for v in obj.values():
                found.extend(search_items(v))
        elif isinstance(obj, list):
            for item in obj:
                found.extend(search_items(item))
        return found

    extracted = search_items(data)
    # Deduplicate within page
    seen = set()
    for v in extracted:
        if v["id"] not in seen:
            seen.add(v["id"])
            videos.append(v)
    return videos


def fetch_channel_videos(channel_meta):
    """Fetches videos for a single channel using RSS first, falling back to channel page."""
    channel_id = channel_meta.get("id")
    name = channel_meta.get("name", channel_id)
    handle = channel_meta.get("handle")

    # 1. Try official YouTube Atom/RSS feed
    if channel_id:
        rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        try:
            xml_text = fetch_url(rss_url)
            videos = parse_rss_feed(xml_text, channel_meta)
            if videos:
                print(f"[OK] Fetched {len(videos):2d} videos via RSS: {name}")
                return videos
        except urllib.error.HTTPError as e:
            print(f"[WARN] RSS HTTP {e.code} for {name} ({channel_id}), trying fallback...")
        except Exception as e:
            print(f"[WARN] RSS failed for {name}: {e}, trying fallback...")

    # 2. Fallback to channel page scrape
    page_urls = []
    if handle:
        clean_handle = handle if handle.startswith("@") else f"@{handle}"
        page_urls.append(f"https://www.youtube.com/{clean_handle}")
    if channel_id:
        page_urls.append(f"https://www.youtube.com/channel/{channel_id}")

    for page_url in page_urls:
        try:
            html = fetch_url(page_url)
            videos = extract_from_channel_page(html, channel_meta)
            if videos:
                print(f"[OK] Fetched {len(videos):2d} videos via Page: {name}")
                return videos
        except Exception as e:
            print(f"[WARN] Fallback page failed ({page_url}): {e}")

    print(f"[FAIL] Could not retrieve videos for channel: {name}")
    return []


def save_videos_atomically(videos, output_path, tmp_path):
    """Atomically writes sorted videos list to JSON and companion JS file for offline/file-protocol support."""
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)
    
    # Verify temp file before replacing
    with open(tmp_path, "r", encoding="utf-8") as f:
        verify = json.load(f)
        if not isinstance(verify, list):
            raise ValueError("Verification failed: temporary file is not a valid JSON list.")

    # Atomic replace for videos.json
    os.replace(tmp_path, output_path)

    # Also save companion videos.js so index/test HTML works under file:// protocol without CORS blocking
    js_path = os.path.join(os.path.dirname(output_path), "videos.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.VIDEOS_DATA = " + json.dumps(videos, ensure_ascii=False) + ";\n")


def main():
    start_time = time.time()
    print("==================================================")
    print(" Islamic Videos Ingestion Pipeline")
    print("==================================================")

    parser = argparse.ArgumentParser(description="Ingest videos from YouTube channels.")
    parser.add_argument("--limit", type=int, default=25, help="Number of channels to process (default: 25)")
    parser.add_argument("--all", action="store_true", help="Process all channels in channels.json")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite videos database from scratch instead of merging")
    parser.add_argument("--workers", type=int, default=5, help="Concurrent worker threads (default: 5)")
    args = parser.parse_args()

    channels = load_channels(CHANNELS_FILE)
    if not channels:
        print("[ERROR] No channels to process. Exiting.")
        sys.exit(1)

    print(f"Loaded {len(channels)} channels from {os.path.basename(CHANNELS_FILE)}")
    
    if args.overwrite:
        print("[INFO] --overwrite specified: Resetting database to start fresh.")
        video_map = {}
        initial_count = 0
    else:
        video_map = load_existing_videos(OUTPUT_FILE)
        initial_count = len(video_map)
        print(f"Loaded {initial_count} existing videos from {os.path.basename(OUTPUT_FILE)}")

    target_channels = channels if args.all else channels[:args.limit]
    total_target = len(target_channels)
    print(f"Processing {total_target} channels using {args.workers} concurrent workers...")

    lock = threading.Lock()
    completed_count = 0
    new_found = 0

    def process_channel(channel_meta):
        nonlocal completed_count, new_found
        ch_videos = fetch_channel_videos(channel_meta)
        with lock:
            completed_count += 1
            for v in ch_videos:
                vid_id = v["id"]
                if vid_id not in video_map:
                    new_found += 1
                    video_map[vid_id] = v
                else:
                    existing = video_map[vid_id]
                    if v.get("publishedAt") and not existing.get("publishedAt"):
                        existing["publishedAt"] = v["publishedAt"]
                    if v.get("description") and not existing.get("description"):
                        existing["description"] = v["description"]

            # Autosave every 50 channels
            if completed_count % 50 == 0 or completed_count == total_target:
                snapshot = list(video_map.values())
                snapshot.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)
                save_videos_atomically(snapshot, OUTPUT_FILE, TMP_OUTPUT_FILE)
                print(f"[AUTOSAVE] Processed {completed_count}/{total_target} channels -> {len(snapshot)} videos saved.")

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(process_channel, ch) for ch in target_channels]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                print(f"[THREAD ERROR] {e}")

    # Final sort descending by publishedAt
    all_videos = list(video_map.values())
    all_videos.sort(key=lambda x: x.get("publishedAt", ""), reverse=True)

    # Final atomic persist
    save_videos_atomically(all_videos, OUTPUT_FILE, TMP_OUTPUT_FILE)

    duration = time.time() - start_time
    print("--------------------------------------------------")
    print(f"Success! Total videos in database: {len(all_videos)} (+{new_found} new)")
    print(f"Saved to: {OUTPUT_FILE}")
    print(f"Elapsed time: {duration:.2f}s")
    print("==================================================")


if __name__ == "__main__":
    main()


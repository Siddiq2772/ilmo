# Ingestion Pipeline Plan: Fetching & Saving YouTube Feeds

This document details the exact technical plan, data flow, error handling, and file formats strictly for **fetching the YouTube RSS feeds and saving them into `videos.json`**.

---

## 1. Objective

Build a lightweight, zero-dependency Python script (`fetch_feeds.py`) that:
1. Reads a list of YouTube channels from `channels.json`.
2. Downloads the official Atom/RSS XML feed for each channel.
3. Parses video details (ID, Title, Publication Date, Channel Name, Thumbnail, and Description).
4. Loads the existing `videos.json` file to merge and deduplicate records.
5. Sorts the videos in reverse-chronological order (newest first).
6. Safely writes the updated list back to `videos.json`.

---

## 2. File Specifications

### 2.1 Input: `channels.json`
A curated list of target channels.
```json
[
  {
    "id": "UC3vHW2h22WE-xqbfGSRZDXQ",
    "name": "Yaqeen Institute",
    "category": "Lectures & Research"
  },
  {
    "id": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "name": "Mufti Menk",
    "category": "Reminders"
  },
  {
    "id": "UC4d0Veqd2Fh67pM5Fp18qaw",
    "name": "Bayyinah Institute",
    "category": "Quran Studies"
  }
]
```

### 2.2 Output: `videos.json`
The persisted "flat database" used by the application.
```json
[
  {
    "id": "d9OV_youpfE",
    "title": "Finding Peace in Difficult Times",
    "channelId": "UC3vHW2h22WE-xqbfGSRZDXQ",
    "channel": "Yaqeen Institute",
    "category": "Lectures & Research",
    "publishedAt": "2026-11-02T14:30:00+00:00",
    "thumbnail": "https://i.ytimg.com/vi/d9OV_youpfE/hqdefault.jpg",
    "description": "A reminder on patience and perseverance in hardship..."
  }
]
```

---

## 3. Data Processing & Algorithm Flow

```mermaid
flowchart TD
    A[Start fetch_feeds.py] --> B[Load channels.json]
    B --> C[Load existing videos.json into a Map/Dict by 'id']
    C --> D[Loop through each channel]
    
    D --> E[Build URL: https://www.youtube.com/feeds/videos.xml?channel_id={id}]
    E --> F[Fetch XML with custom User-Agent and timeout]
    
    F -->|Success| G[Parse XML using xml.etree.ElementTree]
    F -->|HTTP / Network Error| H[Log error and skip channel]
    
    G --> I[Extract &lt;entry&gt; items]
    I --> J[For each entry: extract id, title, published, description]
    J --> K[Construct clean video object]
    K --> L[Insert / update in Map: video_map[id] = video_data]
    
    H --> M{More channels?}
    L --> M
    M -- Yes --> D
    M -- No --> N[Convert Map values to List]
    
    N --> O[Sort list by publishedAt DESC]
    O --> P[Check if videos.json actually changed]
    P -- Changed --> Q[Write formatted JSON to videos.json]
    P -- No change --> R[Log 'No new updates']
    Q --> S[Print summary & Exit 0]
    R --> S
```

---

## 4. Technical Details & Edge Cases

### 4.1 XML Namespaces
YouTube's Atom feeds use XML namespaces that must be registered during parsing:
- `atom`: `http://www.w3.org/2005/Atom`
- `yt`: `http://www.youtube.com/xml/schemas/2015`
- `media`: `http://search.yahoo.com/mrss/`

**Element selectors:**
- Video ID: `entry.find('yt:videoId', ns).text`
- Title: `entry.find('atom:title', ns).text`
- Published: `entry.find('atom:published', ns).text`
- Author Name: `entry.find('atom:author/atom:name', ns).text`
- Description: `entry.find('media:group/media:description', ns).text`
- Thumbnail: Can be extracted from `media:group/media:thumbnail` attribute `url` or generated directly as `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg`.

### 4.2 Network & Rate-Limiting Resilience
- Set a **10-second timeout** on each request so a single hung request doesn't stall the pipeline.
- Send a standard browser `User-Agent` header (e.g. `Mozilla/5.0 (Windows NT 10.0; Win64; x64)`) to prevent YouTube from returning HTTP 403 blocks.
- Add a tiny delay (`time.sleep(0.5)`) between requests if fetching dozens of channels to be respectful to the server.

### 4.3 Safe Persistence (Atomic Write)
To avoid file corruption if the script is interrupted halfway:
- Write first to a temporary file (`videos.json.tmp`).
- Verify the file is valid JSON and not empty.
- Rename/replace `videos.json.tmp` to `videos.json` atomically.

---

## 5. Implementation Steps for the AI

1. **Step 1:** Create `channels.json` with initial starter channels.
2. **Step 2:** Create an empty `videos.json` (`[]`).
3. **Step 3:** Create `fetch_feeds.py` containing:
   - Configuration constants (`CHANNELS_FILE`, `OUTPUT_FILE`, `TIMEOUT`).
   - Namespace dictionary.
   - `fetch_channel_feed(channel_id)` function.
   - `parse_feed(xml_content, channel_meta)` function.
   - `main()` coordination loop with deduplication map.
4. **Step 4:** Execute the script locally and inspect the resulting `videos.json` to verify:
   - Clean UTF-8 encoding (supporting Arabic and special characters).
   - Correct sorting (newest video first).
   - No duplicates across multiple runs.


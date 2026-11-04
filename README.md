# ILMO — Islamic Knowledge Without Distraction

> **A curated, distraction-free portal and mobile app for beneficial Islamic lectures, Quran recitations, and reminders.**

[![Download Android APK](https://img.shields.io/badge/Download-Android%20APK%20(v1)-10B981?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Siddiq2772/ilmo/releases/tag/v1)
[![GitHub Release](https://img.shields.io/github/v/release/Siddiq2772/ilmo?style=for-the-badge&color=059669)](https://github.com/Siddiq2772/ilmo/releases/tag/v1)

---

## 📱 Mobile App (Android APK)

Download the official standalone Android APK directly from GitHub Releases:

👉 **[Download ILMO v1 Android APK](https://github.com/Siddiq2772/ilmo/releases/tag/v1)**

### Installation on Android:
1. Tap the download link above to download the APK.
2. Open the downloaded file from your notification tray or Downloads folder.
3. If prompted by Android, permit "Install unknown apps" for your browser.
4. Tap **Install** to enjoy ILMO as a fast, distraction-free app on your home screen.

---

## Overview

**ILMO** is designed to provide an ad-free, recommendation-trap-free learning environment. Unlike conventional social video platforms, ILMO features:

- **630+ Curated Channels**: Selected scholars, educators, and institutions across 9 topic categories.
- **20,000+ Videos**: Genuine lectures, Quran tafseer, and reminders without playlist duplicates.
- **Automated Weekly Ingestion**: Keeps content fresh through scheduled GitHub Actions pipelines.
- **Distraction-Free Video Theater**: Videos play in a focused local overlay without algorithmic rabbit holes, external recommendations, comments, or autoplay ads.
- **Progressive Web App (PWA)**: Installable as a standalone app on Android, iOS, Windows, macOS, and ChromeOS.
- **Adaptive Light & Dark Themes**: Automatic system color scheme detection (`prefers-color-scheme`) with a one-click toggle in the header and preferences modal.
- **Infinite YouTube-Style Feed**: Smooth, non-repeating batch loading as you scroll down.
- **Smart Internal Recommendations**: Each video modal displays verified, related lectures from your selected library with automatic broken-thumbnail replacement.
- **Zero-Dependency Core**: Runs directly in any modern browser using pure HTML5, CSS3, and modern vanilla JavaScript.

---

## Quick Start

### 1. Running the Web Application

You can open the application locally in any browser:

- **Via Local HTTP Server (Recommended)**:
  ```powershell
  # Using Python (built-in)
  python -m http.server 8000

  # Or using Node.js npx
  npx serve .
  ```
  Then open `http://localhost:8000` in your browser.

- **Direct File Opening**:
  Open `index.html` or `test.html` directly in your browser. Companion files (`videos.js`) ensure complete functionality even under restrictive local file protocols (`file:///`).

---

## Scripts & CLI Automation

ILMO includes dedicated, multi-threaded CLI tools and one-click Windows batch scripts (`.bat`) for managing channels and video feeds.

### 1. Scrape New Videos (`scrape_new_videos.js`)

Scrapes the latest videos from channels already in your library. **Strictly deduplicates** against existing videos so only new videos are added, and validates 11-character video IDs (filtering out broken playlists).

#### Commands:
```powershell
# Interactive Menu (Double-click or run directly)
scrape_new_videos.bat
# or
node scrape_new_videos.js

# Scrape all channels in library (930+ channels)
node scrape_new_videos.js --all

# Scrape the top N channels
node scrape_new_videos.js --limit 50

# Scrape a specific channel by Name or @Handle
node scrape_new_videos.js "Mufti Menk"
node scrape_new_videos.js @yaqeeninstitute
```

#### What It Does:
- Scans `channels.json` using **8 concurrent workers**.
- Fetches official YouTube Atom RSS feeds without requiring any YouTube API keys.
- Skips videos that already exist in `videos.json`.
- Sorts the database chronologically (newest first).
- Atomically synchronizes `videos.json` and `videos.js`.

---

### 2. Add a Channel (`add_channel.js`)

Adds a new Islamic YouTube channel and automatically imports its latest videos.

#### Commands:
```powershell
# Interactive Wizard (Double-click or run directly)
add_channel.bat
# or
node add_channel.js

# By YouTube Channel URL
node add_channel.js "https://www.youtube.com/@yaqeeninstitute"

# By @Handle
node add_channel.js @yaqeeninstitute

# By Channel ID (UC...)
node add_channel.js UC_CHANNEL_ID_HERE
```

#### What It Does:
1. Auto-resolves the true channel ID (`UC...`), display name, and `@handle`.
2. Prompts you to pick one of the 9 Islamic topic categories:
   - *Lectures & Islamic Studies*
   - *Quran & Tafseer*
   - *Reminders & Spirituality*
   - *Dawah & Outreach*
   - *Islamic History & Stories*
   - *Children & Family*
   - *Nasheeds & Islamic Arts*
   - *Documentaries & Media*
   - *General Islamic*
3. Ingests all recent videos from the channel feed.
4. Synchronizes entries across `channels.json`, `videos.json`, `videos.js`, `channel_ids.txt`, and `channel_ids_with_names.txt`.

---

### 3. Remove a Channel & Its Videos (`remove_channel.js`)

Safely and permanently deletes a channel along with all of its associated videos across the entire project.

#### Commands:
```powershell
# Interactive Prompt (Double-click or run directly)
remove_channel.bat
# or
node remove_channel.js

# By Channel Name
node remove_channel.js "Channel Name"

# By @Handle
node remove_channel.js @handle_name

# By Channel ID
node remove_channel.js UC_CHANNEL_ID_HERE

# Auto-confirm without prompting (useful for scripts)
node remove_channel.js -y "Channel Name"
```

#### What It Does:
- Searches across `channels.json` and `videos.json`.
- Previews the matching channels and count of videos to be deleted.
- Asks for confirmation (`y/N`).
- Removes records cleanly from:
  - `videos.json`
  - `videos.js`
  - `channels.json`
  - `islam_channels.json`
  - `islam_channels.csv`
  - `channel_ids.txt`
  - `channel_ids_with_names.txt`
  - `channels_without_uc_id.txt`

---

### 4. Python Feed Ingestion Pipeline (`fetch_feeds.py`)

A Python alternative to scrape Atom XML feeds with fallback scraping support.

#### Commands:
```powershell
# Run via Windows batch launcher
update_videos.bat

# Or run directly via Python
python fetch_feeds.py --limit 25
python fetch_feeds.py --all --workers 6
```

---

## Project Structure

```
islamicvideos/
├── index.html                 # Main web application entry point
├── test.html                  # Testing & development staging page
├── manifest.json              # Progressive Web App (PWA) manifest
├── sw.js                      # Service Worker for offline asset caching
│
├── css/
│   └── styles.css             # Theme tokens, layout, and component styles
│
├── js/
│   └── app.js                 # App state, feed rendering, search, and player logic
│
├── icons/                     # PWA icons (192px, 512px, maskable, SVG)
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   ├── icon-maskable-512.png
│   └── icon.svg
│
├── data/
│   ├── videos.json            # Primary video database (~19,800+ videos)
│   ├── videos.js              # Standalone companion file for local execution
│   ├── channels.json          # Curated channel list with metadata
│   ├── islam_channels.json    # Extended channel directory
│   ├── islam_channels.csv     # Tabular channel export
│   └── channel_ids.txt        # UC ID index
│
└── automation/
    ├── add_channel.js         # Node CLI to add channel & ingest videos
    ├── add_channel.bat        # Windows launcher for add_channel.js
    ├── remove_channel.js      # Node CLI to remove channel & purge videos
    ├── remove_channel.bat     # Windows launcher for remove_channel.js
    ├── scrape_new_videos.js   # Fast concurrent video feed scraper
    ├── scrape_new_videos.bat  # Windows launcher for scrape_new_videos.js
    ├── fetch_feeds.py         # Python RSS ingestion script
    └── update_videos.bat      # Windows launcher for fetch_feeds.py
```

---

## Video Validation & Deduplication

To preserve data integrity and prevent broken thumbnails:
- **Strict 11-Character ID Check**: YouTube video IDs must match `/^[a-zA-Z0-9_-]{11}$/`.
- **Playlist Elimination**: YouTube playlists (`PL...`, `OL...`, `FL...`) are explicitly filtered out, preventing empty or 120×90 broken thumbnail placeholders.
- **Live Error Replacement**: In the video theater's recommendation panel, if an image ever encounters an error or returns YouTube's placeholder, `app.js` replaces the card in real-time with another valid lecture.

---

## License

This project is created for educational and beneficial community purposes. All video content belongs to their respective creators and educators on YouTube.


#!/usr/bin/env node
/**
 * Add Channel & Ingest Videos Tool
 * 
 * Usage:
 *   node add_channel.js
 *   node add_channel.js "https://www.youtube.com/@yaqeeninstitute"
 *   node add_channel.js @handle
 *   node add_channel.js UC_CHANNEL_ID
 *   node add_channel.js "Channel Name" UC_CHANNEL_ID "Quran & Tafseer"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

const WORKSPACE_DIR = __dirname;
const CHANNELS_JSON_PATH = path.join(WORKSPACE_DIR, 'channels.json');
const VIDEOS_JSON_PATH = path.join(WORKSPACE_DIR, 'videos.json');
const VIDEOS_JS_PATH = path.join(WORKSPACE_DIR, 'videos.js');
const ISLAM_CHANNELS_JSON_PATH = path.join(WORKSPACE_DIR, 'islam_channels.json');
const ISLAM_CHANNELS_CSV_PATH = path.join(WORKSPACE_DIR, 'islam_channels.csv');
const CHANNEL_IDS_TXT_PATH = path.join(WORKSPACE_DIR, 'channel_ids.txt');
const CHANNEL_IDS_WITH_NAMES_PATH = path.join(WORKSPACE_DIR, 'channel_ids_with_names.txt');

const CATEGORIES = [
    'Lectures & Islamic Studies',
    'Quran & Tafseer',
    'Reminders & Spirituality',
    'Dawah & Outreach',
    'Islamic History & Stories',
    'Children & Family',
    'Nasheeds & Islamic Arts',
    'Documentaries & Media',
    'General Islamic'
];

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchText(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Connection timed out'));
        });
    });
}

function extractUCId(str) {
    if (!str) return '';
    const match = str.match(/UC[\w-]{22}/);
    return match ? match[0] : '';
}

function isValidVideoId(id) {
    return Boolean(id && typeof id === 'string' && id.length === 11 && !id.startsWith('PL') && !id.startsWith('OL') && !id.startsWith('FL') && /^[a-zA-Z0-9_-]{11}$/.test(id));
}

function parseAtomFeed(xml, channelName, channelId, category) {
    const videos = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
        const pubMatch = entry.match(/<published>([^<]+)<\/published>/);
        const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/);

        const videoId = idMatch ? idMatch[1].trim() : '';
        if (!isValidVideoId(videoId)) continue;

        const title = titleMatch ? titleMatch[1].trim() : 'Untitled Video';
        const publishedAt = pubMatch ? pubMatch[1].trim() : new Date().toISOString();
        const description = descMatch ? descMatch[1].trim() : '';

        videos.push({
            id: videoId,
            title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
            channelId: channelId,
            channel: channelName,
            category: category,
            publishedAt: publishedAt,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            description: description
        });
    }

    return videos;
}

async function resolveChannel(input) {
    let raw = input.trim();
    let channelId = extractUCId(raw);
    let handle = '';
    let name = '';

    const handleMatch = raw.match(/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch) {
        handle = '@' + handleMatch[1];
    }

    console.log('\n[1/3] Resolving YouTube channel information...');

    // If we only have a handle or custom URL, fetch the channel page to resolve UC ID & title
    if (!channelId && (handle || raw.includes('youtube.com/'))) {
        const url = handle ? `https://www.youtube.com/${handle}` : (raw.startsWith('http') ? raw : `https://${raw}`);
        try {
            console.log(`Fetching channel page: ${url}`);
            const html = await fetchText(url);

            channelId = extractUCId(html);

            const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                               html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
                name = titleMatch[1].replace(' - YouTube', '').trim();
            }

            if (!handle) {
                const hMatch = html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/i);
                if (hMatch) handle = hMatch[1];
            }
        } catch (e) {
            console.log(`[Notice] Could not auto-fetch channel page (${e.message}). Proceeding to manual entry.`);
        }
    }

    // If channelId is known, try fetching RSS feed to get channel title if missing
    if (channelId && !name) {
        try {
            const feedXml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
            const titleMatch = feedXml.match(/<author>\s*<name>([^<]+)<\/name>/i);
            if (titleMatch) {
                name = titleMatch[1].trim();
            }
        } catch (e) {
            // Ignore error
        }
    }

    // Prompt for missing essentials
    if (!channelId) {
        channelId = await askQuestion('Could not auto-detect Channel ID. Enter YouTube Channel ID (starts with UC...): ');
        channelId = extractUCId(channelId);
    }

    if (!name) {
        name = await askQuestion('Enter Channel Display Name: ');
    }

    if (!handle && channelId) {
        handle = await askQuestion('Enter Channel @handle (optional, press Enter to skip): ');
    }
    if (handle && !handle.startsWith('@')) {
        handle = '@' + handle;
    }

    return { channelId, name, handle };
}

async function main() {
    console.log('====================================================');
    console.log('       ILMO - Add Channel & Videos Utility          ');
    console.log('====================================================\n');

    let args = process.argv.slice(2);
    let inputUrlOrId = args[0] || '';
    let chosenCategory = '';

    if (!inputUrlOrId) {
        inputUrlOrId = await askQuestion('Enter YouTube Channel URL, @handle, or Channel ID (UC...): ');
    }

    if (!inputUrlOrId) {
        console.log('No channel URL or ID provided. Aborting.');
        return;
    }

    const { channelId, name, handle } = await resolveChannel(inputUrlOrId);

    if (!channelId) {
        console.error('\n[ERROR] A valid YouTube Channel ID (UC...) is required. Aborted.');
        return;
    }

    if (!name) {
        console.error('\n[ERROR] Channel name is required. Aborted.');
        return;
    }

    console.log(`\nChannel details confirmed:`);
    console.log(`  Name:   ${name}`);
    console.log(`  ID:     ${channelId}`);
    console.log(`  Handle: ${handle || 'None'}`);

    // Category selection
    console.log('\n[2/3] Choose a category for this channel:');
    CATEGORIES.forEach((cat, idx) => {
        console.log(`  ${idx + 1}. ${cat}`);
    });

    const catChoice = await askQuestion(`Select category number (1-${CATEGORIES.length}) [default 9: General Islamic]: `);
    const catIndex = parseInt(catChoice, 10) - 1;
    if (catIndex >= 0 && catIndex < CATEGORIES.length) {
        chosenCategory = CATEGORIES[catIndex];
    } else {
        chosenCategory = 'General Islamic';
    }
    console.log(`Category set to: "${chosenCategory}"`);

    // Fetch Videos
    console.log('\n[3/3] Fetching recent videos from channel feed...');
    let fetchedVideos = [];
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const feedXml = await fetchText(feedUrl);
        fetchedVideos = parseAtomFeed(feedXml, name, channelId, chosenCategory);
        console.log(`Found ${fetchedVideos.length} recent video(s) from RSS feed.`);
    } catch (e) {
        console.log(`[Notice] Feed request: ${e.message}. (Videos can also be updated later via update_videos.bat)`);
    }

    // Save Channel
    console.log('\nSaving channel and videos across database files...');

    // 1. channels.json
    let channels = [];
    if (fs.existsSync(CHANNELS_JSON_PATH)) {
        channels = JSON.parse(fs.readFileSync(CHANNELS_JSON_PATH, 'utf8'));
    }

    const existingIdx = channels.findIndex(c => (c.id && c.id === channelId) || (c.handle && handle && c.handle.toLowerCase() === handle.toLowerCase()));
    const channelObj = {
        id: channelId,
        name: name,
        category: chosenCategory,
        handle: handle || '',
        country: 'Unknown',
        subscribers: 'N/A',
        video_count: String(fetchedVideos.length || '0'),
        channel_url: `https://www.youtube.com/channel/${channelId}`
    };

    if (existingIdx !== -1) {
        channels[existingIdx] = Object.assign(channels[existingIdx], channelObj);
        console.log(`[OK] Updated existing entry in channels.json`);
    } else {
        channels.push(channelObj);
        channels.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        console.log(`[OK] Added new channel to channels.json (total: ${channels.length.toLocaleString()})`);
    }
    fs.writeFileSync(CHANNELS_JSON_PATH, JSON.stringify(channels, null, 2), 'utf8');

    // 2. videos.json & videos.js
    let videos = [];
    if (fs.existsSync(VIDEOS_JSON_PATH)) {
        videos = JSON.parse(fs.readFileSync(VIDEOS_JSON_PATH, 'utf8'));
    }

    const existingVideoIds = new Set(videos.map(v => v.id));
    let newVideosCount = 0;

    for (const v of fetchedVideos) {
        if (!existingVideoIds.has(v.id)) {
            existingVideoIds.add(v.id);
            videos.unshift(v);
            newVideosCount++;
        }
    }

    fs.writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(videos, null, 2), 'utf8');
    console.log(`[OK] videos.json updated: added ${newVideosCount} new videos (total: ${videos.length.toLocaleString()})`);

    if (fs.existsSync(VIDEOS_JS_PATH)) {
        fs.writeFileSync(VIDEOS_JS_PATH, 'window.VIDEOS_DATA = ' + JSON.stringify(videos) + ';', 'utf8');
        console.log(`[OK] videos.js synchronized`);
    }

    // 3. channel_ids.txt
    if (fs.existsSync(CHANNEL_IDS_TXT_PATH)) {
        const ids = fs.readFileSync(CHANNEL_IDS_TXT_PATH, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
        if (!ids.includes(channelId)) {
            ids.push(channelId);
            fs.writeFileSync(CHANNEL_IDS_TXT_PATH, ids.join('\n') + '\n', 'utf8');
            console.log(`[OK] Added channel ID to channel_ids.txt`);
        }
    }

    // 4. channel_ids_with_names.txt
    if (fs.existsSync(CHANNEL_IDS_WITH_NAMES_PATH)) {
        const lines = fs.readFileSync(CHANNEL_IDS_WITH_NAMES_PATH, 'utf8').split('\n').filter(Boolean);
        if (!lines.some(l => l.includes(channelId))) {
            lines.push(`${channelId} | ${name}`);
            fs.writeFileSync(CHANNEL_IDS_WITH_NAMES_PATH, lines.join('\n') + '\n', 'utf8');
            console.log(`[OK] Added to channel_ids_with_names.txt`);
        }
    }

    // 5. islam_channels.json
    if (fs.existsSync(ISLAM_CHANNELS_JSON_PATH)) {
        try {
            const islamData = JSON.parse(fs.readFileSync(ISLAM_CHANNELS_JSON_PATH, 'utf8'));
            if (!islamData.some(c => c.channel_url && c.channel_url.includes(channelId))) {
                islamData.push({
                    channel_name: name,
                    handle: handle || '',
                    channel_url: `https://www.youtube.com/channel/${channelId}`,
                    country: 'Unknown',
                    subscribers: 'N/A',
                    total_views: 'N/A',
                    video_count: String(fetchedVideos.length || '0'),
                    profile_description: `Islamic channel: ${name}`
                });
                fs.writeFileSync(ISLAM_CHANNELS_JSON_PATH, JSON.stringify(islamData, null, 2), 'utf8');
                console.log(`[OK] Added to islam_channels.json`);
            }
        } catch (e) {
            console.error('Error updating islam_channels.json:', e.message);
        }
    }

    console.log('\n====================================================');
    console.log(` Successfully added "${name}" with ${newVideosCount} video(s)!`);
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
});


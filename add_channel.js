#!/usr/bin/env node
/**
 * Add Channel & Ingest Videos Tool
 * 
 * Usage:
 *   node add_channel.js                         (Interactive prompt or scan empty channels)
 *   node add_channel.js --missing               (Fetch latest videos for all channels with 0 videos in database)
 *   node add_channel.js --empty                 (Alias for --missing)
 *   node add_channel.js "https://www.youtube.com/@yaqeeninstitute"
 *   node add_channel.js @handle
 *   node add_channel.js UC_CHANNEL_ID
 *   node add_channel.js "Channel Name"
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
const CANDIDATES_JSON_PATH = path.join(WORKSPACE_DIR, 'youtube_channel_candidates.json');

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
            timeout: 12000
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
            category: category || 'General Islamic',
            publishedAt: publishedAt,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            description: description
        });
    }

    return videos;
}

function extractFromChannelPage(html, channelName, channelId, category) {
    const videos = [];
    const m = html.match(/var ytInitialData\s*=\s*({[\s\S]*?});<\/script>/) ||
              html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);
    if (!m) return videos;

    let data;
    try {
        data = JSON.parse(m[1]);
    } catch (e) {
        return videos;
    }

    function searchItems(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (const item of obj) searchItems(item);
            return;
        }

        // Modern lockupViewModel (2024-2026)
        if (obj.lockupViewModel) {
            const lvm = obj.lockupViewModel;
            const cid = lvm.contentId;
            const meta = lvm.metadata && lvm.metadata.lockupMetadataViewModel;
            const title = (meta && meta.title && meta.title.content) || '';
            if (cid && isValidVideoId(cid)) {
                videos.push({
                    id: cid,
                    title: title || 'Untitled Video',
                    channelId: channelId,
                    channel: channelName,
                    category: category || 'General Islamic',
                    publishedAt: new Date().toISOString(),
                    thumbnail: `https://i.ytimg.com/vi/${cid}/hqdefault.jpg`,
                    description: ''
                });
            }
        } else if (obj.videoRenderer) {
            const vr = obj.videoRenderer;
            const vid = vr.videoId;
            const title = (vr.title && vr.title.runs && vr.title.runs[0] && vr.title.runs[0].text) || '';
            if (vid && isValidVideoId(vid)) {
                videos.push({
                    id: vid,
                    title: title || 'Untitled Video',
                    channelId: channelId,
                    channel: channelName,
                    category: category || 'General Islamic',
                    publishedAt: new Date().toISOString(),
                    thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                    description: ''
                });
            }
        }

        for (const key of Object.keys(obj)) {
            searchItems(obj[key]);
        }
    }

    searchItems(data);

    // Deduplicate within page
    const seen = new Set();
    return videos.filter(v => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
    });
}

async function fetchLatestVideos(channelId, channelName, category, handle = '') {
    let videos = [];

    // 1. Primary: Official YouTube RSS Atom Feed (most reliable & fast)
    if (channelId) {
        try {
            const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const feedXml = await fetchText(feedUrl);
            videos = parseAtomFeed(feedXml, channelName, channelId, category);
            if (videos.length > 0) {
                return videos;
            }
        } catch (e) {
            // RSS failed or blocked, proceed to fallback
        }
    }

    // 2. Fallback: Fetch channel /videos tab and parse ytInitialData
    const pageUrl = handle ? `https://www.youtube.com/${handle.startsWith('@') ? handle : '@' + handle}/videos` : (channelId ? `https://www.youtube.com/channel/${channelId}/videos` : '');
    if (pageUrl) {
        try {
            const html = await fetchText(pageUrl);
            videos = extractFromChannelPage(html, channelName, channelId, category);
        } catch (e) {
            // Page fetch failed
        }
    }

    return videos;
}

function loadDatabaseVideos() {
    if (fs.existsSync(VIDEOS_JSON_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(VIDEOS_JSON_PATH, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function loadDatabaseChannels() {
    if (fs.existsSync(CHANNELS_JSON_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CHANNELS_JSON_PATH, 'utf8'));
        } catch (e) {
            return [];
        }
    }
    return [];
}

function getVideosForChannel(allVideos, channelId, channelName) {
    const cId = (channelId || '').trim();
    const cName = (channelName || '').trim().toLowerCase();
    return allVideos.filter(v => 
        (cId && v.channelId === cId) ||
        (cName && v.channel && v.channel.trim().toLowerCase() === cName)
    );
}

function findChannelInDatabase(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return null;
    const cleanHandle = q.startsWith('@') ? q : `@${q}`;
    const ucMatch = extractUCId(query);

    const channels = loadDatabaseChannels();
    let found = channels.find(c => 
        (ucMatch && (c.id === ucMatch || extractUCId(c.channel_url) === ucMatch)) ||
        (c.handle && (c.handle.toLowerCase() === q || c.handle.toLowerCase() === cleanHandle)) ||
        (c.name && c.name.toLowerCase() === q)
    );
    if (!found) {
        found = channels.find(c => c.name && c.name.toLowerCase().includes(q));
    }
    if (found) {
        return {
            channelId: found.id || extractUCId(found.channel_url),
            name: found.name,
            handle: found.handle || '',
            category: found.category || 'General Islamic'
        };
    }

    if (fs.existsSync(ISLAM_CHANNELS_JSON_PATH)) {
        try {
            const islamData = JSON.parse(fs.readFileSync(ISLAM_CHANNELS_JSON_PATH, 'utf8'));
            const islamFound = islamData.find(c => 
                (ucMatch && c.channel_url && c.channel_url.includes(ucMatch)) ||
                (c.handle && (c.handle.toLowerCase() === q || c.handle.toLowerCase() === cleanHandle)) ||
                (c.channel_name && c.channel_name.toLowerCase() === q)
            ) || islamData.find(c => c.channel_name && c.channel_name.toLowerCase().includes(q));

            if (islamFound) {
                return {
                    channelId: extractUCId(islamFound.channel_url),
                    name: islamFound.channel_name,
                    handle: islamFound.handle || '',
                    category: islamFound.category || 'General Islamic'
                };
            }
        } catch (e) {}
    }

    return null;
}

async function resolveChannel(input, overrideName = '', overrideCategory = '') {
    let raw = input.trim();
    let channelId = extractUCId(raw);
    let handle = '';
    let name = overrideName || '';
    let category = overrideCategory || '';

    // Check if channel already exists in channels.json or islam_channels.json
    const localMatch = findChannelInDatabase(raw);
    if (localMatch) {
        console.log(`[Database Match] Found existing channel record: "${localMatch.name}"`);
        if (localMatch.channelId) channelId = localMatch.channelId;
        if (!name) name = localMatch.name;
        if (localMatch.handle) handle = localMatch.handle;
        if (!category && localMatch.category) category = localMatch.category;
    }

    const handleMatch = raw.match(/@([a-zA-Z0-9_.-]+)/);
    if (handleMatch) {
        handle = '@' + handleMatch[1];
    }

    console.log('\n[1/3] Resolving YouTube channel information...');

    // If missing UC ID, fetch channel page to resolve it
    if (!channelId && (handle || raw.includes('youtube.com/'))) {
        const url = handle ? `https://www.youtube.com/${handle}` : (raw.startsWith('http') ? raw : `https://${raw}`);
        try {
            console.log(`Fetching channel page: ${url}`);
            const html = await fetchText(url);

            channelId = extractUCId(html);

            const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                               html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch && !name) {
                name = titleMatch[1].replace(' - YouTube', '').trim();
            }

            if (!handle) {
                const hMatch = html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/i);
                if (hMatch) handle = hMatch[1];
            }
        } catch (e) {
            console.log(`[Notice] Could not auto-fetch channel page (${e.message}).`);
        }
    }

    // If channelId is known but title is missing, try RSS feed author tag
    if (channelId && !name) {
        try {
            const feedXml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
            const titleMatch = feedXml.match(/<author>\s*<name>([^<]+)<\/name>/i);
            if (titleMatch) {
                name = titleMatch[1].trim();
            }
        } catch (e) {}
    }

    // Prompt for missing essentials (or fallback if non-interactive)
    if (!channelId) {
        if (!process.stdin.isTTY) {
            console.error('[ERROR] Could not auto-detect Channel ID (UC...). Pass the UC ID directly.');
            return { channelId: '', name: '', handle: '', category: '' };
        }
        channelId = await askQuestion('Could not auto-detect Channel ID. Enter YouTube Channel ID (starts with UC...): ');
        channelId = extractUCId(channelId);
    }

    if (!name) {
        if (!process.stdin.isTTY) {
            name = handle ? handle.replace(/^@/, '') : (channelId || 'Islamic Channel');
        } else {
            name = await askQuestion('Enter Channel Display Name: ');
        }
    }

    if (!handle && channelId && process.stdin.isTTY) {
        handle = await askQuestion('Enter Channel @handle (optional, press Enter to skip): ');
    }
    if (handle && !handle.startsWith('@')) {
        handle = '@' + handle;
    }

    return { channelId, name, handle, category };
}

function saveVideosToDatabase(newVideos, channelName) {
    if (!newVideos || newVideos.length === 0) return 0;

    let videos = loadDatabaseVideos();
    const existingVideoIds = new Set(videos.map(v => v.id));
    let addedCount = 0;

    for (const v of newVideos) {
        if (!existingVideoIds.has(v.id)) {
            existingVideoIds.add(v.id);
            videos.unshift(v);
            addedCount++;
        }
    }

    if (addedCount > 0) {
        fs.writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(videos, null, 2), 'utf8');
        if (fs.existsSync(VIDEOS_JS_PATH)) {
            fs.writeFileSync(VIDEOS_JS_PATH, 'window.VIDEOS_DATA = ' + JSON.stringify(videos) + ';', 'utf8');
        }
    }

    return addedCount;
}

function saveChannelMetadata(channelId, name, category, handle, videoCount) {
    let channels = loadDatabaseChannels();
    const existingIdx = channels.findIndex(c => 
        (c.id && c.id === channelId) || 
        (c.handle && handle && c.handle.toLowerCase() === handle.toLowerCase()) ||
        (c.name && c.name.toLowerCase() === name.toLowerCase())
    );

    const channelObj = {
        id: channelId,
        name: name,
        category: category,
        handle: handle || '',
        country: 'Unknown',
        subscribers: 'N/A',
        video_count: String(videoCount || '0'),
        channel_url: `https://www.youtube.com/channel/${channelId}`
    };

    if (existingIdx !== -1) {
        channels[existingIdx] = Object.assign(channels[existingIdx], channelObj);
    } else {
        channels.push(channelObj);
        channels.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    fs.writeFileSync(CHANNELS_JSON_PATH, JSON.stringify(channels, null, 2), 'utf8');

    // channel_ids.txt
    if (fs.existsSync(CHANNEL_IDS_TXT_PATH)) {
        const ids = fs.readFileSync(CHANNEL_IDS_TXT_PATH, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
        if (!ids.includes(channelId)) {
            ids.push(channelId);
            fs.writeFileSync(CHANNEL_IDS_TXT_PATH, ids.join('\n') + '\n', 'utf8');
        }
    }

    // channel_ids_with_names.txt
    if (fs.existsSync(CHANNEL_IDS_WITH_NAMES_PATH)) {
        const lines = fs.readFileSync(CHANNEL_IDS_WITH_NAMES_PATH, 'utf8').split('\n').filter(Boolean);
        if (!lines.some(l => l.includes(channelId))) {
            lines.push(`${channelId} | ${name}`);
            fs.writeFileSync(CHANNEL_IDS_WITH_NAMES_PATH, lines.join('\n') + '\n', 'utf8');
        }
    }

    // islam_channels.json
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
                    video_count: String(videoCount || '0'),
                    profile_description: `Islamic channel: ${name}`
                });
                fs.writeFileSync(ISLAM_CHANNELS_JSON_PATH, JSON.stringify(islamData, null, 2), 'utf8');
            }
        } catch (e) {}
    }
}

async function syncAllEmptyChannels() {
    console.log('\n====================================================');
    console.log('   Scanning Database for Channels with 0 Videos     ');
    console.log('====================================================\n');

    const channels = loadDatabaseChannels();
    const videos = loadDatabaseVideos();

    const videosByChannelId = new Set();
    const videosByChannelName = new Set();
    for (const v of videos) {
        if (v.channelId) videosByChannelId.add(v.channelId);
        if (v.channel) videosByChannelName.add(v.channel.trim().toLowerCase());
    }

    const emptyChannels = channels.filter(c => {
        const ucId = c.id || extractUCId(c.channel_url);
        const name = (c.name || '').trim().toLowerCase();
        return !videosByChannelId.has(ucId) && !videosByChannelName.has(name);
    });

    console.log(`Total channels in database: ${channels.length}`);
    console.log(`Channels with existing videos: ${channels.length - emptyChannels.length}`);
    console.log(`Channels with 0 videos in database: ${emptyChannels.length}`);

    if (emptyChannels.length === 0) {
        console.log('\nAll channels already have videos in the database! Nothing to do.');
        return;
    }

    console.log(`\nFetching latest videos for ${emptyChannels.length} empty channels...\n`);

    let totalNewVideos = 0;
    let successfulChannels = 0;

    for (let i = 0; i < emptyChannels.length; i++) {
        const ch = emptyChannels[i];
        const ucId = ch.id || extractUCId(ch.channel_url);
        const name = ch.name || 'Islamic Channel';
        const category = ch.category || 'General Islamic';
        const handle = ch.handle || '';

        process.stdout.write(`[${i + 1}/${emptyChannels.length}] "${name}"... `);

        if (!ucId) {
            console.log('Skipped (missing UC ID)');
            continue;
        }

        try {
            const fetched = await fetchLatestVideos(ucId, name, category, handle);
            if (fetched.length > 0) {
                const added = saveVideosToDatabase(fetched, name);
                totalNewVideos += added;
                successfulChannels++;
                ch.video_count = String(fetched.length);
                console.log(`OK: fetched & added ${added} video(s)`);
            } else {
                console.log('0 videos returned');
            }
        } catch (e) {
            console.log(`Failed (${e.message})`);
        }

        // Polite delay
        await new Promise(r => setTimeout(r, 600));
    }

    // Save updated channels
    fs.writeFileSync(CHANNELS_JSON_PATH, JSON.stringify(channels, null, 2), 'utf8');

    console.log('\n====================================================');
    console.log(` Completed! Populated ${successfulChannels} channel(s) with ${totalNewVideos} new video(s).`);
    console.log('====================================================\n');
}

async function importChannelsFromFile(filePath, options = {}) {
    const concurrency = options.concurrency || 5;
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);

    if (!fs.existsSync(resolvedPath)) {
        console.error(`[ERROR] File not found: ${resolvedPath}`);
        return;
    }

    const lines = fs.readFileSync(resolvedPath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    const targetChannels = [];
    for (const line of lines) {
        const ucId = extractUCId(line);
        if (!ucId) continue;
        let lineName = '';
        if (line.includes('|')) {
            lineName = line.split('|')[1].trim();
        }
        targetChannels.push({ id: ucId, lineName });
    }

    console.log(`\n====================================================`);
    console.log(`       ILMO - Batch Channel Importer                `);
    console.log(`====================================================`);
    console.log(`File: ${resolvedPath}`);
    console.log(`Found ${targetChannels.length} channel ID(s) in file.`);
    console.log(`Worker concurrency: ${concurrency}\n`);

    // Load candidate metadata map if available
    const candidateMap = new Map();
    if (fs.existsSync(CANDIDATES_JSON_PATH)) {
        try {
            const candData = JSON.parse(fs.readFileSync(CANDIDATES_JSON_PATH, 'utf8'));
            for (const c of candData) {
                const cid = c.channel_id || extractUCId(c.channel_url);
                if (cid) candidateMap.set(cid, c);
            }
        } catch (e) {}
    }

    // Load existing channels & videos
    let channels = loadDatabaseChannels();
    let videos = loadDatabaseVideos();

    const existingChannelIds = new Set(channels.map(c => c.id || extractUCId(c.channel_url)).filter(Boolean));
    const existingVideoIds = new Set(videos.map(v => v.id).filter(Boolean));

    const pending = targetChannels.filter(t => !existingChannelIds.has(t.id));
    console.log(`Already in channels.json: ${targetChannels.length - pending.length}`);
    console.log(`New channels to import: ${pending.length}\n`);

    if (pending.length === 0) {
        console.log('All channels from file are already in channels.json! Nothing to import.');
        return;
    }

    let importedCount = 0;
    let newVideosTotal = 0;
    let processedCount = 0;

    function flushToDisk() {
        channels.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        fs.writeFileSync(CHANNELS_JSON_PATH, JSON.stringify(channels, null, 2), 'utf8');
        fs.writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(videos, null, 2), 'utf8');
        if (fs.existsSync(VIDEOS_JS_PATH)) {
            fs.writeFileSync(VIDEOS_JS_PATH, 'window.VIDEOS_DATA = ' + JSON.stringify(videos) + ';', 'utf8');
        }
    }

    let queueIdx = 0;
    async function worker(workerId) {
        while (queueIdx < pending.length) {
            const idx = queueIdx++;
            const item = pending[idx];
            const chId = item.id;
            const cand = candidateMap.get(chId) || {};

            let chName = (cand.channel_name || item.lineName || cand.speaker || '').trim();
            let subscribers = cand.subscribers || 'N/A';
            let category = 'Lectures & Islamic Studies';

            let fetchedVideos = [];
            try {
                fetchedVideos = await fetchLatestVideos(chId, chName, category, '');
            } catch (e) {}

            if (!chName && fetchedVideos.length > 0 && fetchedVideos[0].channel) {
                chName = fetchedVideos[0].channel;
            }
            if (!chName) {
                chName = `Islamic Channel ${chId.slice(-6)}`;
            }

            if (fetchedVideos.length === 0 && cand.recent_video_id && isValidVideoId(cand.recent_video_id)) {
                fetchedVideos.push({
                    id: cand.recent_video_id,
                    title: cand.recent_video_title || 'Untitled Video',
                    channelId: chId,
                    channel: chName,
                    category: category,
                    publishedAt: cand.recent_video_upload_date || new Date().toISOString(),
                    thumbnail: `https://i.ytimg.com/vi/${cand.recent_video_id}/hqdefault.jpg`,
                    description: cand.recent_video_description || ''
                });
            }

            let channelNewVideos = 0;
            for (const v of fetchedVideos) {
                v.channel = chName;
                v.category = category;
                if (!existingVideoIds.has(v.id)) {
                    existingVideoIds.add(v.id);
                    videos.unshift(v);
                    channelNewVideos++;
                }
            }
            newVideosTotal += channelNewVideos;

            const channelObj = {
                id: chId,
                name: chName,
                category: category,
                handle: '',
                country: 'Unknown',
                subscribers: subscribers,
                video_count: String(fetchedVideos.length),
                channel_url: `https://www.youtube.com/channel/${chId}`
            };
            channels.push(channelObj);
            existingChannelIds.add(chId);
            importedCount++;
            processedCount++;

            console.log(`[${processedCount}/${pending.length}] [W${workerId}] + "${chName}" (${channelNewVideos} video(s))`);

            if (processedCount % 25 === 0) {
                flushToDisk();
            }

            await new Promise(r => setTimeout(r, 200));
        }
    }

    const workers = [];
    for (let w = 1; w <= concurrency; w++) {
        workers.push(worker(w));
    }
    await Promise.all(workers);

    flushToDisk();

    // Update channel_ids.txt & channel_ids_with_names.txt
    if (fs.existsSync(CHANNEL_IDS_TXT_PATH)) {
        const idSet = new Set(fs.readFileSync(CHANNEL_IDS_TXT_PATH, 'utf8').split('\n').map(l => l.trim()).filter(Boolean));
        for (const ch of channels) {
            if (ch.id) idSet.add(ch.id);
        }
        fs.writeFileSync(CHANNEL_IDS_TXT_PATH, Array.from(idSet).join('\n') + '\n', 'utf8');
    }

    if (fs.existsSync(CHANNEL_IDS_WITH_NAMES_PATH)) {
        const nameLines = channels.map(c => `${c.id} | ${c.name}`);
        fs.writeFileSync(CHANNEL_IDS_WITH_NAMES_PATH, nameLines.join('\n') + '\n', 'utf8');
    }

    console.log(`\n====================================================`);
    console.log(` Import Completed Successfully!`);
    console.log(` Channels imported: ${importedCount}`);
    console.log(` New videos added to library: ${newVideosTotal}`);
    console.log(` Total channels in database: ${channels.length}`);
    console.log(` Total videos in database: ${videos.length}`);
    console.log(`====================================================\n`);
}

async function main() {
    console.log('====================================================');
    console.log('       ILMO - Add Channel & Videos Utility          ');
    console.log('====================================================\n');

    let args = process.argv.slice(2);
    let inputUrlOrId = args[0] || '';

    // Check for batch file import: --import <file>, --file <file>, or argument ending with .txt/.json
    let fileArgIdx = args.findIndex(a => a === '--import' || a === '--file' || a === '--batch');
    let importFilePath = '';
    if (fileArgIdx !== -1 && args[fileArgIdx + 1]) {
        importFilePath = args[fileArgIdx + 1];
    } else if (inputUrlOrId && (inputUrlOrId.endsWith('.txt') || inputUrlOrId.endsWith('.json'))) {
        importFilePath = inputUrlOrId;
    }

    if (importFilePath) {
        let workers = 5;
        const wIdx = args.indexOf('--workers');
        if (wIdx !== -1 && args[wIdx + 1]) {
            workers = parseInt(args[wIdx + 1], 10) || 5;
        }
        await importChannelsFromFile(importFilePath, { concurrency: workers });
        return;
    }

    // Check for batch empty channels flag
    if (args.includes('--missing') || args.includes('--empty') || args.includes('--all-missing') || args.includes('--scan-empty')) {
        await syncAllEmptyChannels();
        return;
    }

    // Extract optional CLI flags
    let catIdx = args.findIndex(a => a === '--category' || a === '-c');
    let cliCategory = '';
    if (catIdx !== -1 && args[catIdx + 1]) {
        cliCategory = args[catIdx + 1];
    }

    let nameIdx = args.findIndex(a => a === '--name' || a === '-n');
    let cliName = '';
    if (nameIdx !== -1 && args[nameIdx + 1]) {
        cliName = args[nameIdx + 1];
    }

    if (!inputUrlOrId || inputUrlOrId.startsWith('-')) {
        if (!process.stdin.isTTY) {
            console.error('[ERROR] No channel identifier provided. Usage: node add_channel.js <url|handle|uc_id> [--category "..."] [--name "..."]');
            return;
        }
        console.log('Options:');
        console.log('  1. Enter a Channel URL, @handle, Channel ID, or Name');
        console.log('  2. Type "missing" to fetch videos for all channels with 0 videos in database\n');
        inputUrlOrId = await askQuestion('Enter channel or command: ');
    }

    if (!inputUrlOrId) {
        console.log('No input provided. Aborting.');
        return;
    }

    if (inputUrlOrId.toLowerCase() === 'missing' || inputUrlOrId.toLowerCase() === 'empty' || inputUrlOrId.toLowerCase() === 'scan') {
        await syncAllEmptyChannels();
        return;
    }

    const { channelId, name, handle, category: defaultCategory } = await resolveChannel(inputUrlOrId, cliName, cliCategory);

    if (!channelId) {
        console.error('\n[ERROR] A valid YouTube Channel ID (UC...) is required. Aborted.');
        return;
    }

    if (!name) {
        console.error('\n[ERROR] Channel name is required. Aborted.');
        return;
    }

    console.log(`\nChannel details:`);
    console.log(`  Name:   ${name}`);
    console.log(`  ID:     ${channelId}`);
    console.log(`  Handle: ${handle || 'None'}`);

    // Check if channel has videos in database
    const databaseVideos = loadDatabaseVideos();
    const existingChannelVideos = getVideosForChannel(databaseVideos, channelId, name);

    let chosenCategory = cliCategory || defaultCategory;
    if (!chosenCategory) {
        if (!process.stdin.isTTY) {
            chosenCategory = 'General Islamic';
        } else {
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
        }
    }
    console.log(`Category: "${chosenCategory}"`);

    // Status report from database
    console.log('\n[3/3] Checking database video inventory...');
    if (existingChannelVideos.length === 0) {
        console.log(`\n[Database Check] Notice: Channel "${name}" has 0 videos in the database.`);
        console.log(`[Fetching] Automatically fetching latest videos from YouTube...`);
    } else {
        console.log(`\n[Database Check] Channel "${name}" already has ${existingChannelVideos.length} video(s) in the database.`);
        console.log(`[Fetching] Checking for any newly published videos from channel...`);
    }

    let fetchedVideos = [];
    try {
        fetchedVideos = await fetchLatestVideos(channelId, name, chosenCategory, handle);
        console.log(`Found ${fetchedVideos.length} latest video(s) from channel.`);
    } catch (e) {
        console.log(`[Notice] Fetch request: ${e.message}`);
    }

    // Ingest into database
    console.log('\nSaving channel and videos across database files...');

    const newVideosCount = saveVideosToDatabase(fetchedVideos, name);
    const totalChannelVideos = existingChannelVideos.length + newVideosCount;

    saveChannelMetadata(channelId, name, chosenCategory, handle, totalChannelVideos);

    console.log(`[OK] videos.json and videos.js updated: added ${newVideosCount} new video(s)`);
    console.log(`[OK] channels.json updated for "${name}" (total videos in library: ${totalChannelVideos})`);

    console.log('\n====================================================');
    if (existingChannelVideos.length === 0 && newVideosCount > 0) {
        console.log(` Successfully populated "${name}" with ${newVideosCount} latest video(s)!`);
    } else if (newVideosCount > 0) {
        console.log(` Successfully updated "${name}": added ${newVideosCount} new video(s) (now ${totalChannelVideos} total).`);
    } else {
        console.log(` "${name}" is up to date (${totalChannelVideos} video(s) in database).`);
    }
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * Scrape New Videos from Existing Channels
 * 
 * Ingests latest videos from channels in channels.json, strictly deduplicating
 * against videos.json so only new videos are added.
 * 
 * Usage:
 *   node scrape_new_videos.js               (Interactive menu or scrape all)
 *   node scrape_new_videos.js --all         (Scrape all channels)
 *   node scrape_new_videos.js --limit 50    (Scrape first 50 channels)
 *   node scrape_new_videos.js "Mufti Menk"  (Scrape one specific channel)
 *   node scrape_new_videos.js @handle       (Scrape one channel by handle)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const WORKSPACE_DIR = __dirname;
const CHANNELS_JSON_PATH = path.join(WORKSPACE_DIR, 'channels.json');
const VIDEOS_JSON_PATH = path.join(WORKSPACE_DIR, 'videos.json');
const VIDEOS_JS_PATH = path.join(WORKSPACE_DIR, 'videos.js');

const CONCURRENCY = 8;
const TIMEOUT_MS = 12000;

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

function isValidVideoId(id) {
    return Boolean(
        id &&
        typeof id === 'string' &&
        id.length === 11 &&
        !id.startsWith('PL') &&
        !id.startsWith('OL') &&
        !id.startsWith('FL') &&
        /^[a-zA-Z0-9_-]{11}$/.test(id)
    );
}

function extractUCId(urlOrId) {
    if (!urlOrId) return '';
    const match = urlOrId.match(/UC[\w-]{22}/);
    return match ? match[0] : '';
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: TIMEOUT_MS
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

function parseAtomFeed(xml, channelMeta) {
    const videos = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    const channelName = channelMeta.name || channelMeta.channel_name || 'Islamic Channel';
    const channelId = channelMeta.id || extractUCId(channelMeta.channel_url) || '';
    const category = channelMeta.category || 'General Islamic';

    while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];

        const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
        const pubMatch = entry.match(/<published>([^<]+)<\/published>/);
        const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/);

        const videoId = idMatch ? idMatch[1].trim() : '';
        if (!isValidVideoId(videoId)) continue;

        const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
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

async function fetchVideosForChannel(channelMeta) {
    let channelId = channelMeta.id || extractUCId(channelMeta.channel_url);

    // If channel has no UC ID but has handle, try to resolve it from the channel page
    if (!channelId && channelMeta.handle) {
        const cleanHandle = channelMeta.handle.startsWith('@') ? channelMeta.handle : `@${channelMeta.handle}`;
        try {
            const html = await fetchText(`https://www.youtube.com/${cleanHandle}`);
            channelId = extractUCId(html);
            if (channelId) {
                channelMeta.id = channelId;
            }
        } catch (e) {
            // Ignore
        }
    }

    if (!channelId) {
        return [];
    }

    // Fetch official RSS Atom feed
    try {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const xml = await fetchText(rssUrl);
        return parseAtomFeed(xml, channelMeta);
    } catch (e) {
        return [];
    }
}

async function runPool(items, workerFn, concurrency) {
    let index = 0;
    const results = [];
    const executing = [];

    for (let i = 0; i < Math.min(concurrency, items.length); i++) {
        executing.push(enqueue());
    }

    function enqueue() {
        if (index >= items.length) return Promise.resolve();
        const itemIdx = index++;
        const item = items[itemIdx];

        return workerFn(item, itemIdx, items.length).then(res => {
            results.push(res);
            return enqueue();
        }).catch(err => {
            results.push({ error: err, item });
            return enqueue();
        });
    }

    await Promise.all(executing);
    return results;
}

async function main() {
    console.log('====================================================');
    console.log('     ILMO - Scrape New Videos (Deduplicated)        ');
    console.log('====================================================\n');

    const startTime = Date.now();

    if (!fs.existsSync(CHANNELS_JSON_PATH)) {
        console.error('[ERROR] channels.json not found!');
        return;
    }

    const allChannels = JSON.parse(fs.readFileSync(CHANNELS_JSON_PATH, 'utf8'));
    console.log(`Loaded ${allChannels.length.toLocaleString()} channels from channels.json.`);

    let existingVideos = [];
    if (fs.existsSync(VIDEOS_JSON_PATH)) {
        try {
            existingVideos = JSON.parse(fs.readFileSync(VIDEOS_JSON_PATH, 'utf8'));
        } catch (e) {
            console.error('[WARN] Failed to parse videos.json, starting empty:', e.message);
        }
    }

    const existingIds = new Set(existingVideos.map(v => v.id));
    console.log(`Loaded ${existingVideos.length.toLocaleString()} existing videos from videos.json.\n`);

    const args = process.argv.slice(2);
    let targetChannels = [];

    // Parse options
    if (args.includes('--all') || args.includes('-a')) {
        targetChannels = allChannels;
    } else if (args.includes('--limit')) {
        const idx = args.indexOf('--limit');
        const limit = parseInt(args[idx + 1], 10) || 50;
        targetChannels = allChannels.slice(0, limit);
    } else if (args.length > 0 && !args[0].startsWith('-')) {
        // Search specific channel by name, handle, or ID
        const query = args.join(' ').toLowerCase();
        targetChannels = allChannels.filter(c => {
            const name = (c.name || c.channel_name || '').toLowerCase();
            const handle = (c.handle || '').toLowerCase();
            const id = (c.id || '').toLowerCase();
            return name.includes(query) || handle.includes(query) || id === query;
        });
        if (targetChannels.length === 0) {
            console.log(`No channel matching "${args.join(' ')}" found in channels.json.`);
            return;
        }
        console.log(`Found ${targetChannels.length} matching channel(s):`);
        targetChannels.forEach(c => console.log(` - ${c.name} (${c.handle || c.id || 'no handle'})`));
    } else {
        // Interactive menu
        console.log('What would you like to scrape?');
        console.log('  1. All channels (All ' + allChannels.length + ' channels)');
        console.log('  2. Top 50 channels');
        console.log('  3. Top 100 channels');
        console.log('  4. Search and scrape a specific channel\n');

        const choice = await askQuestion('Select an option (1-4) [default: 1]: ');
        if (choice === '2') {
            targetChannels = allChannels.slice(0, 50);
        } else if (choice === '3') {
            targetChannels = allChannels.slice(0, 100);
        } else if (choice === '4') {
            const q = await askQuestion('Enter channel name, @handle, or ID: ');
            const query = q.toLowerCase();
            targetChannels = allChannels.filter(c => {
                const name = (c.name || c.channel_name || '').toLowerCase();
                const handle = (c.handle || '').toLowerCase();
                const id = (c.id || '').toLowerCase();
                return name.includes(query) || handle.includes(query) || id === query;
            });
            if (targetChannels.length === 0) {
                console.log(`No channel matching "${q}" found.`);
                return;
            }
        } else {
            targetChannels = allChannels;
        }
    }

    console.log(`\nStarting ingestion for ${targetChannels.length} channel(s) using ${CONCURRENCY} concurrent workers...\n`);

    let newVideosFound = [];
    let completed = 0;

    async function processChannel(channel, idx, total) {
        const videos = await fetchVideosForChannel(channel);
        let channelNewCount = 0;

        for (const v of videos) {
            if (!existingIds.has(v.id) && isValidVideoId(v.id)) {
                existingIds.add(v.id);
                newVideosFound.push(v);
                channelNewCount++;
            }
        }

        completed++;
        const percent = Math.round((completed / total) * 100);
        const name = (channel.name || 'Channel').substring(0, 30);
        const status = channelNewCount > 0 ? `+${channelNewCount} NEW` : 'no new';
        process.stdout.write(`\r[${completed}/${total}] (${percent}%) ${name.padEnd(30)} -> ${status.padEnd(10)} (Total new: ${newVideosFound.length})`);
    }

    await runPool(targetChannels, processChannel, CONCURRENCY);

    console.log('\n\nProcessing complete!');
    console.log(`Discovered ${newVideosFound.length.toLocaleString()} new, non-duplicate videos.`);

    if (newVideosFound.length > 0) {
        console.log('Merging and sorting database newest first...');

        const combined = [...newVideosFound, ...existingVideos];

        // Sort descending by publishedAt
        combined.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

        // Save videos.json
        fs.writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(combined, null, 2), 'utf8');
        console.log(`[OK] Saved to videos.json (Total library: ${combined.length.toLocaleString()} videos)`);

        // Save videos.js
        fs.writeFileSync(VIDEOS_JS_PATH, 'window.VIDEOS_DATA = ' + JSON.stringify(combined) + ';\n', 'utf8');
        console.log(`[OK] Synchronized videos.js`);
    } else {
        console.log('All channels are already up-to-date. No new videos to append.');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nFinished in ${elapsed}s.`);
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('An error occurred:', err);
    process.exit(1);
});


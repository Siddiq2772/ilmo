#!/usr/bin/env node
/**
 * Remove Channel & Related Videos Utility
 * 
 * Usage:
 *   node remove_channel.js "Channel Name"
 *   node remove_channel.js @handle
 *   node remove_channel.js UC_CHANNEL_ID
 *   node remove_channel.js -y "Channel Name" (auto-confirm)
 *   node remove_channel.js (interactive prompt)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const WORKSPACE_DIR = __dirname;
const VIDEOS_JSON_PATH = path.join(WORKSPACE_DIR, 'videos.json');
const VIDEOS_JS_PATH = path.join(WORKSPACE_DIR, 'videos.js');
const CHANNELS_JSON_PATH = path.join(WORKSPACE_DIR, 'channels.json');
const ISLAM_CHANNELS_JSON_PATH = path.join(WORKSPACE_DIR, 'islam_channels.json');
const ISLAM_CHANNELS_CSV_PATH = path.join(WORKSPACE_DIR, 'islam_channels.csv');
const CHANNEL_IDS_TXT_PATH = path.join(WORKSPACE_DIR, 'channel_ids.txt');
const CHANNEL_IDS_WITH_NAMES_PATH = path.join(WORKSPACE_DIR, 'channel_ids_with_names.txt');
const CHANNELS_WITHOUT_UC_PATH = path.join(WORKSPACE_DIR, 'channels_without_uc_id.txt');

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

function normalize(str) {
    return (str || '').toString().trim().toLowerCase();
}

function extractUCId(urlOrId) {
    if (!urlOrId) return '';
    const match = urlOrId.match(/UC[\w-]{22}/i);
    return match ? match[0] : '';
}

async function main() {
    console.log('====================================================');
    console.log('   ILMO - Channel & Related Videos Removal Tool     ');
    console.log('====================================================\n');

    let args = process.argv.slice(2);
    let autoConfirm = false;

    if (args.includes('-y') || args.includes('--yes')) {
        autoConfirm = true;
        args = args.filter(a => a !== '-y' && a !== '--yes');
    }

    let searchTerm = args.join(' ').trim();

    if (!searchTerm) {
        searchTerm = await askQuestion('Enter channel name, @handle, or channel ID to remove: ');
    }

    if (!searchTerm) {
        console.log('No search term provided. Aborting.');
        return;
    }

    const normSearch = normalize(searchTerm);
    const searchUC = extractUCId(searchTerm);

    console.log(`\nSearching for: "${searchTerm}"...`);

    // 1. Inspect channels.json
    let channels = [];
    if (fs.existsSync(CHANNELS_JSON_PATH)) {
        try {
            channels = JSON.parse(fs.readFileSync(CHANNELS_JSON_PATH, 'utf8'));
        } catch (e) {
            console.error('Error reading channels.json:', e.message);
        }
    }

    // Match channels
    const matchingChannels = channels.filter(c => {
        const name = normalize(c.name || c.channel_name);
        const handle = normalize(c.handle);
        const id = (c.id || '').trim();
        const urlId = extractUCId(c.channel_url);

        if (searchUC && (id === searchUC || urlId === searchUC)) return true;
        if (normSearch.startsWith('@') && handle === normSearch) return true;
        if (name === normSearch || name.includes(normSearch)) return true;
        if (handle === normSearch || handle.includes(normSearch)) return true;
        if (id && id.toLowerCase() === normSearch) return true;
        return false;
    });

    // 2. Inspect videos.json
    let videos = [];
    if (fs.existsSync(VIDEOS_JSON_PATH)) {
        try {
            videos = JSON.parse(fs.readFileSync(VIDEOS_JSON_PATH, 'utf8'));
        } catch (e) {
            console.error('Error reading videos.json:', e.message);
        }
    }

    // Collect all channel IDs and names identified
    const targetChannelIds = new Set();
    const targetChannelNames = new Set();
    const targetHandles = new Set();

    if (searchUC) targetChannelIds.add(searchUC);

    matchingChannels.forEach(c => {
        if (c.id) targetChannelIds.add(c.id);
        const uId = extractUCId(c.channel_url);
        if (uId) targetChannelIds.add(uId);
        if (c.name) targetChannelNames.add(normalize(c.name));
        if (c.channel_name) targetChannelNames.add(normalize(c.channel_name));
        if (c.handle) targetHandles.add(normalize(c.handle));
    });

    // If no channel entry was found in channels.json, still allow matching directly by search term in videos
    if (matchingChannels.length === 0) {
        targetChannelNames.add(normSearch);
    }

    function isVideoMatch(v) {
        const vChannelId = (v.channelId || v.channel_id || '').trim();
        const vChannel = normalize(v.channel || v.channel_title);

        if (vChannelId && targetChannelIds.has(vChannelId)) return true;
        for (const name of targetChannelNames) {
            if (name && (vChannel === name || vChannel.includes(name))) return true;
        }
        return false;
    }

    const matchingVideos = videos.filter(isVideoMatch);

    // Summary of found items
    console.log('\n----------------- Search Results -------------------');
    if (matchingChannels.length > 0) {
        console.log(`Channels found in channels.json (${matchingChannels.length}):`);
        matchingChannels.forEach((c, idx) => {
            const chId = c.id || extractUCId(c.channel_url) || 'N/A';
            console.log(`  ${idx + 1}. ${c.name || c.channel_name} (${c.handle || 'no handle'})`);
            console.log(`     ID: ${chId} | Country: ${c.country || 'Unknown'} | Category: ${c.category || 'General'}`);
        });
    } else {
        console.log('No exact channel entry found in channels.json.');
        console.log(`Will search videos matching title/channel name: "${searchTerm}"`);
    }

    console.log(`\nVideos found in videos.json: ${matchingVideos.length.toLocaleString()}`);

    if (matchingChannels.length === 0 && matchingVideos.length === 0) {
        console.log('\nNo matching channel or videos were found. Nothing to remove.');
        return;
    }

    // Confirmation
    if (!autoConfirm) {
        const confirm = await askQuestion('\nDo you want to PERMANENTLY REMOVE this channel and all related videos? (y/N): ');
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log('Operation cancelled by user.');
            return;
        }
    }

    console.log('\nRemoving across all files...');

    // 1. Clean videos.json
    const initialVideoCount = videos.length;
    const cleanVideos = videos.filter(v => !isVideoMatch(v));
    const videosRemoved = initialVideoCount - cleanVideos.length;
    fs.writeFileSync(VIDEOS_JSON_PATH, JSON.stringify(cleanVideos, null, 2), 'utf8');
    console.log(`[OK] videos.json: removed ${videosRemoved.toLocaleString()} videos (remaining: ${cleanVideos.length.toLocaleString()})`);

    // 2. Clean videos.js
    if (fs.existsSync(VIDEOS_JS_PATH)) {
        try {
            const jsContent = fs.readFileSync(VIDEOS_JS_PATH, 'utf8');
            const prefix = 'window.VIDEOS_DATA = ';
            const startIdx = jsContent.indexOf(prefix);
            if (startIdx !== -1) {
                let jsonStr = jsContent.substring(startIdx + prefix.length).trim();
                if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);
                const jsVideos = JSON.parse(jsonStr);
                const cleanJsVideos = jsVideos.filter(v => !isVideoMatch(v));
                fs.writeFileSync(VIDEOS_JS_PATH, prefix + JSON.stringify(cleanJsVideos) + ';', 'utf8');
                console.log(`[OK] videos.js: synchronized (${cleanJsVideos.length.toLocaleString()} videos remaining)`);
            }
        } catch (e) {
            console.error('Error updating videos.js:', e.message);
        }
    }

    // 3. Clean channels.json
    function isChannelMatch(c) {
        const name = normalize(c.name || c.channel_name);
        const handle = normalize(c.handle);
        const id = (c.id || '').trim();
        const urlId = extractUCId(c.channel_url);

        if (id && targetChannelIds.has(id)) return true;
        if (urlId && targetChannelIds.has(urlId)) return true;
        if (handle && targetHandles.has(handle)) return true;
        for (const targetName of targetChannelNames) {
            if (targetName && (name === targetName || name.includes(targetName))) return true;
        }
        return false;
    }

    const initialChannelCount = channels.length;
    const cleanChannels = channels.filter(c => !isChannelMatch(c));
    const channelsRemoved = initialChannelCount - cleanChannels.length;
    fs.writeFileSync(CHANNELS_JSON_PATH, JSON.stringify(cleanChannels, null, 2), 'utf8');
    console.log(`[OK] channels.json: removed ${channelsRemoved} channel(s) (remaining: ${cleanChannels.length.toLocaleString()})`);

    // 4. Clean islam_channels.json
    if (fs.existsSync(ISLAM_CHANNELS_JSON_PATH)) {
        try {
            const islamChannels = JSON.parse(fs.readFileSync(ISLAM_CHANNELS_JSON_PATH, 'utf8'));
            const cleanIslam = islamChannels.filter(c => !isChannelMatch(c));
            fs.writeFileSync(ISLAM_CHANNELS_JSON_PATH, JSON.stringify(cleanIslam, null, 2), 'utf8');
            console.log(`[OK] islam_channels.json: synchronized (${cleanIslam.length.toLocaleString()} remaining)`);
        } catch (e) {
            console.error('Error updating islam_channels.json:', e.message);
        }
    }

    // 5. Clean islam_channels.csv
    if (fs.existsSync(ISLAM_CHANNELS_CSV_PATH)) {
        try {
            const csvContent = fs.readFileSync(ISLAM_CHANNELS_CSV_PATH, 'utf8');
            const lines = csvContent.split('\n');
            const cleanLines = lines.filter((line, idx) => {
                if (idx === 0) return true; // keep header
                const l = normalize(line);
                for (const id of targetChannelIds) {
                    if (id && l.includes(id.toLowerCase())) return false;
                }
                for (const name of targetChannelNames) {
                    if (name && l.includes(name)) return false;
                }
                for (const handle of targetHandles) {
                    if (handle && l.includes(handle)) return false;
                }
                return true;
            });
            fs.writeFileSync(ISLAM_CHANNELS_CSV_PATH, cleanLines.join('\n'), 'utf8');
            console.log(`[OK] islam_channels.csv: synchronized (${cleanLines.length - 1} channels remaining)`);
        } catch (e) {
            console.error('Error updating islam_channels.csv:', e.message);
        }
    }

    // 6. Clean channel_ids.txt
    if (fs.existsSync(CHANNEL_IDS_TXT_PATH)) {
        try {
            const txt = fs.readFileSync(CHANNEL_IDS_TXT_PATH, 'utf8');
            const lines = txt.split('\n');
            const cleanLines = lines.filter(line => {
                const trimmed = line.trim();
                return !targetChannelIds.has(trimmed);
            });
            fs.writeFileSync(CHANNEL_IDS_TXT_PATH, cleanLines.join('\n'), 'utf8');
            console.log(`[OK] channel_ids.txt: synchronized`);
        } catch (e) {
            console.error('Error updating channel_ids.txt:', e.message);
        }
    }

    // 7. Clean channel_ids_with_names.txt
    if (fs.existsSync(CHANNEL_IDS_WITH_NAMES_PATH)) {
        try {
            const txt = fs.readFileSync(CHANNEL_IDS_WITH_NAMES_PATH, 'utf8');
            const lines = txt.split('\n');
            const cleanLines = lines.filter(line => {
                const l = normalize(line);
                for (const id of targetChannelIds) {
                    if (id && line.includes(id)) return false;
                }
                for (const name of targetChannelNames) {
                    if (name && l.includes(name)) return false;
                }
                return true;
            });
            fs.writeFileSync(CHANNEL_IDS_WITH_NAMES_PATH, cleanLines.join('\n'), 'utf8');
            console.log(`[OK] channel_ids_with_names.txt: synchronized`);
        } catch (e) {
            console.error('Error updating channel_ids_with_names.txt:', e.message);
        }
    }

    // 8. Clean channels_without_uc_id.txt
    if (fs.existsSync(CHANNELS_WITHOUT_UC_PATH)) {
        try {
            const txt = fs.readFileSync(CHANNELS_WITHOUT_UC_PATH, 'utf8');
            const lines = txt.split('\n');
            const cleanLines = lines.filter(line => {
                const l = normalize(line);
                for (const handle of targetHandles) {
                    if (handle && l.includes(handle)) return false;
                }
                for (const name of targetChannelNames) {
                    if (name && l.includes(name)) return false;
                }
                return true;
            });
            fs.writeFileSync(CHANNELS_WITHOUT_UC_PATH, cleanLines.join('\n'), 'utf8');
            console.log(`[OK] channels_without_uc_id.txt: synchronized`);
        } catch (e) {
            console.error('Error updating channels_without_uc_id.txt:', e.message);
        }
    }

    console.log('\n====================================================');
    console.log(` Successfully removed ${channelsRemoved} channel(s) and ${videosRemoved.toLocaleString()} video(s)!`);
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
});


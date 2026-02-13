/**
 * Medal Alert Test Script
 * 
 * Scans M:\Incoming\ for the latest DT_MEDALLISTS_DISCIPLINE XML file,
 * finds the most recent Canadian medal, and triggers a single MEDAL_ALERT
 * playout for testing.
 * 
 * Uses targeted folder reads (not recursive glob) for speed on network shares.
 * Structure: M:\Incoming\{DISCIPLINE}\{DATE}\{HOUR}\*DT_MEDALLISTS_DISCIPLINE*
 * 
 * You can also override with CLI arguments:
 *   node scripts/medal-test.js "Courtney Sarault" bronze
 *   node scripts/medal-test.js "Team Canada" gold
 * 
 * Usage:
 *   node scripts/medal-test.js                       (latest from M: drive)
 *   node scripts/medal-test.js "Name" gold|silver|bronze
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const axios = require('axios');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
    incomingRoot: 'M:\\Incoming',
    glowBaseUrl: 'http://localhost:5656',
    playoutEndpoint: '/api/v1/directplayout',
    templatePath: '/olympics/MEDAL_ALERT.html',
    casparServer: 'OVERLAY',
    casparChannel: '1',
    casparLayer: '20',
    webplayoutLayer: '20',
    outDuration: '30000',
    loopDuration: '5',
    loopEnabled: '1',
    targetOrganisation: 'CAN',
};

const MEDAL_MAP = {
    'ME_GOLD': 'gold',
    'ME_SILVER': 'silver',
    'ME_BRONZE': 'bronze',
};

// Medal priority for picking "latest" when dates are equal
const MEDAL_PRIORITY = { 'ME_GOLD': 3, 'ME_SILVER': 2, 'ME_BRONZE': 1 };

// Discipline folders to skip (no medal events)
const SKIP_DISCIPLINES = new Set(['CER', 'GEN', 'IOC', 'OBS', 'OLV', 'PCO', 'TRU', 'ART']);

// Ignore date folders before this (pre-Games)
const MIN_DATE = '2026-02-07';

// ---------------------------------------------------------------------------
// File Discovery (fast targeted reads, no recursive glob)
// ---------------------------------------------------------------------------

/**
 * Scan M:\Incoming\{DISCIPLINE}\{DATE}\{HOUR}\ for event-specific
 * DT_MEDALLISTS_ files (e.g. DT_MEDALLISTS_STKW500M). For each discipline,
 * walks backwards through date/hour folders and collects all event medallist
 * files from the latest folder that has any.
 *
 * Filenames start with a timestamp so sorting by name gives chronological order.
 * Uses plain readdirSync (no withFileTypes) for network share compatibility.
 */
function findMedallistFiles() {
    const results = [];

    // List discipline folders
    let disciplines;
    try {
        disciplines = fs.readdirSync(CONFIG.incomingRoot);
    } catch (err) {
        console.error(`  Cannot read ${CONFIG.incomingRoot}: ${err.message}`);
        return results;
    }

    // Filter out non-sport folders
    disciplines = disciplines.filter(d => !SKIP_DISCIPLINES.has(d));

    console.log(`  Scanning ${disciplines.length} discipline folder(s): ${disciplines.join(', ')}`);

    for (const disc of disciplines) {
        const discPath = path.join(CONFIG.incomingRoot, disc);

        // List date folders, sorted descending (newest first), skip pre-Games dates
        let dateDirs;
        try {
            dateDirs = fs.readdirSync(discPath)
                .filter(d => d >= MIN_DATE)
                .sort().reverse();
        } catch { continue; }

        let foundDate = false;

        // Walk dates newest-first; collect event files from ALL hours in the latest date
        for (const dateDir of dateDirs) {
            if (foundDate) break;
            const datePath = path.join(discPath, dateDir);

            let hourDirs;
            try {
                hourDirs = fs.readdirSync(datePath).sort().reverse();
            } catch { continue; }

            for (const hourDir of hourDirs) {
                const hourPath = path.join(datePath, hourDir);

                let entries;
                try {
                    entries = fs.readdirSync(hourPath);
                } catch { continue; }

                // Match event-specific DT_MEDALLISTS_ files (e.g. DT_MEDALLISTS_STKW500M)
                // but skip the cumulative DT_MEDALLISTS_DISCIPLINE files
                const matched = entries.filter(name =>
                    name.includes('DT_MEDALLISTS_') && !name.includes('DT_MEDALLISTS_DISCIPLINE')
                );

                if (matched.length > 0) {
                    console.log(`  ${disc}: ${dateDir}/${hourDir} -> ${matched.length} event file(s)`);
                    for (const fileName of matched) {
                        results.push({
                            path: path.join(hourPath, fileName),
                            disc,
                            date: dateDir,
                            hour: hourDir,
                        });
                    }
                    foundDate = true; // Found files in this date, check all hours but stop at this date
                }
            }
        }
    }

    // Sort by filename descending (filenames start with timestamp, so newest first)
    results.sort((a, b) => path.basename(b.path).localeCompare(path.basename(a.path)));

    return results;
}

// ---------------------------------------------------------------------------
// XML Parsing
// ---------------------------------------------------------------------------

async function parseXmlFile(filePath) {
    const xmlData = fs.readFileSync(filePath, 'utf-8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    return parser.parseStringPromise(xmlData);
}

/**
 * Extract Canadian medals from an event-specific medallist XML.
 * Structure: OdfBody > Competition > Medal[] (medals directly under Competition).
 * Event name is in ExtendedInfos > SportDescription > EventName.
 */
function extractCanadianMedals(parsed, discCode) {
    const results = [];

    try {
        const body = parsed.OdfBody;
        const competition = body.Competition;

        // Event name from ExtendedInfos
        const eventName = competition.ExtendedInfos?.SportDescription?.EventName || '';
        const eventDate = body.Date || '';

        // Medals are directly under Competition
        let medals = competition.Medal;
        if (!Array.isArray(medals)) medals = medals ? [medals] : [];

        for (const medal of medals) {
            const medalCode = medal.Code || '';
            const medalType = MEDAL_MAP[medalCode];
            if (!medalType) continue;

            let competitors = medal.Competitor;
            if (!Array.isArray(competitors)) competitors = competitors ? [competitors] : [];

            for (const competitor of competitors) {
                if ((competitor.Organisation || '') !== CONFIG.targetOrganisation) continue;

                let displayName;
                if (competitor.Type === 'T') {
                    displayName = 'Team Canada';
                } else {
                    const composition = competitor.Composition;
                    if (composition) {
                        let athletes = composition.Athlete;
                        if (!Array.isArray(athletes)) athletes = athletes ? [athletes] : [];
                        if (athletes.length > 0 && athletes[0].Description) {
                            const desc = athletes[0].Description;
                            displayName = `${desc.GivenName || ''} ${desc.FamilyName || ''}`.trim();
                        }
                    }
                    if (!displayName) displayName = 'Canada';
                }

                results.push({
                    name: `${discCode} - ${displayName}`,
                    medal: medalType,
                    medalCode,
                    eventName,
                    eventDate,
                });
            }
        }
    } catch (err) {
        console.error(`  Error parsing XML: ${err.message}`);
    }

    return results;
}

// ---------------------------------------------------------------------------
// Find the latest Canadian medal from M:
// ---------------------------------------------------------------------------

async function getLatestMedalFromDrive() {
    console.log(`  Scanning ${CONFIG.incomingRoot}...`);

    const files = findMedallistFiles();

    if (files.length === 0) {
        console.log('  No event medallist files found.');
        return null;
    }

    console.log(`  Found ${files.length} event file(s). Checking newest first...`);

    // Files are sorted newest-first by timestamp. Walk through until we find
    // one with a Canadian medal (each file is one event).
    for (const file of files) {
        console.log(`  Checking: ${path.basename(file.path)}`);

        let parsed;
        try {
            parsed = await parseXmlFile(file.path);
        } catch (err) {
            console.error(`  Failed to parse: ${err.message}`);
            continue;
        }

        const medals = extractCanadianMedals(parsed, file.disc);
        if (medals.length === 0) continue;

        // Pick the last medal in the file (bottom = most recent)
        const latest = medals[medals.length - 1];

        console.log(`  Found: ${latest.name} - ${latest.medal} (${latest.eventName}, ${latest.eventDate})`);

        return {
            name: latest.name,
            medal: latest.medal,
            source: `${latest.eventName} (${latest.eventDate}) from ${path.basename(file.path)}`,
        };
    }

    console.log('  No Canadian medals found in any file.');
    return null;
}

// ---------------------------------------------------------------------------
// Resolve what to play
// ---------------------------------------------------------------------------

async function resolveTestData() {
    const args = process.argv.slice(2);

    // CLI override
    if (args.length >= 2) {
        const name = args[0];
        const medal = args[1].toLowerCase();
        if (!['gold', 'silver', 'bronze'].includes(medal)) {
            console.error(`  Invalid medal type: "${args[1]}". Use gold, silver, or bronze.`);
            process.exit(1);
        }
        return { name, medal, source: 'command-line arguments' };
    }

    // Scan M: drive for the latest
    const fromDrive = await getLatestMedalFromDrive();
    if (fromDrive) return fromDrive;

    console.error('  No Canadian medals found on M: drive and no CLI arguments provided.');
    console.error('  Usage: node scripts/medal-test.js "Athlete Name" gold|silver|bronze');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Playout
// ---------------------------------------------------------------------------

async function triggerPlayout(name, medal, command) {
    const url = `${CONFIG.glowBaseUrl}${CONFIG.playoutEndpoint}`;
    const payload = {
        casparServer: CONFIG.casparServer,
        casparChannel: CONFIG.casparChannel,
        casparLayer: CONFIG.casparLayer,
        webplayoutLayer: CONFIG.webplayoutLayer,
        relativeTemplatePath: CONFIG.templatePath,
        out: CONFIG.outDuration,
        command,
        DataFields: [
            { field: 'f81', value: CONFIG.loopDuration },
            { field: 'f68', value: CONFIG.loopEnabled },
            { field: 'f1', value: name },
            { field: 'f2', value: medal },
        ],
    };

    const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
    });
    return response.status;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('');
    console.log('  Medal Alert Test');
    console.log('  ================');

    const data = await resolveTestData();

    console.log('');
    console.log(`  Playing:  ${data.name}`);
    console.log(`  Medal:    ${data.medal}`);
    console.log(`  Source:   ${data.source}`);
    console.log(`  Server:   ${CONFIG.glowBaseUrl}`);
    console.log('');

    try {
        console.log('  Sending play...');
        const status = await triggerPlayout(data.name, data.medal, 'play');
        console.log(`  Playout triggered (HTTP ${status})`);

        const outMs = parseInt(CONFIG.outDuration, 10);
        console.log(`  Graphic will auto-stop in ${outMs / 1000}s, then Play All resumes.`);
        console.log('  Waiting...');

        // Wait for auto-out, then resume Play All
        await new Promise(r => setTimeout(r, outMs + 1000));
        console.log('  Resuming Play All...');
        await resumePlayAll();
        console.log('  Done.');
        console.log('');
    } catch (err) {
        const status = err.response ? err.response.status : 'N/A';
        console.error(`  Failed [${status}]: ${err.message}`);
        console.error('  Make sure the GLoW server is running on ' + CONFIG.glowBaseUrl);
        console.error('');
        process.exit(1);
    }
}

async function resumePlayAll() {
    // 1. Clear all layers
    try {
        const panicUrl = `${CONFIG.glowBaseUrl}/api/v1/panic`;
        await axios.get(panicUrl, { timeout: 10000 });
        console.log('  Cleared all layers.');
    } catch (err) {
        console.error(`  Failed to clear layers: ${err.message}`);
    }

    // Brief pause to let clear complete
    await new Promise(r => setTimeout(r, 1000));

    // 2. Restart Play All
    try {
        const playAllUrl = `${CONFIG.glowBaseUrl}/api/v1/invokeExtensionFunction?function=playAllControl`;
        await axios.get(playAllUrl, { timeout: 10000 });
        console.log('  Play All resumed.');
    } catch (err) {
        console.error(`  Failed to resume Play All: ${err.message}`);
    }
}

main();

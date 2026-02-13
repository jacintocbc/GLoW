/**
 * Medal Monitor Script
 * 
 * Polls M:\Incoming\ for Olympic DT_MEDALLISTS_DISCIPLINE XML files,
 * detects Canadian medal winners from the last 24 hours, and triggers
 * the MEDAL_ALERT graphic via the GLoW direct playout API.
 * 
 * Each medal alert plays 3 times at 0, 5, and 10 minutes, then stops.
 * Multiple medals are queued sequentially.
 * 
 * Usage: node scripts/medal-monitor.js
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const axios = require('axios');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
    // Where to scan for XML files
    incomingRoot: 'M:\\Incoming',

    // Poll interval in milliseconds (60 seconds)
    pollInterval: 60 * 1000,

    // GLoW server base URL
    glowBaseUrl: 'http://localhost:5656',

    // Direct playout endpoint
    playoutEndpoint: '/api/v1/directplayout',

    // Template path (relative to ASSETS/templates/)
    templatePath: '/olympics/MEDAL_ALERT.html',

    // Playout target settings (from MEDAL_ALERT.html SPXGCTemplateDefinition)
    casparServer: 'OVERLAY',
    casparChannel: '1',
    casparLayer: '20',
    webplayoutLayer: '20',

    // Auto-stop after 30 seconds (matches template "out" default)
    outDuration: '30000',

    // Template field defaults
    loopDuration: '5',    // f81: duration in seconds per loop cycle
    loopEnabled: '1',     // f68: loop graphic on

    // Number of times to play each medal alert
    playCount: 3,

    // Minutes between each play (0, 5, 10)
    playIntervalMinutes: 5,

    // Organisation code to filter for
    targetOrganisation: 'CAN',

    // State file for tracking processed medals
    stateFile: path.join(__dirname, 'medal-monitor-state.json'),
};

// Medal code mapping
const MEDAL_MAP = {
    'ME_GOLD': 'gold',
    'ME_SILVER': 'silver',
    'ME_BRONZE': 'bronze',
};

// Discipline folders to skip (no medal events)
const SKIP_DISCIPLINES = new Set(['CER', 'GEN', 'IOC', 'OBS', 'OLV', 'PCO', 'TRU', 'ART']);

// Ignore date folders before this (pre-Games)
const MIN_DATE = '2026-02-07';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------

function loadState() {
    try {
        if (fs.existsSync(CONFIG.stateFile)) {
            const raw = fs.readFileSync(CONFIG.stateFile, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (err) {
        log('warn', `Could not load state file, starting fresh: ${err.message}`);
    }
    return { processedMedals: {}, fileModTimes: {} };
}

function saveState(state) {
    try {
        fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
        log('error', `Could not save state file: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/**
 * Fast targeted scan using the known folder structure:
 *   M:\Incoming\{DISCIPLINE}\{DATE}\{HOUR}\*DT_MEDALLISTS_*
 * 
 * Finds event-specific medallist files (e.g. DT_MEDALLISTS_STKW500M),
 * skipping cumulative DT_MEDALLISTS_DISCIPLINE files. For each discipline,
 * collects all event files from the latest date/hour folder that has any.
 *
 * Uses plain readdirSync (no withFileTypes) for network share compatibility.
 */
function findMedallistFiles() {
    const results = [];

    // List discipline folders (e.g. STK, FIG, etc.)
    let disciplines;
    try {
        disciplines = fs.readdirSync(CONFIG.incomingRoot)
            .filter(d => !SKIP_DISCIPLINES.has(d));
    } catch (err) {
        log('error', `Cannot read ${CONFIG.incomingRoot}: ${err.message}`);
        return results;
    }

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
                    for (const fileName of matched) {
                        results.push({ path: path.join(hourPath, fileName), disc });
                    }
                    foundDate = true; // Found files in this date, check all hours but stop at this date
                }
            }
        }
    }

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
 * Returns an array of { key, name, medal, eventName, eventDate }
 */
function extractCanadianMedals(parsed, discCode) {
    const results = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
        const body = parsed.OdfBody;
        const competition = body.Competition;

        // Event info from ExtendedInfos and document code
        const eventName = competition.ExtendedInfos?.SportDescription?.EventName || '';
        const eventDateStr = body.Date || '';
        const eventCode = body.DocumentCode || '';

        // Check if event is within the last 24 hours
        if (eventDateStr) {
            const eventDate = new Date(eventDateStr + 'T00:00:00');
            if (eventDate < oneDayAgo) {
                log('debug', `Skipping old event: ${eventName} (${eventDateStr})`);
                return results;
            }
        }

        // Medals are directly under Competition
        let medals = competition.Medal;
        if (!Array.isArray(medals)) {
            medals = medals ? [medals] : [];
        }

        for (const medal of medals) {
            const medalCode = medal.Code || '';
            const medalType = MEDAL_MAP[medalCode];
            if (!medalType) continue;

            let competitors = medal.Competitor;
            if (!Array.isArray(competitors)) {
                competitors = competitors ? [competitors] : [];
            }

            for (const competitor of competitors) {
                const org = competitor.Organisation || '';
                if (org !== CONFIG.targetOrganisation) continue;

                const competitorType = competitor.Type || '';
                const uniqueKey = `${eventCode}_${medalCode}_${org}`;

                let displayName;
                if (competitorType === 'T') {
                    displayName = 'Team Canada';
                } else {
                    const composition = competitor.Composition;
                    if (composition) {
                        let athletes = composition.Athlete;
                        if (!Array.isArray(athletes)) {
                            athletes = athletes ? [athletes] : [];
                        }
                        if (athletes.length > 0) {
                            const desc = athletes[0].Description;
                            if (desc) {
                                const given = desc.GivenName || '';
                                const family = desc.FamilyName || '';
                                displayName = `${given} ${family}`.trim();
                            }
                        }
                    }
                    if (!displayName) {
                        displayName = 'Canada';
                    }
                }

                results.push({
                    key: uniqueKey,
                    name: `${discCode} - ${displayName}`,
                    medal: medalType,
                    eventName,
                    eventDate: eventDateStr,
                });

                log('info', `Found CAN medal: ${discCode} - ${displayName} - ${medalType} (${eventName})`);
            }
        }
    } catch (err) {
        log('error', `Error extracting medals from XML: ${err.message}`);
    }

    return results;
}

// ---------------------------------------------------------------------------
// Playout
// ---------------------------------------------------------------------------

async function triggerDirectPlayout(name, medalType, command) {
    const url = `${CONFIG.glowBaseUrl}${CONFIG.playoutEndpoint}`;
    const payload = {
        casparServer: CONFIG.casparServer,
        casparChannel: CONFIG.casparChannel,
        casparLayer: CONFIG.casparLayer,
        webplayoutLayer: CONFIG.webplayoutLayer,
        relativeTemplatePath: CONFIG.templatePath,
        out: CONFIG.outDuration,
        command: command,
        DataFields: [
            { field: 'f81', value: CONFIG.loopDuration },
            { field: 'f68', value: CONFIG.loopEnabled },
            { field: 'f1', value: name },
            { field: 'f2', value: medalType },
        ],
    };

    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        log('info', `Playout ${command} response: ${response.status} - ${name} (${medalType})`);

        // Trigger external button press on play
        if (command === 'play') {
            await triggerExternalPress();
        }

        return true;
    } catch (err) {
        const status = err.response ? err.response.status : 'N/A';
        log('error', `Playout ${command} failed [${status}]: ${err.message}`);
        return false;
    }
}

async function triggerExternalPress() {
    try {
        await axios.post('http://10.141.0.90:8000/api/location/9/3/2/press', {}, { timeout: 5000 });
        log('info', 'External trigger sent.');
    } catch (err) {
        log('warn', `External trigger failed: ${err.message}`);
    }
}

/**
 * Resume the Play All sequence in the GLoW controller via the
 * invokeExtensionFunction API, which sends a Socket.IO message
 * to the controller UI calling playAllControl().
 */
async function resumePlayAll() {
    // 1. Clear all layers
    try {
        const panicUrl = `${CONFIG.glowBaseUrl}/api/v1/panic`;
        await axios.get(panicUrl, { timeout: 10000 });
        log('info', 'Cleared all layers.');
    } catch (err) {
        log('warn', `Failed to clear layers: ${err.message}`);
    }

    // Brief pause to let clear complete
    await delay(1000);

    // 2. Restart Play All
    try {
        const playAllUrl = `${CONFIG.glowBaseUrl}/api/v1/invokeExtensionFunction?function=playAllControl`;
        await axios.get(playAllUrl, { timeout: 10000 });
        log('info', 'Play All resumed.');
    } catch (err) {
        log('warn', `Failed to resume Play All: ${err.message}`);
    }
}

/**
 * Schedule 3 plays for a single medal at 0, 5, and 10 minutes.
 * After each play's auto-out, resumes the Play All rundown loop.
 * Returns a promise that resolves after the last play's auto-out has elapsed.
 */
function scheduleMedalPlayout(name, medalType, eventName) {
    return new Promise((resolve) => {
        const intervalMs = CONFIG.playIntervalMinutes * 60 * 1000;
        const outMs = parseInt(CONFIG.outDuration, 10);
        let playsDone = 0;

        async function doPlay() {
            playsDone++;
            log('info', `Playing medal alert ${playsDone}/${CONFIG.playCount}: ${name} - ${medalType} (${eventName})`);

            // Send play command
            await triggerDirectPlayout(name, medalType, 'play');

            // After auto-out finishes, resume Play All
            setTimeout(async () => {
                log('info', 'Medal alert auto-out complete, resuming Play All...');
                await resumePlayAll();
            }, outMs + 1000);

            if (playsDone < CONFIG.playCount) {
                // Schedule next play
                log('info', `Next play in ${CONFIG.playIntervalMinutes} minutes...`);
                setTimeout(doPlay, intervalMs);
            } else {
                // All plays done; wait for the last auto-out + resume, then resolve
                log('info', `All ${CONFIG.playCount} plays completed for: ${name} - ${medalType}`);
                setTimeout(resolve, outMs + 2000);
            }
        }

        doPlay();
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Playout Queue (sequential processing of multiple medals)
// ---------------------------------------------------------------------------

let playoutQueue = [];
let isProcessingQueue = false;

function enqueueMedal(medalInfo) {
    playoutQueue.push(medalInfo);
    log('info', `Queued medal alert: ${medalInfo.name} - ${medalInfo.medal} (${medalInfo.eventName}). Queue size: ${playoutQueue.length}`);
    processQueue();
}

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (playoutQueue.length > 0) {
        const medal = playoutQueue.shift();
        log('info', `--- Starting playout sequence for: ${medal.name} - ${medal.medal} (${medal.eventName}) ---`);
        await scheduleMedalPlayout(medal.name, medal.medal, medal.eventName);
        log('info', `--- Finished playout sequence for: ${medal.name} - ${medal.medal} ---`);
    }

    isProcessingQueue = false;
}

// ---------------------------------------------------------------------------
// Main Poll Loop
// ---------------------------------------------------------------------------

let state = loadState();
let pollTimer = null;

async function poll() {
    log('info', 'Scanning for new medallist files...');

    const files = findMedallistFiles();

    if (files.length === 0) {
        log('info', 'No medallist files found.');
        return;
    }

    log('info', `Found ${files.length} medallist file(s).`);

    for (const file of files) {
        const normalizedPath = file.path;

        // Check file modification time
        let stats;
        try {
            stats = fs.statSync(normalizedPath);
        } catch (err) {
            log('warn', `Cannot stat file ${normalizedPath}: ${err.message}`);
            continue;
        }

        const modTime = stats.mtime.toISOString();
        const lastModTime = state.fileModTimes[normalizedPath];

        if (lastModTime && lastModTime === modTime) {
            // File hasn't changed since last poll
            continue;
        }

        log('info', `Processing file: ${normalizedPath} (modified: ${modTime})`);

        // Parse the XML
        let parsed;
        try {
            parsed = await parseXmlFile(normalizedPath);
        } catch (err) {
            log('error', `Failed to parse ${normalizedPath}: ${err.message}`);
            continue;
        }

        // Extract Canadian medals
        const canadianMedals = extractCanadianMedals(parsed, file.disc);

        // Filter out already-processed medals
        let newMedals = 0;
        for (const medal of canadianMedals) {
            if (state.processedMedals[medal.key]) {
                log('info', `Already alerted: ${medal.key} (${medal.name} - ${medal.medal})`);
                continue;
            }

            // Mark as processed
            state.processedMedals[medal.key] = {
                alertedAt: new Date().toISOString(),
                name: medal.name,
                medal: medal.medal,
                eventName: medal.eventName,
                eventDate: medal.eventDate,
            };
            newMedals++;

            // Enqueue for playout
            enqueueMedal(medal);
        }

        if (newMedals > 0) {
            log('info', `${newMedals} new Canadian medal(s) queued for playout.`);
        }

        // Update file mod time in state
        state.fileModTimes[normalizedPath] = modTime;
        saveState(state);
    }
}

// ---------------------------------------------------------------------------
// Startup & Shutdown
// ---------------------------------------------------------------------------

function start() {
    log('info', '========================================');
    log('info', 'Medal Monitor starting');
    log('info', `Scanning: ${CONFIG.incomingRoot}`);
    log('info', `GLoW API: ${CONFIG.glowBaseUrl}`);
    log('info', `Poll interval: ${CONFIG.pollInterval / 1000}s`);
    log('info', `Play schedule: ${CONFIG.playCount}x at ${CONFIG.playIntervalMinutes}-min intervals`);
    log('info', '========================================');

    // Run first poll immediately
    poll();

    // Then poll on interval
    pollTimer = setInterval(poll, CONFIG.pollInterval);
}

function shutdown() {
    log('info', 'Shutting down medal monitor...');
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    saveState(state);
    log('info', 'State saved. Goodbye.');
    process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Go
start();

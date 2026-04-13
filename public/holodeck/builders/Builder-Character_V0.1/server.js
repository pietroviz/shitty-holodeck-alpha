const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file if present
try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
        const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
        if (match && !process.env[match[1]]) {
            process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
    }
} catch (e) { /* no .env file */ }

const PORT = 8083;
const MIME = {
    html: 'text/html', js: 'application/javascript', css: 'text/css',
    json: 'application/json', fbx: 'application/octet-stream',
    png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
};

// API key can come from env or be passed per-request from the client
const ENV_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Character prompt system message ──────────────────────

const SYSTEM_PROMPT = `You are a character configuration assistant. Given a text description of a character, return a JSON object with the appropriate configuration values.

Available configuration keys and their valid values:

BODY:
- heightPreset: "squat" | "medium" | "tall"
- widthPreset: "narrow" | "moderate" | "wide"
- bodyShape: "roundedBox" | "cylinder" | "capsule" | "cone" | "invertedCone" | "hexagon" | "sphere" | "barrel"

HEAD:
- headShape: "roundedBox" | "sphere" | "cylinder" | "cone" | "diamond" | "hexagon" | "star" | "triangle"
- headHeightPreset: "squat" | "medium" | "tall"
- headWidthPreset: "narrow" | "moderate" | "wide"

FACE:
- faceHeightPreset: "squat" | "medium" | "tall"
- faceWidthPreset: "narrow" | "moderate" | "wide"
- facePlacement: "high" | "mid" | "low"
- eyeShape: "circle" | "tallPill" | "widePill" | "roundedSquare" | "tallOval" | "wideOval"

COLORS (hex strings):
- scalpColor: hex color for the top of the head
- skinColor: hex color for the face/skin
- torsoColor: hex color for the shirt/top
- bottomColor: hex color for the pants/bottom
- eyeIrisColor: hex color for the iris
- lipColor: hex color for lips

HAIR:
- hairStyle: "none" | "prop_afro" | "prop_mohawk" | "prop_hair_bow"
- hairColor: hex color

HATS:
- hatStyle: "none" | "prop_baseball_cap" | "prop_cowboy_hat" | "prop_crown" | "prop_top_hat" | "prop_wizard_hat" | "prop_santa_hat" | "prop_pirate_hat" | "prop_sun_hat" | "prop_tiara" | "prop_grad_cap" | "prop_helmet" | "prop_army_helmet" | "prop_knight_helm" | "prop_viking_helmet" | "prop_bunny_ears" | "prop_fox_ears"
- hatColor: hex color

GLASSES:
- glassesStyle: "none" | "prop_round_glasses" | "prop_square_glasses" | "prop_sunglasses" | "prop_monocle" | "prop_heart_glasses" | "prop_eye_patch"
- glassesColor: hex color

FACIAL HAIR:
- facialHairStyle: "none" | "prop_mustache" | "prop_full_beard" | "prop_goatee" | "prop_soul_patch" | "prop_long_beard"
- facialHairColor: hex color

RULES:
- Only include keys that should change based on the description
- Return ONLY valid JSON, no markdown, no explanation
- Use hex color strings like "#ff0000"
- Be creative with color choices that match the character concept
- Think about what body shape, proportions, and accessories fit the description
- If the description mentions a known character archetype (wizard, knight, etc), choose appropriate accessories and colors`;

// ── API proxy handler ────────────────────────────────────

function handleApiPrompt(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        let parsed;
        try {
            parsed = JSON.parse(body);
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
        }

        const apiKey = parsed.apiKey || ENV_API_KEY;
        if (!apiKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'no_api_key' }));
            return;
        }

        const userPrompt = parsed.prompt || '';

        const payload = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const options = {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const apiReq = https.request(options, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => { data += chunk; });
            apiRes.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.error) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: result.error.message || 'API error' }));
                        return;
                    }
                    // Extract text content from Claude response
                    const text = result.content?.[0]?.text || '{}';
                    // Parse the JSON from Claude's response (strip any markdown fencing)
                    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const delta = JSON.parse(jsonStr);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ delta }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to parse API response', raw: data }));
                }
            });
        });

        apiReq.on('error', (e) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        });

        apiReq.write(payload);
        apiReq.end();
    });
}

// ── Save character to assets/characters/ ─────────────────

function handleSaveCharacter(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            if (!data.id || !data.payload?.state) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing id or payload.state' }));
                return;
            }
            const dir = path.join(process.cwd(), 'assets', 'characters');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const fp = path.join(dir, `${data.id}.json`);
            fs.writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, path: `assets/characters/${data.id}.json` }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}

// ── Server ───────────────────────────────────────────────

http.createServer((req, res) => {
    // CORS headers for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API endpoint
    if (req.url === '/api/prompt' && req.method === 'POST') {
        handleApiPrompt(req, res);
        return;
    }

    // Save character to assets/characters/ folder
    if (req.url === '/api/save-character' && req.method === 'POST') {
        handleSaveCharacter(req, res);
        return;
    }

    // Static file serving
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';

    const fp = path.join(process.cwd(), decodeURIComponent(url));
    const ext = path.extname(fp).slice(1);

    fs.readFile(fp, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));

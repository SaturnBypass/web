import geoip from 'geoip-lite';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';

// Helper function untuk membaca database
async function readDatabase() {
    try {
        const data = await fs.readFile(path.join(process.cwd(), 'database.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        return null;
    }
}

async function readDBS() {
    try {
        const data = await fs.readFile(path.join(process.cwd(), 'dbs.json'), 'utf8');
        return JSON.parse(data);
    } catch {
        return {}; // Jika file tidak ada atau error, kembalikan objek kosong
    }
}

async function writeDBS(data) {
    try {
        await fs.writeFile(path.join(process.cwd(), 'dbs.json'), JSON.stringify(data, null, 4));
    } catch (error) {
        console.error('Error writing to dbs.json:', error);
    }
}

// Function untuk check VPN/Proxy menggunakan proxycheck.io
async function checkVPN(ip) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'proxycheck.io',
            path: `/v2/${ip}?vpn=1`, // Ganti dengan API key Anda
            method: 'GET'
        };

        const req = https.request(options, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result[ip] && result[ip].proxy === 'yes') {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch (error) {
                    console.error('Error parsing VPN check result:', error);
                    resolve(false);
                }
            });
        });

        req.on('error', error => {
            console.error('Error checking VPN:', error);
            resolve(false);
        });

        req.end();
    });
}

// Middleware untuk validasi API key
async function validateApiKey(req, res) {
    const key = req.query.key;

    if (!key) {
        res.status(400).json({ error: 'API key is required' });
        return false;
    }

    try {
        const database = await readDatabase();
        if (!database) {
            res.status(500).json({ error: 'Database error' });
            return false;
        }

        const keyData = database.keys.find(k => k.key === key);
        if (!keyData) {
            res.status(401).json({ error: 'Invalid API key' });
            return false;
        }

        const currentDate = new Date();
        const expiryDate = new Date(keyData.expiry);
        if (currentDate > expiryDate) {
            res.status(401).json({ error: 'API key has expired' });
            return false;
        }

        req.keyData = keyData;
        return true;
    } catch (error) {
        console.error('Error validating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
        return false;
    }
}

export default async function handler(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    
    if (pathname === '/') {
        if (req.method === 'GET') {
            const filePath = path.join(process.cwd(), 'index.html');
            const fileContent = await fs.readFile(filePath, 'utf8');
            res.status(200).send(fileContent);
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } else if (pathname === '/brands') {
        if (req.method === 'GET' || req.method === 'POST') {
            const isValid = await validateApiKey(req, res);
            if (!isValid) return;

            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'Brand ID is required' });
            }

            res.json({
                brand: id,
                keyInfo: {
                    owner: req.keyData.owner,
                    type: req.keyData.type
                }
            });
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } else if (pathname === '/ipcheck') {
        if (req.method === 'GET' || req.method === 'POST') {
            const isValid = await validateApiKey(req, res);
            if (!isValid) return;

            try {
                const { id: ipAddress } = req.query;

                if (!ipAddress) {
                    return res.status(400).json({ error: 'IP address is required' });
                }

                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (!ipRegex.test(ipAddress)) {
                    return res.status(400).json({ error: 'Invalid IP address format' });
                }

                const dbs = await readDBS();

                // Cek apakah data IP sudah ada di dbs.json
                if (dbs[ipAddress]) {
                    return res.json(dbs[ipAddress]);
                }

                // Jika tidak ada, lakukan pengecekan VPN dan simpan ke dbs.json
                const geo = geoip.lookup(ipAddress);
                const isVPN = await checkVPN(ipAddress);

                const response = {
                    ip: ipAddress,
                    country: geo ? geo.country : "Unknown",
                    countryCode: geo ? geo.country : null,
                    isVPN: isVPN,
                    keyInfo: {
                        owner: req.keyData.owner,
                        type: req.keyData.type
                    }
                };

                // Simpan hasil ke dbs.json
                dbs[ipAddress] = response;
                await writeDBS(dbs);

                res.json(response);
            } catch (error) {
                console.error('Error in /ipcheck:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } else if (pathname === '/detectbot') {
        if (req.method === 'GET' || req.method === 'POST') {
            const isValid = await validateApiKey(req, res);
            if (!isValid) return;

            const { id } = req.query;

            if (!id) {
                return res.status(400).json({ error: 'User Agent is required' });
            }

            const botPatterns = [
                // Search engine bots
                /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i, /sogou/i,
                /duckduckbot/i, /yahoo/i, /exabot/i, /mj12bot/i, /ahrefs/i,

                // Social media bots
                /twitterbot/i, /facebookexternalhit/i, /linkedinbot/i, /pinterestbot/i,
                /slackbot/i, /telegrambot/i, /whatsapp/i, /discordbot/i,
                /instagram/i, /mastodon/i, /matrix/i,

                // Generic bot identifiers
                /bot/i, /crawler/i, /spider/i, /scraper/i, /\+http/i
            ];

            const isBot = botPatterns.some(pattern => pattern.test(id));
            const isSuspicious = !id.includes('/') || 
                                id.length < 10 || 
                                /^(curl|wget|postman|insomnia)/i.test(id) ||
                                /^(python|java|php|ruby|go|rust|node)/i.test(id);

            res.json({
                userAgent: id,
                isBot: isBot,
                isSuspicious: isSuspicious,
                keyInfo: {
                    owner: req.keyData.owner,
                    type: req.keyData.type
                }
            });
        } else {
            res.status(405).json({ error: 'Method not allowed' });
        }
    } else {
        res.status(404).json({ error: 'Not found' });
    }
}

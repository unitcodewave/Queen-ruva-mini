const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const yts = require("yt-search");
const chalk = require('chalk'); // ADDED
const { initUserEnvIfMissing } = require('./settingsdb');
const { initEnvsettings, getSetting } = require('./settings');

//=======================================
const autoReact = getSetting('AUTO_REACT') || 'on';

//=======================================
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

//=======================================
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['🧩', '🍉', '💜', '🌟', '🪴', '💊', '💫', '🍂', '🌟', '🎋', '😶‍🌫️', '🫀', '🧿', '👀', '🇹🇿', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/G3ChQEjwrdVBTBUQHWSNHF?mode=ems_copy_t',
    ADMIN_LIST_PATH: './admin.json',
    IMAGE_PATH: 'https://files.catbox.moe/2x9ktu.png',
    NEWSLETTER_JID: '120363398106360290@newsletter',
    NEWSLETTER_MESSAGE_ID: '0088',
    OTP_EXPIRY: 300000,
    NEWS_JSON_URL: '',
    BOT_NAME: '☭𝙻𝙾𝙵𝚃-𝚀𝚄𝙰𝙽𝚃𝚄𝙼☭',
    OWNER_NAME: '𝙻𝚘𝚏𝚝',
    OWNER_NUMBER: '255778018545',
    BOT_VERSION: '1.0.0',
    BOT_FOOTER: '> 𝚙𝚘𝚠𝚎𝚛𝚎𝚍 𝚋𝚢 𝚂𝚒𝚛 𝙻𝙾𝙵𝚃',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6B9xFCxoAseuG1g610',
    BUTTON_IMAGES: {
        ALIVE: 'https://files.catbox.moe/prrvct.png',
        MENU: 'https://files.catbox.moe/2x9ktu.png',
        OWNER: 'https://files.catbox.moe/prrvct.png',
        SONG: 'https://files.catbox.moe/2x9ktu.png',
        VIDEO: 'https://files.catbox.moe/prrvct.png'
    }
};

// Initialize global variables
global.backenddynamic = false; // Set to true if you want dynamic features

//=======================================
// Helper function to reply to messages
async function replygckavi(text, socket, msg) {
    try {
        await socket.sendMessage(msg.key.remoteJid, {
            text: text,
            quoted: msg
        });
    } catch (error) {
        console.error('Reply error:', error);
    }
}

// List Message Generator
function generateListMessage(text, buttonTitle, sections) {
    return {
        text: text,
        footer: config.BOT_FOOTER,
        title: buttonTitle,
        buttonText: "ꜱᴇʟᴇᴄᴛ",
        sections: sections
    };
}

// Button Message Generator
function generateButtonMessage(content, buttons, image = null) {
    const message = {
        text: content,
        footer: config.BOT_FOOTER,
        buttons: buttons,
        headerType: 1
    };
    
    if (image) {
        message.headerType = 4;
        message.image = typeof image === 'string' ? { url: image } : image;
    }
    return message;
}

//=======================================
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});
const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

//=======================================
function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `${title}\n\n${content}\n\n${footer}`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

//=======================================
// Main pairing function - FIXED VERSION
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    console.log(chalk.yellow(`🔧 Starting pairing process for: ${sanitizedNumber}`));
    
    await initUserEnvIfMissing(sanitizedNumber);
    await initEnvsettings(sanitizedNumber);

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    // Clean session directory
    if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
    }
    fs.ensureDirSync(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'silent' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.windows('Chrome')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        // Handle pairing code generation
        if (!socket.authState.creds.registered) {
            console.log(chalk.cyan(`📱 Requesting pairing code for: ${sanitizedNumber}`));
            
            let code;
            let retries = config.MAX_RETRIES;
            
            while (retries > 0) {
                try {
                    code = await socket.requestPairingCode(sanitizedNumber);
                    console.log(chalk.green(`✅ Pairing code received!`));
                    break;
                } catch (error) {
                    retries--;
                    console.warn(chalk.yellow(`⚠️ Failed to get pairing code (${retries} retries left): ${error.message}`));
                    
                    if (retries === 0) {
                        console.error(chalk.red(`❌ Max retries reached for ${sanitizedNumber}`));
                        if (!res.headersSent) {
                            return res.status(500).send({ 
                                error: 'Failed to get pairing code',
                                details: error.message 
                            });
                        }
                        return;
                    }
                    
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }

            if (code) {
                // Format the code for display
                const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                
                console.log(chalk.green.bold(`
╔══════════════════════════════════════╗
║        🔐 PAIRING CODE REQUIRED      ║
║       FOR: ${sanitizedNumber.padEnd(15)}       ║
╠══════════════════════════════════════╣
║         ${formattedCode.padEnd(20)}          ║
╚══════════════════════════════════════╝
                `));
                
                console.log(chalk.cyan(`
📋 Instructions:
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices → Link a Device
3. Enter this code: ${formattedCode}
4. Wait for connection...
                `));
                
                // Send code via HTTP response
                if (!res.headersSent) {
                    return res.status(200).send({ 
                        status: 'pairing_code_generated',
                        code: formattedCode,
                        number: sanitizedNumber,
                        message: 'Enter this code in WhatsApp > Linked Devices'
                    });
                }
            }
        } else {
            console.log(chalk.green(`✅ Number ${sanitizedNumber} is already registered`));
            
            if (!res.headersSent) {
                return res.status(200).send({ 
                    status: 'already_registered',
                    message: 'Number already has an active session'
                });
            }
        }

        // Setup event handlers
        socket.ev.on('creds.update', saveCreds);

        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(chalk.green.bold(`✅ CONNECTED: ${sanitizedNumber}`));
                console.log(chalk.cyan(`👤 User ID: ${socket.user?.id}`));
                
                activeSockets.set(sanitizedNumber, socket);
                
                // Send welcome message
                try {
                    const userJid = jidNormalizedUser(socket.user.id);
                    await socket.sendMessage(userJid, {
                        text: `✅ *LOFT-QUANTUM Connected Successfully!*\n\n` +
                              `📱 Number: ${sanitizedNumber}\n` +
                              `🤖 Bot: ${config.BOT_NAME}\n` +
                              `⚡ Version: ${config.BOT_VERSION}\n\n` +
                              `Type ${config.PREFIX}menu to see all commands`
                    });
                    
                    console.log(chalk.green(`📨 Welcome message sent to ${sanitizedNumber}`));
                } catch (error) {
                    console.error(chalk.red(`❌ Failed to send welcome message: ${error.message}`));
                }
                
                // Setup command handlers
                setupCommandHandlers(socket, sanitizedNumber);
                
            } else if (connection === 'close') {
                console.log(chalk.yellow(`⚠️ Connection closed for ${sanitizedNumber}`));
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                
                // Attempt reconnect after delay
                if (lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log(chalk.cyan(`🔄 Attempting reconnect in 10 seconds...`));
                    await delay(10000);
                    await EmpirePair(number, { headersSent: false });
                }
            }
        });

    } catch (error) {
        console.error(chalk.red(`❌ Pairing error for ${sanitizedNumber}: ${error.message}`));
        
        if (!res.headersSent) {
            return res.status(500).send({ 
                error: 'Pairing failed',
                details: error.message,
                stack: error.stack
            });
        }
    }
}

//=======================================
// Simplified command handlers
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const sender = msg.key.remoteJid;
        let command = null;
        let args = [];
        
        // Extract text from message
        const text = msg.message.conversation || 
                    msg.message.extendedTextMessage?.text || '';
        
        if (text.startsWith(config.PREFIX)) {
            const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
            command = parts[0].toLowerCase();
            args = parts.slice(1);
        }
        
        if (!command) return;

        try {
            switch (command) {
                case 'alive':
                    await socket.sendMessage(sender, {
                        text: `✅ *${config.BOT_NAME} is ALIVE!*\n\n` +
                              `⚡ Uptime: ${Math.floor((Date.now() - (socketCreationTime.get(number) || Date.now())) / 1000)}s\n` +
                              `📱 Number: ${number}\n` +
                              `🤖 Version: ${config.BOT_VERSION}\n\n` +
                              config.BOT_FOOTER
                    });
                    break;
                    
                case 'menu':
                    await socket.sendMessage(sender, {
                        text: `📜 *${config.BOT_NAME} MENU*\n\n` +
                              `${config.PREFIX}alive - Check bot status\n` +
                              `${config.PREFIX}ping - Test response time\n` +
                              `${config.PREFIX}owner - Contact owner\n` +
                              `${config.PREFIX}system - System info\n` +
                              `${config.PREFIX}pair - Deploy mini bot\n` +
                              `${config.PREFIX}song - Download audio\n` +
                              `${config.PREFIX}video - Download video\n` +
                              `${config.PREFIX}weather - Check weather\n` +
                              `${config.PREFIX}jid - Get chat ID\n\n` +
                              `🔗 Channel: ${config.CHANNEL_LINK}`
                    });
                    break;
                    
                case 'ping':
                    const start = Date.now();
                    await socket.sendMessage(sender, { text: '🏓 Pong!' });
                    const end = Date.now();
                    await socket.sendMessage(sender, { 
                        text: `⏱️ Response time: ${end - start}ms` 
                    });
                    break;
                    
                case 'pair':
                    if (!args[0]) {
                        await socket.sendMessage(sender, {
                            text: `❌ Usage: ${config.PREFIX}pair +255XXXXXXXXX\n` +
                                  `Example: ${config.PREFIX}pair +255778018545`
                        });
                        return;
                    }
                    
                    await socket.sendMessage(sender, {
                        text: `🔗 Pairing system coming soon!\n` +
                              `Visit: https://minibot-anugasenithu.zone.id`
                    });
                    break;
                    
                case 'owner':
                    await socket.sendMessage(sender, {
                        text: `👑 *OWNER INFORMATION*\n\n` +
                              `Name: ${config.OWNER_NAME}\n` +
                              `Number: ${config.OWNER_NUMBER}\n` +
                              `Bot: ${config.BOT_NAME}\n\n` +
                              `Contact for support or queries.`
                    });
                    break;
                    
                default:
                    // Unknown command
                    break;
            }
        } catch (error) {
            console.error(chalk.red(`Command error: ${error.message}`));
        }
    });
}

//=======================================
// Routes
router.get('/', async (req, res) => {
    const { number } = req.query;
    
    if (!number) {
        return res.status(400).send({ 
            error: 'Number parameter is required',
            example: '/?number=255778018545' 
        });
    }
    
    console.log(chalk.blue(`🌐 Pairing request for: ${number}`));
    await EmpirePair(number, res);
});

router.get('/test', (req, res) => {
    res.status(200).send({
        status: 'online',
        bot: config.BOT_NAME,
        version: config.BOT_VERSION,
        active_sessions: activeSockets.size
    });
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys()),
        status: 'active'
    });
});

router.get('/pair/:number', async (req, res) => {
    const { number } = req.params;
    
    if (!number) {
        return res.status(400).send({ error: 'Number is required' });
    }
    
    console.log(chalk.cyan(`🔗 Direct pairing for: ${number}`));
    await EmpirePair(number, res);
});

//=======================================
// Startup message
console.log(chalk.green.bold(`
╔══════════════════════════════════════╗
║       ☭ LOFT-QUANTUM BOT ☭          ║
║        WhatsApp Bot System           ║
╚══════════════════════════════════════╝
`));
console.log(chalk.cyan(`🤖 Bot: ${config.BOT_NAME}`));
console.log(chalk.cyan(`⚡ Version: ${config.BOT_VERSION}`));
console.log(chalk.cyan(`🔗 Owner: ${config.OWNER_NAME}`));
console.log(chalk.yellow('\n📡 Available Routes:'));
console.log(chalk.white(`  GET /?number=255XXXXXXXXX`));
console.log(chalk.white(`  GET /pair/:number`));
console.log(chalk.white(`  GET /active`));
console.log(chalk.white(`  GET /test`));
console.log(chalk.green('\n✅ Bot system initialized!\n'));

//=======================================
module.exports = router;
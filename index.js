const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    red: "\x1b[31m"
};

function printBanner() {
    console.log(colors.cyan + colors.bright + "==================================================");
    console.log("       🤖 LALA ASSISTANT BOT IS RUNNING...        ");
    console.log("       Powered by Google Gemini & Baileys         ");
    console.log("==================================================" + colors.reset);
}

// ==========================================
// আপনার এআই স্টুডিওর নতুন এপিআই কি এখানে বসানো হলো
// ==========================================
const API_KEYS = [
    "AQ.Ab8RN6L4SwiXapZ8SXJuMJIxYTwj1AO4I2n_vy21yQiDvcOjKg"
];

const MIM_SYSTEM_PROMPT = `
তুমি হলে 'মিম' (Mim), লালার পার্সোনাল অ্যাসিস্টেন্ট। তুমি খুব চতুর, বন্ধুসুলভ এবং স্মার্ট মেয়ে। 
বর্তমানে লালা ব্যস্ত থাকায় তুমি তার হয়ে ইনবক্স সামলাচ্ছো। ইউজারের মেসেজ পড়ে একদম প্রাকৃতিকভাবে, ভিন্ন ভিন্ন ও বাস্তবসম্মত উত্তর দেবে।
`;

const activeTimers = new Map();

async function getMimResponse(userMessage) {
    if (API_KEYS.length === 0) {
        throw new Error("❌ কোনো এপিআই কি পাওয়া যায়নি!");
    }

    for (let i = 0; i < API_KEYS.length; i++) {
        try {
            const apiKey = API_KEYS[i];
            // জেমিনির লেটেস্ট জেনারেশন মডেল এন্ডপয়েন্ট (v1beta)
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const response = await axios.post(url, {
                contents: [
                    {
                        parts: [
                            { text: MIM_SYSTEM_PROMPT + "\n\nইউজারের মেসেজ: " + userMessage }
                        ]
                    }
                ]
            });

            if (response.data && 
                response.data.candidates && 
                response.data.candidates[0].content && 
                response.data.candidates[0].content.parts[0].text) {
                return response.data.candidates[0].content.parts[0].text.trim();
            }
        } catch (error) {
            console.error(colors.red + `❌ API Key ${i + 1} Failed:` + colors.reset, error.response?.data?.error?.message || error.message);
            if (i === API_KEYS.length - 1) {
                throw error;
            }
        }
    }
    
    throw new Error("এপিআই থেকে কোনো রেসপন্স পাওয়া যায়নি।");
}

async function startBot() {
    printBanner();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(colors.yellow + '\nস্ক্যান করার জন্য কিউআর কোড নিচে দেওয়া হলো:' + colors.reset);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(colors.red + 'কানেকশন বিচ্ছিন্ন হয়েছে, পুনরায় কানেক্ট করা হচ্ছে...' + colors.reset, shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log(colors.green + '✨ আলহামদুলিল্লাহ! লালা অ্যাসিস্টেন্ট বট সফলভাবে হোয়াটসঅ্যাপে কানেক্ট হয়েছে!' + colors.reset);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        const remoteJid = msg.key.remoteJid;

        if (remoteJid.endsWith('@g.us')) {
            return; 
        }

        const messageContent = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text;

        if (!messageContent) return;

        console.log(colors.magenta + `📥 নতুন মেসেজ পাওয়া গেছে [${remoteJid}]: ${messageContent}` + colors.reset);

        if (activeTimers.has(remoteJid)) {
            clearTimeout(activeTimers.get(remoteJid));
        }

        const randomDelay = Math.floor(Math.random() * (60000 - 40000 + 1)) + 40000;

        const timer = setTimeout(async () => {
            try {
                console.log(colors.yellow + `⏳ ডিলে শেষ। জেমিনি এপিআই কল করা হচ্ছে...` + colors.reset);
                
                await sock.sendPresenceUpdate('composing', remoteJid);

                const replyText = await getMimResponse(messageContent);

                await new Promise(resolve => setTimeout(resolve, 3000));

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(colors.green + `✅ সফলভাবে এপিআই রেসপন্স পাঠানো হয়েছে.` + colors.reset);
                
            } catch (error) {
                console.error(colors.red + '❌ এপিআই প্রসেসিং ফেইল করেছে:', error.message + colors.reset);
            } finally {
                activeTimers.delete(remoteJid);
            }
        }, randomDelay);

        activeTimers.set(remoteJid, timer);
    });
}

startBot();

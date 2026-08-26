const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino =php = require('pino'); // pino
const qrcode = require('qrcode-terminal');

// ==========================================
// কনফিগারেশন: শুধুমাত্র সঠিক AIzaSy... ফরম্যাটের এপিআই কি এখানে বসাবেন
// ==========================================
const API_KEYS = [
    "AIzaSyCT2h8JLHzjT5W0vVQ-51Nfuu4wtXkM3SY" // আপনার আসল এপিআই কি এখানে দিন
];

// মিম (Mim) চরিত্রের স্মার্ট সিস্টেম প্রম্পট
const MIM_SYSTEM_PROMPT = `
তুমি হলে 'মিম' (Mim), লালার পার্সোনাল অ্যাসিস্টেন্ট। তুমি খুব চতুর, বন্ধুসুলভ এবং স্মার্ট মেয়ে। 
বর্তমানে লালা ব্যস্ত থাকায় তুমি তার হয়ে ইনবক্স সামলাচ্ছো। ইউজারের মেসেজ পড়ে একদম প্রাকৃতিকভাবে, ভিন্ন ভিন্ন ও বাস্তবসম্মত উত্তর দেবে। কখনো একই উত্তর বারবার দেবে না।
`;

const activeTimers = new Map();

// কঠোর এপিআই রেসপন্স ফাংশন (কোনো ভুয়া বা মুখস্থ ফলব্যাক নেই)
async function getMimResponse(userMessage) {
    // শুধু AIzaSy দিয়ে শুরু হওয়া ভ্যালিড কি গুলো ফিল্টার করা
    const validKeys = API_KEYS.filter(key => key && key.startsWith("AIzaSy"));
    
    if (validKeys.length === 0) {
        throw new Error("❌ কোনো ভ্যালিড জেমিনি এপিআই কি (AIzaSy... ফরম্যাট) পাওয়া যায়নি!");
    }

    for (let i = 0; i < validKeys.length; i++) {
        try {
            const ai = new GoogleGenAI({ apiKey: validKeys[i] });
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { 
                        role: 'user', 
                        parts: [
                            { text: MIM_SYSTEM_PROMPT + "\n\nইউজারের মেসেজ: " + userMessage }
                        ] 
                    }
                ]
            });
            
            if (response && response.text) {
                return response.text.trim();
            }
        } catch (error) {
            console.error(`❌ API Key ${i + 1} Failed:`, error.message);
            if (i === validKeys.length - 1) {
                throw error; // সব কি ফেইল করলে ফাইনাল এরর থ্রো করবে
            }
        }
    }
    
    throw new Error("এপিআই থেকে কোনো রেসপন্স পাওয়া যায়নি।");
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\nস্ক্যান করার জন্য কিউআর কোড নিচে দেওয়া হলো:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('কানেকশন বিচ্ছিন্ন হয়েছে, পুনরায় কানেক্ট করা হচ্ছে...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('আলহামদুলিল্লাহ! বট সফলভাবে আপনার হোয়াটসঅ্যাপ অ্যাকাউন্টে কানেক্ট হয়েছে!');
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

        console.log(`নতুন ইনবক্স মেসেজ পাওয়া গেছে [${remoteJid}]: ${messageContent}`);

        if (activeTimers.has(remoteJid)) {
            clearTimeout(activeTimers.get(remoteJid));
        }

        const randomDelay = Math.floor(Math.random() * (60000 - 40000 + 1)) + 40000;

        const timer = setTimeout(async () => {
            try {
                console.log(`ডিলে শেষ হয়েছে। জেমিনি এপিআই কল করা হচ্ছে...`);
                
                await sock.sendPresenceUpdate('composing', remoteJid);

                // সরাসরি এপিআই কল (ফেল করলে সরাসরি ক্যাচ ব্লকে যাবে)
                const replyText = await getMimResponse(messageContent);

                await new Promise(resolve => setTimeout(resolve, 3000));

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(`সফলভাবে এপিআই রেসপন্স পাঠানো হয়েছে.`);
                
            } catch (error) {
                console.error('❌ এপিআই প্রসেসিং ফেইল করেছে:', error.message);
                // এখানে ইচ্ছা করেই কোনো মেসেজ পাঠানো হচ্ছে না, যাতে ভুয়া বা মুখস্থ মেসেজ আর না যায়।
            } finally {
                activeTimers.delete(remoteJid);
            }
        }, randomDelay);

        activeTimers.set(remoteJid, timer);
    });
}

startBot();

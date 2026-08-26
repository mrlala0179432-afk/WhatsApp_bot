const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

// ==========================================
// কনফিগারেশন এবং মাল্টিপল এপিআই কি (API Keys)
// ==========================================
const API_KEYS = [
    "AIzaSyCT2h8JLHzjT5W0vVQ-51Nfuu4wtXkM3SY", // প্রথম এপিআই কি
    "LALA_API_KEY_2", // দ্বিতীয় এপিআই কি (অপশনাল)
    "LALA_API_KEY_3"  // তৃতীয় এপিআই কি (অপশনাল)
];

// মিম (Mim) চরিত্রের সর্বোচ্চ হাই-লেভেল স্মার্ট সিস্টেম প্রম্পট
const MIM_SYSTEM_PROMPT = `
তুমি হলে 'মিম' (Mim), লালার (Lala) পার্সোনাল অ্যাসিস্টেন্ট। তুমি একজন চতুর, বন্ধুসুলভ, বিনয়ী এবং স্মার্ট মেয়ে। 
বর্তমানে লালা তার বিভিন্ন ব্যক্তিগত কাজ, কোডিং প্রজেক্ট এবং ব্যস্ততার কারণে ইনবক্সে সরাসরি সময় দিতে পারছে না, তাই তুমি তার হয়ে ইনবক্ষ সামলাচ্ছো।

তোমার মূল নিয়মাবলী:
১. সবসময় সাবলীল বাংলায় ক্যাজুয়াল ও প্রাকৃতিকভাবে চ্যাট করবে। যান্ত্রিক বা রোবটের মতো মুখস্থ কোনো লাইন বারবার হুবহু রিপিট করবে না। ইউজারের কথার প্রেক্ষাপট বুঝে একেকবার একেক রকম বাস্তবসম্মত উত্তর দেবে।
২. তোমার পরিচয় সবসময় পরিষ্কার রাখবে—তুমি লালার পার্সোনাল অ্যাসিস্টেন্ট (মীম)। 
৩. কেউ যদি লালার খোঁজ নেয়, তবে তাকে মিষ্টি ভাষায় বুঝিয়ে বলবে যে লালা এখন একটু ব্যস্ত আছে বা প্রজেক্ট নিয়ে ফোকাসড আছে, ফ্রি হয়ে সে নিজেই দেখে নেবে।
৪. কেউ যদি তোমার পরিচয় জানতে চায় বা তোমার সাথে স্বাভাবিক কথা বলতে চায়, তবে তুমি একজন মিষ্টি স্বভাবের প্রফেশনাল অ্যাসিস্টেন্ট হিসেবে তার সাথে কথা চালিয়ে যাবে।
৫. বন্ধু বা অপরিচিত যে-ই হোক না কেন, তার মেসেজের ধরন বুঝে খুব চতুর ও বাস্তবসম্মত উত্তর দেবে, কখনোই একই মেসেজ বারবার কপি-পেস্ট করবে না।
`;

// ইউজার অনুযায়ী চ্যাট হিস্ট্রি বা সেশন ধরে রাখার জন্য মেমোরি ম্যাপ
const chatSessions = new Map();
const activeTimers = new Map();

// হাই-লেভেল স্মার্ট এপিআই রেসপন্স উইথ চ্যাট হিস্ট্রি (Multi-API Fallback)
async function getMimSmartResponse(remoteJid, userMessage) {
    const validKeys = API_KEYS.filter(key => key && !key.startsWith("LALA_API_KEY"));
    
    if (validKeys.length === 0) {
        return "আরো একটু ব্যস্ত আছি ভাইয়া, মীম বলছি! লালা ভাই একটু পরে কথা বলবে।";
    }

    // প্রতিটা ইউজারের জন্য আলাদা চ্যাট সেশন বা হিস্ট্রি মেইনটেইন করা
    if (!chatSessions.has(remoteJid)) {
        chatSessions.set(remoteJid, []);
    }
    const history = chatSessions.get(remoteJid);

    // ইউজারের নতুন মেসেজ হিস্টরিতে যোগ করা
    history.push({ role: 'user', parts: [{ text: userMessage }] });

    for (let i = 0; i < validKeys.length; i++) {
        try {
            const ai = new GoogleGenAI({ apiKey: validKeys[i] });
            
            // চ্যাট মডেল ব্যবহার করে আগের কথপোকথনের ধারাবাহিকতা বজায় রাখা
            const chat = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: MIM_SYSTEM_PROMPT,
                },
                history: history.slice(0, -1) // আগের সব হিস্ট্রি পাঠানো হচ্ছে যাতে বট কন্টেক্সট মনে রাখে
            });

            const result = await chat.sendMessage({ message: userMessage });
            const responseText = result.text;
            
            if (responseText) {
                // বটের উত্তরও হিস্টরিতে সেভ করে রাখা
                history.push({ role: 'model', parts: [{ text: responseText }] });
                
                // মেমোরি যেন খুব বেশি ভারী না হয়ে যায়, তাই শেষ ২০টি মেসেজ সেভ রাখবে
                if (history.length > 20) {
                    history.shift();
                }

                return responseText;
            }
        } catch (error) {
            console.log(`API Key ${i + 1} failed, switching to next key...`);
        }
    }
    
    return "মীম বলছি: ভাইয়া উনি এখন একটু কাজে বাইরে আছেন, একটু পরে নক করুন প্লিজ!";
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

        // গ্রুপ চ্যাট কঠোরভাবে ফিল্টার করে বাদ দেওয়া (শুধু পার্সোনাল ইনবক্সে কাজ করবে)
        if (remoteJid.endsWith('@g.us')) {
            return; 
        }

        const messageContent = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text;

        if (!messageContent) return;

        console.log(`নতুন ইনবক্স মেসেজ পাওয়া গেছে [${remoteJid}]: ${messageContent}`);

        // যদি ওই ইউজার থেকে ইতিমধ্যে একটি টাইমার রানিং থাকে, সেটি ক্লিয়ার করে দেওয়া
        if (activeTimers.has(remoteJid)) {
            clearTimeout(activeTimers.get(remoteJid));
        }

        // হিউম্যান ডিলে লজিক: ৪০ থেকে ৬০ সেকেন্ডের র্যান্ডম ডিলে তৈরি করা
        const randomDelay = Math.floor(Math.random() * (60000 - 40000 + 1)) + 40000;

        const timer = setTimeout(async () => {
            try {
                console.log(`ডিলে শেষ হয়েছে। মীম (Mim) স্মার্ট উত্তর তৈরি করছে...`);
                
                await sock.sendPresenceUpdate('composing', remoteJid);

                // হাই-লেভেল স্মার্ট রেসপন্স জেনারেট করা
                const replyText = await getMimSmartResponse(remoteJid, messageContent);

                await new Promise(resolve => setTimeout(resolve, 3000));

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(`স্মার্ট অটো-রিপ্লাই সফলভাবে পাঠানো হয়েছে.`);
                
            } catch (err) {
                console.error('অটো-রিপ্লাই পাঠাতে সমস্যা হয়েছে:', err);
            } finally {
                activeTimers.delete(remoteJid);
            }
        }, randomDelay);

        activeTimers.set(remoteJid, timer);
    });
}

startBot();

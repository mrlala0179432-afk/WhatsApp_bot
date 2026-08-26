const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');

// ==========================================
// কনফিগারেশন এবং মাল্টিপল এপিআই কি (API Keys)
// আপনার এপিআই কি গুলো নিচে বসিয়ে দিন। 
// একাধিক থাকলে কমার মাঝে স্ট্রিং হিসেবে লিখবেন।
// ==========================================
const API_KEYS = [
    "AIzaSyCT2h8JLHzjT5W0vVQ-51Nfuu4wtXkM3SY", // এখানে প্রথম এপিআই কি বসাবেন
    "LALA_API_KEY_2", // এখানে দ্বিতীয় এপিআই কি বসাবেন (অপশনাল)
    "LALA_API_KEY_3"  // এখানে তৃতীয় এপিআই কি বসাবেন (অপশনাল)
];

// মিম (Mim) চরিত্রের সিস্টেম প্রম্পট বা লজিক
const MIM_SYSTEM_PROMPT = `
তুমি হলে 'মিম' (Mim), লালার পার্সোনাল অ্যাসিস্টেন্ট। তুমি একজন মেয়ে এবং তুমি খুব বন্ধুসুলভ, চতুর ও বিনয়ী স্বভাবের। 
বর্তমানে লালা তার বিভিন্ন ব্যক্তিগত কাজ ও প্রজেক্টে ব্যস্ত থাকায় ইনবক্সে সরাসরি সময় দিতে পারছে না, তাই তুমি তার হয়ে ইনবক্ষ সামলাচ্ছো। 

নিয়মাবলী:
১. তুমি সবসময় বাংলায় খুব সুন্দর ও প্রাকৃতিকভাবে ক্যাজুয়াল চ্যাট করবে। 
২. তোমার পরিচয় সবসময় পরিষ্কার রাখবে—তুমি লালার অ্যাসিস্টেন্ট (মীম)। 
৩. কেউ যদি লালার খোঁজ নেয় বা মেসেজ দেয়, তবে তুমি খুব সুন্দরভাবে বুঝিয়ে বলবে যে লালা এখন একটু ব্যস্ত আছে, ফ্রি হয়ে সে নিজেই দেখে নেবে। 
৪. কেউ তোমার সাথে সাধারণ কথা বললে বা কাজের কথা বললে তুমি একজন দায়িত্বশীল অ্যাসিস্টেন্টের মতো মিষ্টি ভাষায় তার উত্তর দেবে। 
৫. কখনোই বুঝতে দেবে না যে তুমি কোনো কোডিং করা বট বা এআই। খুব সংক্ষিপ্ত ও বাস্তবসম্মত উত্তর দেবে।
`;

// একটিভ চ্যাট বা টাইমার ট্র্যাক করার জন্য মেমোরি ম্যাপ
const activeTimers = new Map();

// সফল এপিআই থেকে রেসপন্স আনার ফাংশন (ফলব্যাক সিস্টেমসহ)
async function getMimResponse(userMessage) {
    // ফিল্টার করে যেগুলোর জায়গায় রিয়েল কি দেওয়া হয়েছে সেগুলো সিলেক্ট করা
    const validKeys = API_KEYS.filter(key => key && !key.startsWith("LALA_API_KEY"));
    
    if (validKeys.length === 0) {
        return "আরো একটু ব্যস্ত আছি ভাইয়া, মীম বলছি! লালা ভাই একটু পরে কথা বলবে।";
    }

    for (let i = 0; i < validKeys.length; i++) {
        try {
            const ai = new GoogleGenAI({ apiKey: validKeys[i] });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { role: 'user', parts: [{ text: MIM_SYSTEM_PROMPT + "\n\n ইউজারের মেসেজ: " + userMessage }] }
                ]
            });
            
            if (response && response.text) {
                return response.text;
            }
        } catch (error) {
            console.log(`API Key ${i + 1} failed, trying next one...`);
            // যদি একটি এপিআই ফেইল করে বা লিমিট শেষ হয়, তবে লুপ ঘুরে পরের এপিআই ট্রাই করবে
        }
    }
    
    return "মীম বলছি: ভাইয়া উনি এখন একটু কাজে বাইরে আছেন, একটু পরে নক করুন প্লিজ!";
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) // কিউআর কোডের অপ্রয়োজনীয় ক্র্যাশ বা ওয়ার্নিং এড়ানোর জন্য এটি ক্লিন করা হয়েছে
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
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
        if (!msg.message || msg.key.fromMe) return; // নিজের মেসেজ পুরোপুরি ইগ্নোর করা হবে

        const remoteJid = msg.key.remoteJid;

        // ১. গ্রুপ চ্যাট কঠোরভাবে ফিল্টার করে বাদ দেওয়া (শুধু পার্সোনাল ইনবক্সে কাজ করবে)
        if (remoteJid.endsWith('@g.us')) {
            return; 
        }

        const messageContent = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text;

        if (!messageContent) return;

        console.log(`নতুন ইনবক্স মেসেজ পাওয়া গেছে [${remoteJid}]: ${messageContent}`);

        // যদি ওই ইউজার থেকে ইতিমধ্যে একটি টাইমার রানিং থাকে, সেটি ক্লিয়ার করে দেওয়া (নতুন মেসেজের জন্য রিসেট)
        if (activeTimers.has(remoteJid)) {
            clearTimeout(activeTimers.get(remoteJid));
        }

        // ২. হিউম্যান ডিলে লজিক: ৪০ থেকে ৬০ সেকেন্ডের র্যান্ডম ডিলে তৈরি করা
        const randomDelay = Math.floor(Math.random() * (60000 - 40000 + 1)) + 40000; // ৪০ থেকে ৬০ সেকেন্ড

        const timer = setTimeout(async () => {
            try {
                // টাইমার শেষ হওয়ার আগে আপনি নিজে ওই চ্যাটে রিপ্লাই দিয়েছেন কি না তা চেক করার জন্য সেশন ভেরিফিকেশন
                // (যদি ইউজার নিজে চ্যাটে থাকে তবে এটি বাইপাস হবে)
                
                console.log(`ডিলে শেষ হয়েছে। মীম (Mim) উত্তর তৈরি করছে...`);
                
                // টাইপিং স্ট্যাটাস অন করা যাতে রিয়েল মানুষের মতো দেখায়
                await sock.sendPresenceUpdate('composing', remoteJid);

                // এপিআই থেকে মিমের উত্তর জেনারেট করা
                const replyText = await getMimResponse(messageContent);

                // ছোট কৃত্রিম টাইপিং বিরতি দিয়ে মেসেজ সেন্ড করা
                await new Promise(resolve => setTimeout(resolve, 3000));

                await sock.sendMessage(remoteJid, { text: replyText });
                console.log(`অটো-রিপ্লাই সফলভাবে পাঠানো হয়েছে.`);
                
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

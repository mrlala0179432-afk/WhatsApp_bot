const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/genai');
const pino = require('pino');
const express = require('express');

// Render বা সার্ভারের জন্য হালকা ওয়েব সার্ভার লজিক (যা Exited with status 1 আটকাবে)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('WhatsApp Bot is Running Successfully with Multi-API Support!');
});

app.listen(PORT, () => {
    console.log(`Web server is listening on port ${PORT}`);
});

// আপনার একাধিক জেমিনি এপিআই কি এখানে বসিয়ে দিন
const apiKeys = [
    'AIzaSyCT2h8JLHzjT5W0vVQ-51Nfuu4wtXkM3SY',
    'YOUR_GEMINI_API_KEY_2',
    'YOUR_GEMINI_API_KEY_3'
];

let currentKeyIndex = 0;

// এপিআই কি রোটেশন বা পরিবর্তনের লজিক
function getNextAiClient() {
    const apiKey = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return new GoogleGenAI({ apiKey });
}

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('====================================');
                console.log('QR CODE RECEIVED! PLEASE SCAN WITH WHATSAPP');
                console.log('====================================');
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed. Reconnecting...', shouldReconnect);
                if (shouldReconnect) {
                    startBot();
                }
            } else if (connection === 'open') {
                console.log('WhatsApp Bot Connected Successfully!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ইনবক্স মেসেজ রিসিভ এবং মাল্টি-এপিআই প্রসেসিং লজিক
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const mek = messages[0];
                if (!mek.message || mek.key.fromMe) return;

                const remoteJid = mek.key.remoteJid;
                
                // গ্রুপ মেসেজ ইগনোর করার জন্য (শুধু ইনবক্সে কাজ করবে)
                if (remoteJid.endsWith('@g.us')) return;

                const messageType = Object.keys(mek.message)[0];
                let senderMessage = '';

                if (messageType === 'conversation') {
                    senderMessage = mek.message.conversation;
                } else if (messageType === 'extendedTextMessage') {
                    senderMessage = mek.message.extendedTextMessage.text;
                }

                if (!senderMessage) return;

                console.log(`Received message from [${remoteJid}]: ${senderMessage}`);

                let replyText = 'দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।';
                let success = false;
                let attempts = 0;

                // মাল্টি-এপিআই রোটেশন ও ফেইলওভার লজিক
                while (attempts < apiKeys.length && !success) {
                    try {
                        const ai = getNextAiClient();
                        const response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: senderMessage,
                        });

                        if (response && response.text) {
                            replyText = response.text;
                            success = true;
                        }
                    } catch (err) {
                        console.log(`API Key attempt ${attempts + 1} failed, trying next...`);
                        attempts++;
                    }
                }

                // হোয়াটসঅ্যাপে উত্তর পাঠানো
                await sock.sendMessage(remoteJid, { text: replyText }, { quoted: mek });
                console.log('Reply sent successfully.');

            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

    } catch (err) {
        console.error('Critical Error in startBot:', err);
    }
}

startBot();
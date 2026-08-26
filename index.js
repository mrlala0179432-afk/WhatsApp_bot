import time
from google import genai

# আপনার একাধিক জেমিনি এপিআই কি এখানে বসিয়ে দিন
API_KEYS = [
    "AIzaSyCT2h8JLHzjT5W0vVQ-51Nfuu4wtXkM3SY",
    "YOUR_GEMINI_API_KEY_2",
    "YOUR_GEMINI_API_KEY_3"
]

current_key_index = 0

def get_gemini_response(sender_message):
    global current_key_index
    attempts = 0
    reply_text = "দুঃখিত, এই মুহূর্তে উত্তর দিতে পারছি না।"
    
    # মাল্টি-এপিআই কি রোটেশন লজিক
    while attempts < len(API_KEYS):
        api_key = API_KEYS[current_key_index]
        current_key_index = (current_key_index + 1) % len(API_KEYS)
        
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=sender_message,
            )
            if response and response.text:
                reply_text = response.text
                return reply_text
        except Exception as err:
            print(f"API Key attempt {attempts + 1} failed, trying next... Error: {err}")
            attempts += 1
            
    return reply_text

# আপনার আগের হোয়াটসঅ্যাপ মেসেজ হ্যান্ডলিং ও এআই প্রসেসিংয়ের মূল কাঠামো
def handle_whatsapp_message(sender_phone, incoming_message):
    print(f"Received message from [{sender_phone}]: {incoming_message}")
    
    if not incoming_message:
        return None

    # জেমিনি থেকে মাল্টি-এপিআই লজিক দিয়ে উত্তর জেনারেট করা
    ai_reply = get_gemini_response(incoming_message)
    
    print(f"Generated Reply: {ai_reply}")
    
    # হোয়াটসঅ্যাপে মেসেজ পাঠানোর মূল অ্যাকশন (এখানে আপনার সেন্ড ফাংশন কাজ করবে)
    # send_whatsapp_message(sender_phone, ai_reply)
    
    return ai_reply

if __name__ == "__main__":
    print("==================================================")
    print("WhatsApp Multi-API Logic System is active!")
    print("==================================================")
    
    # এটি আপনার রিমোট ইনকামিং মেসেজ লুপের মূল কাঠামো
    # যখনই হোয়াটসঅ্যাপ থেকে কোনো মেসেজ আসবে, এই ফাংশনটি কল হবে
    while True:
        phone = input("\nপ্রাপকের নম্বর দিন (বা বন্ধ করতে 'exit'): ")
        if phone.lower() == 'exit':
            break
        msg = input("মেসেজটি লিখুন: ")
        
        # আপনার মূল লজিক কল হচ্ছে
        handle_whatsapp_message(phone, msg)

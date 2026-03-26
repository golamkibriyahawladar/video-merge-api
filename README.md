# 🎬 Video Merge API

n8n থেকে ভিডিও ক্লিপ URL পাঠালে FFmpeg দিয়ে জোড়া লাগিয়ে ডাউনলোড লিংক ফেরত দেয়।

---

## ⚡ প্রথমে FFmpeg ইনস্টল করো

### Windows
1. https://ffmpeg.org/download.html → Windows builds থেকে zip ডাউনলোড
2. Extract করে `C:\ffmpeg\` ফোল্ডারে রাখো
3. System PATH-এ `C:\ffmpeg\bin` যোগ করো
4. CMD-এ চেক করো: `ffmpeg -version`

### Mac
```bash
brew install ffmpeg
```

### Linux / VPS (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install ffmpeg -y
```

---

## 🚀 প্রজেক্ট চালানো

```bash
# ১. ডিপেন্ডেন্সি ইনস্টল
npm install

# ২. সার্ভার স্টার্ট
npm start
```

সার্ভার চালু হলে দেখাবে:
```
🎬 Video Merge API চালু হয়েছে → http://localhost:3000
```

---

## 📡 API ব্যবহার

### Health Check
```
GET http://localhost:3000/health
```

### ভিডিও জোড়া লাগানো
```
POST http://localhost:3000/merge
Content-Type: application/json

{
  "videos": [
    "https://example.com/clip1.mp4",
    "https://example.com/clip2.mp4",
    "https://example.com/clip3.mp4"
  ]
}
```

### সফল রেসপন্স
```json
{
  "success": true,
  "jobId": "abc-123-xyz",
  "downloadUrl": "http://localhost:3000/output/abc-123-xyz_merged.mp4",
  "clipsCount": 3,
  "message": "ভিডিও সফলভাবে জোড়া লাগানো হয়েছে!"
}
```

---

## 🔧 n8n-এ কীভাবে ব্যবহার করবে

1. n8n-এ একটি **HTTP Request** নোড যোগ করো
2. Method: `POST`
3. URL: `http://localhost:3000/merge`
   - (VPS হলে: `http://তোমার-VPS-IP:3000/merge`)
4. Body Type: `JSON`
5. Body:
```json
{
  "videos": [
    "{{ $json.video_url_1 }}",
    "{{ $json.video_url_2 }}"
  ]
}
```
6. রেসপন্স থেকে `downloadUrl` নিয়ে পরের স্টেপে ব্যবহার করো

---

## 📁 ফোল্ডার স্ট্রাকচার

```
video-merge-api/
├── server.js        ← মেইন API কোড
├── package.json
├── temp/            ← ডাউনলোড হওয়া ক্লিপ (কাজ শেষে অটো ডিলিট)
└── output/          ← জোড়া লাগানো ভিডিও এখানে সেভ হবে
```

---

## ⚠️ গুরুত্বপূর্ণ নোট

- ভিডিও URL গুলো publicly accessible হতে হবে
- সব ভিডিও একই format/resolution হলে সবচেয়ে ভালো কাজ করে
- Output ফাইলগুলো `/output` ফোল্ডারে থাকে — মাঝে মাঝে manually মুছে দিও
- VPS-এ চালাতে চাইলে Port 3000 firewall-এ open রাখো

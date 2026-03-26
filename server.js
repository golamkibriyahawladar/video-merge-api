const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ─── ফোল্ডার তৈরি ───────────────────────────────────────────────
const TEMP_DIR = path.join(__dirname, "temp");
const OUTPUT_DIR = path.join(__dirname, "output");
[TEMP_DIR, OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Static ফাইল serve (ডাউনলোড লিংকের জন্য) ──────────────────
app.use("/output", express.static(OUTPUT_DIR));

// ─── ভিডিও ডাউনলোড হেল্পার ──────────────────────────────────────
async function downloadVideo(url, destPath) {
  // Google Drive URL fix
  const gdMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (gdMatch) {
    url = `https://drive.google.com/uc?export=download&id=${gdMatch[1]}&confirm=t`;
  }

  const response = await axios({
    method: "get",
    url: url,
    responseType: "stream",
    maxRedirects: 10,
    timeout: 120000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// ─── টেম্প ফাইল ক্লিনআপ হেল্পার ─────────────────────────────────
function cleanup(files) {
  files.forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

// ────────────────────────────────────────────────────────────────
// POST /merge
// Body: { "videos": ["https://...", "https://...", ...] }
// ────────────────────────────────────────────────────────────────
app.post("/merge", async (req, res) => {
  const { videos } = req.body;

  // ভ্যালিডেশন
  if (!videos || !Array.isArray(videos) || videos.length < 2) {
    return res.status(400).json({
      success: false,
      error: "কমপক্ষে ২টি ভিডিও URL দিতে হবে। Example: { videos: ['url1', 'url2'] }",
    });
  }

  const jobId = uuidv4();
  const tempFiles = [];
  const listFilePath = path.join(TEMP_DIR, `${jobId}_list.txt`);
  const outputFile = path.join(OUTPUT_DIR, `${jobId}_merged.mp4`);

  console.log(`[${jobId}] শুরু হচ্ছে — ${videos.length}টি ভিডিও`);

  try {
    // ─── ১. সব ভিডিও ডাউনলোড ───────────────────────────────────
    console.log(`[${jobId}] ডাউনলোড শুরু...`);
    for (let i = 0; i < videos.length; i++) {
      const ext = path.extname(new URL(videos[i]).pathname) || ".mp4";
      const tempPath = path.join(TEMP_DIR, `${jobId}_clip${i}${ext}`);
      await downloadVideo(videos[i], tempPath);
      tempFiles.push(tempPath);
      console.log(`[${jobId}] ✓ ক্লিপ ${i + 1} ডাউনলোড হয়েছে`);
    }

    // ─── ২. FFmpeg concat list তৈরি ─────────────────────────────
    const listContent = tempFiles
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listFilePath, listContent);
    tempFiles.push(listFilePath);

    // ─── ৩. FFmpeg দিয়ে জোড়া লাগানো ────────────────────────────
    console.log(`[${jobId}] ভিডিও জোড়া লাগানো শুরু...`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFilePath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy"])
        .output(outputFile)
        .on("start", (cmd) => console.log(`[${jobId}] FFmpeg: ${cmd}`))
        .on("progress", (p) =>
          console.log(`[${jobId}] Progress: ${Math.round(p.percent || 0)}%`)
        )
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // ─── ৪. টেম্প ফাইল মুছে ফেলো ───────────────────────────────
    cleanup(tempFiles);

    // ─── ৫. রেসপন্স পাঠাও ───────────────────────────────────────
    const HOST = `${req.protocol}://${req.get("host")}`;
    const downloadUrl = `${HOST}/output/${jobId}_merged.mp4`;

    console.log(`[${jobId}] ✅ সম্পন্ন! → ${downloadUrl}`);

    return res.json({
      success: true,
      jobId,
      downloadUrl,
      clipsCount: videos.length,
      message: "ভিডিও সফলভাবে জোড়া লাগানো হয়েছে!",
    });
  } catch (err) {
    cleanup(tempFiles);
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    console.error(`[${jobId}] ❌ Error:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ─── Health Check ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Video Merge API চালু আছে ✅" });
});

// ─── সার্ভার স্টার্ট ─────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`\n🎬 Video Merge API চালু হয়েছে → http://localhost:${PORT}`);
  console.log(`📋 Test: GET  http://localhost:${PORT}/health`);
  console.log(`🔗 Merge: POST http://localhost:${PORT}/merge\n`);
});

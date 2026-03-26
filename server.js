const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const ffmpegPath = require("child_process").execSync("which ffmpeg").toString().trim();
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json());

// ─── API Secret (Security) ───────────────────────────────────────
const API_SECRET = process.env.API_SECRET || "change-this-secret";

function checkSecret(req, res, next) {
  const secret = req.headers["agentatlasvideomargeapi123"] || req.query.secret;
  if (secret !== API_SECRET) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

// ─── ফোল্ডার তৈরি ───────────────────────────────────────────────
const TEMP_DIR = path.join(__dirname, "temp");
const OUTPUT_DIR = path.join(__dirname, "output");
[TEMP_DIR, OUTPUT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Static ফাইল serve ──────────────────────────────────────────
app.use("/output", express.static(OUTPUT_DIR));

// ─── ভিডিও ডাউনলোড হেল্পার ──────────────────────────────────────
async function downloadVideo(url, destPath) {
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

// ─── ক্লিনআপ হেল্পার ─────────────────────────────────────────────
function cleanup(files) {
  files.forEach((f) => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { }
  });
}

// ────────────────────────────────────────────────────────────────
// POST /merge  (protected by API secret)
// ────────────────────────────────────────────────────────────────
app.post("/merge", checkSecret, async (req, res) => {
  const { videos } = req.body;

  if (!videos || !Array.isArray(videos) || videos.length < 2) {
    return res.status(400).json({
      success: false,
      error: "কমপক্ষে ২টি ভিডিও URL দিতে হবে।",
    });
  }

  const jobId = uuidv4();
  const tempFiles = [];
  const listFilePath = path.join(TEMP_DIR, `${jobId}_list.txt`);
  const outputFile = path.join(OUTPUT_DIR, `${jobId}_merged.mp4`);

  console.log(`[${jobId}] শুরু হচ্ছে — ${videos.length}টি ভিডিও`);

  try {
    // ─── ১. ডাউনলোড ─────────────────────────────────────────────
    console.log(`[${jobId}] ডাউনলোড শুরু...`);
    for (let i = 0; i < videos.length; i++) {
      let ext = ".mp4";
      try { ext = path.extname(new URL(videos[i]).pathname) || ".mp4"; } catch (e) { }
      const tempPath = path.join(TEMP_DIR, `${jobId}_clip${i}${ext}`);
      await downloadVideo(videos[i], tempPath);
      tempFiles.push(tempPath);
      console.log(`[${jobId}] ✓ ক্লিপ ${i + 1} ডাউনলোড হয়েছে`);
    }

    // ─── ২. concat list ──────────────────────────────────────────
    const listContent = tempFiles
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listFilePath, listContent);
    tempFiles.push(listFilePath);

    // ─── ৩. FFmpeg merge (black screen + frame drop fix) ─────────
    console.log(`[${jobId}] ভিডিও জোড়া লাগানো শুরু...`);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listFilePath)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions([
          "-c:v libx264",
          "-c:a aac",
          "-vsync cfr",
          "-avoid_negative_ts make_zero",
          "-fflags +genpts",
        ])
        .output(outputFile)
        .on("start", () => console.log(`[${jobId}] FFmpeg started`))
        .on("progress", (p) => console.log(`[${jobId}] Progress: ${Math.round(p.percent || 0)}%`))
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // ─── ৪. টেম্প ফাইল মুছে ফেলো ───────────────────────────────
    cleanup(tempFiles);

    // ─── ৫. ২৪ ঘন্টা পর auto-delete ────────────────────────────
    setTimeout(() => {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
        console.log(`[${jobId}] 🗑️ Auto-deleted after 24 hours`);
      }
    }, 24 * 60 * 60 * 1000);

    // ─── ৬. রেসপন্স ─────────────────────────────────────────────
    const HOST = `https://${req.get("host")}`;
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
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Health Check ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Video Merge API চালু ✅" });
});

// ─── সার্ভার স্টার্ট ─────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`\n🎬 Video Merge API চালু  → http://localhost:${PORT}`);
});
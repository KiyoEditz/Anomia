const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { RekognitionClient, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const ModerationLog = require('../models/ModerationLog');

// Initialize Rekognition if credentials are set
const hasAWSCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
let rekognitionClient = null;
if (hasAWSCredentials) {
  rekognitionClient = new RekognitionClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr });
    });
  });
}

async function getVideoDuration(filePath) {
  const { stderr } = await runCommand(`ffmpeg -i "${filePath}"`);
  const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

async function extractVideoFrame(videoPath, timestamp, outPath) {
  const cmd = `ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -y "${outPath}"`;
  await runCommand(cmd);
}

async function quickScan(fileBuffer, mimeType, description = '', userId = null) {
  const isVideo = mimeType.startsWith('video/');
  const isImage = mimeType.startsWith('image/');

  // 1. Simulation Mode if AWS is not configured
  if (!hasAWSCredentials) {
    console.log('[Moderation] Running in Simulation Mode (AWS credentials not set)');
    const contentToTest = (description + ' ' + (isVideo ? 'video' : 'image')).toLowerCase();
    const isFlagged = contentToTest.includes('test-flagged') || description.toLowerCase().includes('nsfw') || description.toLowerCase().includes('violence');

    const result = {
      isApproved: !isFlagged,
      provider: 'mock-scan',
      score: isFlagged ? 99 : 0,
      label: isFlagged ? 'Simulated Violation' : 'Clean',
    };

    // Save to ModerationLog
    await ModerationLog.create({
      userId,
      mediaUrl: isVideo ? 'video-buffer' : 'image-buffer',
      mediaType: isVideo ? 'video' : (isImage ? 'image' : ''),
      scanStage: 'quick',
      provider: 'mock-scan',
      status: isFlagged ? 'flagged' : 'approved',
      score: result.score,
      rawResponse: result,
      reason: isFlagged ? 'Simulated violation keyword found' : '',
    });

    return result;
  }

  // 2. Real AWS Rekognition Mode
  try {
    if (isImage) {
      const command = new DetectModerationLabelsCommand({
        Image: { Bytes: fileBuffer },
        MinConfidence: 50,
      });
      const response = await rekognitionClient.send(command);
      const labels = response.ModerationLabels || [];

      // Check if any flagged labels exist
      const flaggedLabels = labels.filter((l) => l.Confidence >= 55);
      const isFlagged = flaggedLabels.length > 0;
      const highestScore = flaggedLabels.reduce((max, l) => Math.max(max, l.Confidence), 0);
      const reason = flaggedLabels.map((l) => `${l.Name} (${l.Confidence.toFixed(1)}%)`).join(', ');

      await ModerationLog.create({
        userId,
        mediaUrl: 'image-buffer',
        mediaType: 'image',
        scanStage: 'quick',
        provider: 'aws-rekognition',
        status: isFlagged ? 'flagged' : 'approved',
        score: highestScore,
        rawResponse: response,
        reason,
      });

      return {
        isApproved: !isFlagged,
        provider: 'aws-rekognition',
        score: highestScore,
        label: reason || 'Clean',
      };
    }

    if (isVideo) {
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempVideoPath = path.join(tempDir, `temp_${Date.now()}_video.mp4`);
      fs.writeFileSync(tempVideoPath, fileBuffer);

      try {
        const duration = await getVideoDuration(tempVideoPath);
        const t1 = Math.max(0.1, duration * 0.1);
        const t2 = Math.max(0.2, duration * 0.5);
        const t3 = Math.max(0.3, duration * 0.9);

        const timestamps = [t1, t2, t3];
        let overallFlagged = false;
        let highestScore = 0;
        const reasons = [];

        for (let i = 0; i < timestamps.length; i++) {
          const framePath = path.join(tempDir, `frame_${Date.now()}_${i}.jpg`);
          await extractVideoFrame(tempVideoPath, timestamps[i], framePath);

          if (fs.existsSync(framePath)) {
            const frameBuffer = fs.readFileSync(framePath);
            const command = new DetectModerationLabelsCommand({
              Image: { Bytes: frameBuffer },
              MinConfidence: 50,
            });
            const response = await rekognitionClient.send(command);
            const labels = response.ModerationLabels || [];

            const flaggedLabels = labels.filter((l) => l.Confidence >= 55);
            if (flaggedLabels.length > 0) {
              overallFlagged = true;
              const frameHighest = flaggedLabels.reduce((max, l) => Math.max(max, l.Confidence), 0);
              highestScore = Math.max(highestScore, frameHighest);
              reasons.push(
                `Frame ${i + 1} at ${timestamps[i].toFixed(1)}s: ` +
                  flaggedLabels.map((l) => `${l.Name} (${l.Confidence.toFixed(1)}%)`).join(', ')
              );
            }

            fs.unlinkSync(framePath);
          }
        }

        const reasonStr = reasons.join(' | ');

        await ModerationLog.create({
          userId,
          mediaUrl: 'video-buffer',
          mediaType: 'video',
          scanStage: 'quick',
          provider: 'aws-rekognition',
          status: overallFlagged ? 'flagged' : 'approved',
          score: highestScore,
          rawResponse: { reasons },
          reason: reasonStr,
        });

        return {
          isApproved: !overallFlagged,
          provider: 'aws-rekognition',
          score: highestScore,
          label: reasonStr || 'Clean',
        };
      } finally {
        if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
        }
      }
    }

    return { isApproved: true, provider: 'none', score: 0, label: 'Clean' };
  } catch (err) {
    console.error('[Moderation] AWS Rekognition Quick Scan Error:', err);
    throw new Error('Gagal memproses moderasi media otomatis.');
  }
}

module.exports = {
  quickScan,
};

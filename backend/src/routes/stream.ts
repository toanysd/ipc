import { Router } from 'express';
import { streamService } from '../services/streamService';

const router = Router();

router.post('/start', (req, res) => {
  try {
    const { rtspUrl } = req.body;
    if (!rtspUrl || typeof rtspUrl !== 'string') {
      res.status(400).json({ error: "rtspUrl is required and must be a string" });
      return;
    }
    if (!rtspUrl.startsWith('rtsp://') && !rtspUrl.startsWith('rtsps://')) {
      res.status(400).json({ error: "Invalid protocol. Only rtsp:// and rtsps:// are allowed." });
      return;
    }
    const result = streamService.startStream(rtspUrl);
    res.json(result);
  } catch (error: any) {
    if (error.message === "Maximum concurrent streams reached") {
      res.status(429).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error.message || "Failed to start stream" });
  }
});

router.post('/stop', (req, res) => {
  try {
    const { streamId } = req.body;
    if (!streamId || typeof streamId !== 'string') {
      res.status(400).json({ error: "streamId is required and must be a string" });
      return;
    }
    const success = streamService.stopStream(streamId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Stream not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to stop stream" });
  }
});

export default router;

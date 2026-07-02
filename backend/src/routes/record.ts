import { Router } from 'express';
import { recordService } from '../services/recordService';

const router = Router();

router.post('/start', (req, res) => {
  try {
    const { rtspUrl } = req.body;
    if (!rtspUrl || typeof rtspUrl !== 'string') {
      res.status(400).json({ error: "rtspUrl is required and must be a string" });
      return;
    }
    const result = recordService.startRecording(rtspUrl);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to start recording" });
  }
});

router.post('/stop', async (req, res) => {
  try {
    const { recordId } = req.body;
    if (!recordId || typeof recordId !== 'string') {
      res.status(400).json({ error: "recordId is required and must be a string" });
      return;
    }
    const success = await recordService.stopRecording(recordId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Recording not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to stop recording" });
  }
});

export default router;

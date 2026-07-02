import { Router } from 'express';
import { discoverCameras } from '../services/discovery';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const cameras = await discoverCameras();
    res.json(cameras);
  } catch (error) {
    console.error('Error in /api/cameras:', error);
    res.status(500).json({ error: 'Failed to discover cameras' });
  }
});

export default router;

import { Router } from 'express';
import camerasRouter from './cameras';
import streamRouter from './stream';
import recordRouter from './record';

const router = Router();

router.use('/cameras', camerasRouter);
router.use('/stream', streamRouter);
router.use('/record', recordRouter);

export default router;

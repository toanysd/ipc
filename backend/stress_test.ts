import { discoverCameras } from './src/services/discovery';
const onvif = require('node-onvif');

// Intercept unhandled rejections
let unhandledRejections = 0;
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  unhandledRejections++;
});

// Mock dependencies
let mockInfos: any[] = [];
let initBehavior: 'resolve' | 'reject' | 'hang' | 'reject-late' = 'resolve';

// We mock onvif behavior
(onvif as any).startProbe = async () => mockInfos;
(onvif as any).OnvifDevice = class MockOnvifDevice {
  information = { Manufacturer: 'Mock', Model: 'Camera' };
  
  public config: { xaddr: string };
  constructor(config: { xaddr: string }) {
    this.config = config;
  }
  
  async init() {
    if (initBehavior === 'resolve') {
      return Promise.resolve();
    } else if (initBehavior === 'reject') {
      return Promise.reject(new Error('init rejected immediately'));
    } else if (initBehavior === 'reject-late') {
      return new Promise((_, reject) => setTimeout(() => reject(new Error('late rejection')), 4000));
    } else if (initBehavior === 'hang') {
      return new Promise(() => {}); // never resolves
    }
  }

  getCurrentProfile() {
    return { stream: { rtsp: 'rtsp://mock' } };
  }
};

async function runTests() {
  console.log('--- STARTING STRESS TESTS ---');
  console.log('Resolved discovery module:', require.resolve('./src/services/discovery'));
  let passed = true;

  // 1. Missing xaddrs validation
  console.log('\\nTest 1: Missing xaddrs validation');
  mockInfos = [
    null,
    {},
    { xaddrs: null },
    { xaddrs: [] },
    { xaddrs: ['invalid_url'] },
    { xaddrs: ['http://1.2.3.4/onvif/device_service'] }
  ];
  try {
    const res1 = await discoverCameras();
    console.log(`Result length (should be 1): ${res1.length}`);
    if (res1.length !== 1) {
      console.error('FAILED: expected 1 valid camera');
      passed = false;
    }
  } catch (e) {
    console.error('FAILED: threw error during missing xaddrs test:', e);
    passed = false;
  }

  // 2. Deduplication
  console.log('\\nTest 2: Deduplication');
  mockInfos = [
    { xaddrs: ['http://10.0.0.5/onvif'] },
    { xaddrs: ['http://10.0.0.5/onvif2'] },
    { xaddrs: ['http://10.0.0.5:8080/onvif'] },
    { xaddrs: ['http://10.0.0.6/onvif'] }
  ];
  try {
    const res2 = await discoverCameras();
    console.log(`Result length (should be 2): ${res2.length}`);
    console.log(res2);
    if (res2.length !== 2) {
      console.error('FAILED: expected deduplication to yield 2 cameras (by IP)');
      passed = false;
    }
  } catch (e) {
    console.error('FAILED: threw error during deduplication test:', e);
    passed = false;
  }

  // 3. Dangling timers & 4. Unhandled promises
  console.log('\\nTest 3 & 4: Dangling timers & late rejection');
  mockInfos = [
    { xaddrs: ['http://10.0.0.7/onvif'] }
  ];
  initBehavior = 'reject-late';
  const start = Date.now();
  try {
    await discoverCameras();
    const elapsed = Date.now() - start;
    console.log(`Discovery took ${elapsed}ms (should be ~3000ms due to timeout)`);
    if (elapsed < 2900 || elapsed > 3500) {
      console.error('FAILED: timeout was not respected properly');
      passed = false;
    }
  } catch (e) {
    console.error('FAILED: threw error during timeout test:', e);
    passed = false;
  }

  // Wait extra 1.5 seconds to see if 'reject-late' triggers unhandled promise rejection at 4000ms
  console.log('Waiting 1.5s for late rejection to potentially occur...');
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  if (unhandledRejections > 0) {
    console.error(`FAILED: caught ${unhandledRejections} unhandled promise rejection(s)`);
    passed = false;
  }

  console.log('\\n--- TESTS ' + (passed ? 'PASSED' : 'FAILED') + ' ---');
  process.exit(passed ? 0 : 1);
}

runTests();

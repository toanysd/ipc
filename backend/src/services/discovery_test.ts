import { discoverCameras } from './discovery';
// @ts-ignore
import * as onvif from 'node-onvif';

async function runTests() {
  console.log('--- Test 1: Empty response ---');
  // @ts-ignore
  onvif.startProbe = async () => [];
  try {
    const res = await discoverCameras();
    console.log('Test 1 Result:', res);
  } catch (err: any) {
    console.error('Test 1 Error:', err);
  }

  console.log('--- Test 2: startProbe throws error ---');
  // @ts-ignore
  onvif.startProbe = async () => { throw new Error('Network timeout'); };
  try {
    const res = await discoverCameras();
    console.log('Test 2 Result:', res);
  } catch (err: any) {
    console.error('Test 2 Error:', err.message);
  }

  console.log('--- Test 3: device.init throws ---');
  // @ts-ignore
  onvif.startProbe = async () => {
    return [
      {
        address: '192.168.1.100',
        port: 80,
        init: async () => { throw new Error('Auth failed'); }
      }
    ];
  };
  try {
    const res = await discoverCameras();
    console.log('Test 3 Result:', res);
  } catch (err: any) {
    console.error('Test 3 Error:', err.message);
  }

  console.log('--- Test 4: device properties missing (address undefined) ---');
  // @ts-ignore
  onvif.startProbe = async () => {
    return [
      {
        init: async () => {},
        getCurrentProfile: () => null,
      }
    ];
  };
  try {
    const res = await discoverCameras();
    console.log('Test 4 Result:', res);
  } catch (err: any) {
    console.error('Test 4 Error:', err.message);
  }

  console.log('--- Test 5: profile present but no rtsp stream ---');
  // @ts-ignore
  onvif.startProbe = async () => {
    return [
      {
        address: '10.0.0.1',
        port: 8080,
        init: async () => {},
        getCurrentProfile: () => ({ stream: {} }),
        information: { Manufacturer: 'Acme', Model: 'CamX' }
      }
    ];
  };
  try {
    const res = await discoverCameras();
    console.log('Test 5 Result:', res);
  } catch (err: any) {
    console.error('Test 5 Error:', err.message);
  }
}

runTests().catch(console.error);

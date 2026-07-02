import { discoverCameras } from './discovery';
// @ts-ignore
import * as onvif from 'node-onvif';

async function test() {
  console.log('Mocking onvif.startProbe to return the actual POJO format from node-onvif...');
  
  // @ts-ignore
  onvif.startProbe = async () => {
    return [
      {
        urn: 'urn:uuid:4d454930-0000-1000-8000-bcc34217e292',
        name: 'Panasonic BB-SC384B',
        hardware: 'BB-SC384B',
        location: 'office',
        types: ['dn:NetworkVideoTransmitter', 'tds:Device'],
        xaddrs: ['http://192.168.10.12/onvif/device_service'],
        scopes: []
      }
    ];
  };

  try {
    const cameras = await discoverCameras();
    console.log('Discovered Cameras:');
    console.log(JSON.stringify(cameras, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();

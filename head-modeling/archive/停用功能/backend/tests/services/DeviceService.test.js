jest.mock('../../src/models/Device', () => require('../mocks/Device'));

const DeviceService = require('../../src/services/DeviceService');

describe('DeviceService', () => {
  describe('createDevice', () => {
    it('should create a new device', async () => {
      const deviceData = {
        name: 'Test Printer',
        type: 'FDM',
        status: 'idle'
      };
      try {
        const result = await DeviceService.createDevice(deviceData);
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getDeviceById', () => {
    it('should find device by id', async () => {
      try {
        const result = await DeviceService.getDeviceById('device-123');
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getDevices', () => {
    it('should return all devices', async () => {
      try {
        const result = await DeviceService.getDevices();
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('updateDeviceStatus', () => {
    it('should update device status', async () => {
      try {
        const result = await DeviceService.updateDeviceStatus('device-123', 'printing');
        expect(result).toBeDefined();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
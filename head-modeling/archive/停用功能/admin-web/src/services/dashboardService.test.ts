import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from './api';
import {
  getDeviceTimeline,
  getInventoryPrediction,
  DeviceTimeline,
  InventoryPrediction,
} from './dashboardService';

// Mock the api module
vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDeviceTimeline', () => {
    it('should return device timeline data on successful response', async () => {
      const mockData: DeviceTimeline = {
        devices: [
          {
            name: 'Printer-001',
            timeline: [
              { type: 'printing', start: '2024-01-01T08:00:00Z', end: '2024-01-01T12:00:00Z' },
              { type: 'idle', start: '2024-01-01T12:00:00Z', end: '2024-01-01T18:00:00Z' },
            ],
          },
          {
            name: 'Printer-002',
            timeline: [
              { type: 'idle', start: '2024-01-01T08:00:00Z', end: '2024-01-01T18:00:00Z' },
            ],
          },
        ],
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T23:59:59Z',
        },
      };

      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getDeviceTimeline();

      expect(api.get).toHaveBeenCalledWith('/dashboard/devices/timeline');
      expect(result).toEqual(mockData);
    });

    it('should return data directly when response.data has no nested data property', async () => {
      const mockData: DeviceTimeline = {
        devices: [],
        timeRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T23:59:59Z' },
      };

      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockData,
      });

      const result = await getDeviceTimeline();

      expect(result).toEqual(mockData);
    });

    it('should throw error when API call fails', async () => {
      const mockError = new Error('Network error');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getDeviceTimeline()).rejects.toThrow('Network error');

      expect(consoleSpy).toHaveBeenCalledWith('获取设备时间线失败:', mockError);

      consoleSpy.mockRestore();
    });

    it('should throw error with response data when API returns error', async () => {
      const mockError = {
        response: { data: { message: 'Server error' } },
        message: 'Request failed',
      };
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getDeviceTimeline()).rejects.toEqual(mockError);

      consoleSpy.mockRestore();
    });
  });

  describe('getInventoryPrediction', () => {
    it('should return inventory prediction data on successful response', async () => {
      const mockData: InventoryPrediction = {
        indicators: [
          { name: 'PLA 白色', max: 100 },
          { name: 'PLA 黑色', max: 100 },
          { name: 'PLA 红色', max: 100 },
        ],
        current: [80, 60, 45],
        predicted: [65, 40, 30],
      };

      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: mockData },
      });

      const result = await getInventoryPrediction();

      expect(api.get).toHaveBeenCalledWith('/dashboard/inventory/prediction');
      expect(result).toEqual(mockData);
    });

    it('should return data directly when response.data has no nested data property', async () => {
      const mockData: InventoryPrediction = {
        indicators: [{ name: 'PLA 白色', max: 100 }],
        current: [80],
        predicted: [65],
      };

      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockData,
      });

      const result = await getInventoryPrediction();

      expect(result).toEqual(mockData);
    });

    it('should throw error when API call fails', async () => {
      const mockError = new Error('Network error');
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getInventoryPrediction()).rejects.toThrow('Network error');

      expect(consoleSpy).toHaveBeenCalledWith('获取库存预测失败:', mockError);

      consoleSpy.mockRestore();
    });

    it('should throw error with response data when API returns error', async () => {
      const mockError = {
        response: { data: { message: 'Unauthorized' } },
        message: 'Request failed with status 401',
      };
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getInventoryPrediction()).rejects.toEqual(mockError);

      consoleSpy.mockRestore();
    });
  });
});
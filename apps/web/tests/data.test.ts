import { describe, it, expect } from 'vitest';
import {
  getVendors, getHardware, getServers, getModels, getCases, getPatterns,
  getResolvedHardware, getResolvedCases
} from '~/lib/data';

describe('data layer', () => {
  it('loads 22 vendors', async () => {
    const v = await getVendors();
    expect(v.length).toBe(22);
  });

  it('loads 28 hardware cards', async () => {
    const h = await getHardware();
    expect(h.length).toBe(28);
  });

  it('loads 10 servers/super-pods', async () => {
    expect((await getServers()).length).toBe(10);
  });

  it('loads 14 models', async () => {
    expect((await getModels()).length).toBe(14);
  });

  it('loads 3 seed cases', async () => {
    expect((await getCases()).length).toBe(3);
  });

  it('loads 3 patterns', async () => {
    expect((await getPatterns()).length).toBe(3);
  });

  it('resolves hardware vendor refs', async () => {
    const resolved = await getResolvedHardware();
    const h100 = resolved.find((h) => h.id === 'h100-sxm5');
    expect(h100?.vendor.name).toBe('NVIDIA');
  });

  it('resolves case stack refs', async () => {
    const cases = await getResolvedCases();
    const dsr1 = cases.find((c) => c.id === 'case-dsr1-asc910bx16-mindie-001');
    expect(dsr1?.resolved.hardware.id).toBe('ascend-910b');
    expect(dsr1?.resolved.model.id).toBe('deepseek-r1');
    expect(dsr1?.resolved.engine.id).toBe('mindie');
  });

  it('china hardware: 13 cards from CN vendors', async () => {
    const resolved = await getResolvedHardware();
    const china = resolved.filter((h) => h.vendor.country === 'CN');
    expect(china.length).toBe(13);
  });
});

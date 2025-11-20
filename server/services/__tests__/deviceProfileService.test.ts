// server/services/__tests__/deviceProfileService.test.ts
import * as svc from '../deviceProfileService';

describe('deviceProfileService', () => {
  // @ts-ignore
  const store: Map<string, any> = (svc as any).store;

  beforeEach(() => {
    store.clear();
  });

  test('create → list → get', () => {
    const data = { name: 'FooDevice', classification: 'Class II' };
    const created = svc.createProfile(data);

    expect(created).toMatchObject(data);
    expect(created.id).toBeDefined();

    const all = svc.listProfiles();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(created);

    const fetched = svc.getProfile(created.id);
    expect(fetched).toEqual(created);
  });

  test('updateProfile merges correctly', () => {
    const { id } = svc.createProfile({ name: 'Alpha', classification: 'Class I' });
    const updated = svc.updateProfile(id, { classification: 'Class III' });

    expect(updated).toEqual({ id, name: 'Alpha', classification: 'Class III' });
  });

  test('deleteProfile removes entry', () => {
    const { id } = svc.createProfile({ name: 'Xray', classification: 'Class III' });
    expect(svc.listProfiles()).toHaveLength(1);

    svc.deleteProfile(id);
    expect(svc.listProfiles()).toHaveLength(0);
    expect(() => svc.getProfile(id)).toThrow();
  });

  test('get/update non-existent id throws', () => {
    expect(() => svc.getProfile('nonexistent')).toThrow();
    expect(() => svc.updateProfile('nonexistent', {})).toThrow();
  });
});

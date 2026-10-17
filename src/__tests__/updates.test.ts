import { classifyRemote, compareVersions, unseenNews } from '@/lib/updates';

const current = { build: 'b1', version: '1.0.0' };
const log = [
  { version: '1.0.2', date: '2026-10-20', notes: ['Due'] },
  { version: '1.0.1', date: '2026-10-19', notes: ['Uno'] },
  { version: '1.0.0', date: '2026-10-17', notes: ['Base'] },
];

describe('versioni e aggiornamenti', () => {
  it('confronta le versioni numero per numero', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.1.0')).toBe(-1);
  });
  it('versione nuova → avviso con le novità', () => {
    expect(classifyRemote({ build: 'b2', version: '1.0.1', notes: ['Novità', 3] }, current)).toEqual({
      kind: 'version',
      version: '1.0.1',
      notes: ['Novità'],
    });
  });
  it('stessa versione, pubblicazione nuova → aggiornamento semplice', () => {
    expect(classifyRemote({ build: 'b2', version: '1.0.0' }, current)).toEqual({ kind: 'silent' });
    expect(classifyRemote({ build: 'b2' }, current)).toEqual({ kind: 'silent' });
  });
  it('niente da fare', () => {
    expect(classifyRemote({ build: 'b1', version: '1.0.1' }, current)).toEqual({ kind: 'none' });
    expect(classifyRemote(null, current)).toEqual({ kind: 'none' });
    expect(classifyRemote({ build: 'b2', version: '1.0.1' }, { build: '', version: '1.0.0' })).toEqual({ kind: 'none' });
  });
  it('novità da mostrare dopo l\'aggiornamento (una volta)', () => {
    expect(unseenNews('1.0.0', '1.0.2', log)?.map((e) => e.version)).toEqual(['1.0.2', '1.0.1']);
    expect(unseenNews('1.0.2', '1.0.2', log)).toBeNull();
    expect(unseenNews(null, '1.0.2', log)).toBeNull();
  });
});

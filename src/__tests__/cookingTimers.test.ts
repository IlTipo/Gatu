import {
  addMinute,
  cancelTimer,
  checkTimers,
  getTimers,
  resetTimersForTests,
  startTimer,
  stopRinging,
} from '@/features/cooking/timers';

beforeEach(() => resetTimersForTests());
afterAll(() => resetTimersForTests());

describe('timer della cucina', () => {
  it('più timer insieme; suona solo quello scaduto', () => {
    const now = 1_000_000;
    const pasta = startTimer('Pasta', 600, 'r1', now);
    startTimer('Sugo', 1200, 'r1', now);
    checkTimers(now + 600_000);
    expect(getTimers().map((t) => [t.label, t.ringing])).toEqual([
      ['Pasta', true],
      ['Sugo', false],
    ]);
    expect(getTimers()[0].id).toBe(pasta.id);
  });

  it('"stop" toglie quelli che suonano, "annulla" uno solo', () => {
    const now = 2_000_000;
    startTimer('Uova', 60, 'r1', now);
    const sugo = startTimer('Sugo', 1200, 'r1', now);
    checkTimers(now + 61_000);
    stopRinging();
    expect(getTimers().map((t) => t.label)).toEqual(['Sugo']);
    cancelTimer(sugo.id);
    expect(getTimers()).toEqual([]);
  });

  it('+1 minuto rimette in moto un timer che suonava', () => {
    const t = startTimer('Forno', 1, 'r1', Date.now() - 5000);
    checkTimers();
    expect(getTimers()[0].ringing).toBe(true);
    addMinute(t.id);
    expect(getTimers()[0].ringing).toBe(false);
    expect(getTimers()[0].endAt).toBeGreaterThan(Date.now() + 55_000);
  });
});

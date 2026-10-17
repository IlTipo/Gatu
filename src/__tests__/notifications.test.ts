import { shiftTime } from '@/features/notifications/time';

describe('orari delle notifiche', () => {
  it('sposta di 15 minuti avanti e indietro', () => {
    expect(shiftTime('11:30:00', 15)).toBe('11:45:00');
    expect(shiftTime('11:30:00', -15)).toBe('11:15:00');
  });
  it('fa il giro della mezzanotte', () => {
    expect(shiftTime('23:45:00', 15)).toBe('00:00:00');
    expect(shiftTime('00:00:00', -15)).toBe('23:45:00');
  });
});

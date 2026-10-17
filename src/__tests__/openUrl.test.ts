import { isSafeExternalUrl } from '@/lib/openUrl';

describe('link esterni', () => {
  it('apre solo pagine web, telefono ed email', () => {
    expect(isSafeExternalUrl('https://www.tiktok.com/@chef/video/1')).toBe(true);
    expect(isSafeExternalUrl('tel:+39021234567')).toBe(true);
    expect(isSafeExternalUrl('mailto:a@b.it')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeExternalUrl('morso-video:123')).toBe(false);
  });
});

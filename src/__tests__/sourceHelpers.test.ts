import { displayHost, findUrl, readSharedParams } from '@/features/sources/helpers';

describe('readSharedParams (Condividi / Comando rapido)', () => {
  it('link nel parametro url', () => {
    expect(readSharedParams({ url: 'https://www.tiktok.com/@a/video/1' })).toEqual({
      link: 'https://www.tiktok.com/@a/video/1',
      text: '',
    });
  });

  it('TikTok e Instagram su Android mettono il link dentro "text"', () => {
    expect(readSharedParams({ text: 'Guarda questo video! https://vm.tiktok.com/ZMabc/' })).toEqual({
      link: 'https://vm.tiktok.com/ZMabc/',
      text: 'Guarda questo video!',
    });
  });

  it('titolo + link separati', () => {
    expect(readSharedParams({ title: 'Focaccia genovese', url: 'https://youtu.be/abc' })).toEqual({
      link: 'https://youtu.be/abc',
      text: 'Focaccia genovese',
    });
  });

  it('niente parametri', () => {
    expect(readSharedParams({})).toEqual({ link: '', text: '' });
  });
});

describe('findUrl / displayHost', () => {
  it('toglie la punteggiatura finale', () => {
    expect(findUrl('vai su https://example.com/ricetta).')).toBe('https://example.com/ricetta');
    expect(findUrl('niente')).toBeNull();
  });

  it('mostra solo il dominio', () => {
    expect(displayHost('https://www.giallozafferano.it/ricette/x')).toBe('giallozafferano.it');
    expect(displayHost('non un link')).toBe('non un link');
  });
});

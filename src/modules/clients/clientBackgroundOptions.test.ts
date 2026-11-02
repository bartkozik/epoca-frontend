import { describe, expect, it } from 'vitest';
import { CLIENT_TEXTURES, getClientTextureId, resolveClientTexture } from './clientBackgroundOptions';

describe('resolveClientTexture', () => {
  it('resolves a stable textureN identifier to the current build asset', () => {
    expect(resolveClientTexture('texture3')).toBe(CLIENT_TEXTURES[2]);
  });

  it("resolves an old build's fully-resolved, differently-hashed URL by its textureN substring", () => {
    expect(resolveClientTexture('/static/media/texture7.oldhash123.png')).toBe(CLIENT_TEXTURES[6]);
  });

  it('falls back to the first texture for an empty, undefined, or unrecognized value', () => {
    expect(resolveClientTexture('')).toBe(CLIENT_TEXTURES[0]);
    expect(resolveClientTexture(undefined)).toBe(CLIENT_TEXTURES[0]);
    expect(resolveClientTexture('not-a-texture-path.png')).toBe(CLIENT_TEXTURES[0]);
  });

  it('falls back to the first texture for a textureN number outside the known range', () => {
    expect(resolveClientTexture('texture99')).toBe(CLIENT_TEXTURES[0]);
  });

  it('does not match "texture" appearing only as part of an unrelated word', () => {
    expect(resolveClientTexture('faketexture123')).toBe(CLIENT_TEXTURES[0]);
    expect(resolveClientTexture('texture3suffix')).toBe(CLIENT_TEXTURES[0]);
  });
});

describe('getClientTextureId', () => {
  it('returns the stable textureN identifier matching a resolved texture asset', () => {
    expect(getClientTextureId(CLIENT_TEXTURES[4])).toBe('texture5');
  });

  it('falls back to texture1 for a value that is not one of the known textures', () => {
    expect(getClientTextureId('unknown-value')).toBe('texture1');
  });

  it('round-trips every known texture through resolveClientTexture', () => {
    CLIENT_TEXTURES.forEach((texture) => {
      expect(resolveClientTexture(getClientTextureId(texture))).toBe(texture);
    });
  });
});

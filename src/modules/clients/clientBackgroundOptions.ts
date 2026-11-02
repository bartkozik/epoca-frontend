import texture1 from '@/core/theme/assets/images/textures/texture1.png';
import texture2 from '@/core/theme/assets/images/textures/texture2.png';
import texture3 from '@/core/theme/assets/images/textures/texture3.png';
import texture4 from '@/core/theme/assets/images/textures/texture4.png';
import texture5 from '@/core/theme/assets/images/textures/texture5.png';
import texture6 from '@/core/theme/assets/images/textures/texture6.png';
import texture7 from '@/core/theme/assets/images/textures/texture7.png';
import texture8 from '@/core/theme/assets/images/textures/texture8.png';
import texture9 from '@/core/theme/assets/images/textures/texture9.png';
import texture10 from '@/core/theme/assets/images/textures/texture10.png';
import colorVariables from '@/core/theme/variables.module.scss';

export const CLIENT_COLORS = [
  colorVariables.colorClientRed,
  colorVariables.colorClientCoral,
  colorVariables.colorClientOrange,
  colorVariables.colorClientLime,
  colorVariables.colorClientGreen,
  colorVariables.colorClientTeal,
  colorVariables.colorClientBlue,
  colorVariables.colorClientPurple,
  colorVariables.colorClientDeepRed,
  colorVariables.colorClientBrightOrange,
  colorVariables.colorClientLightGreen,
  colorVariables.colorClientTurquoise,
  colorVariables.colorClientNavy,
  colorVariables.colorClientViolet,
  colorVariables.colorClientMagenta,
  colorVariables.colorClientBrown,
  colorVariables.colorClientTan,
  colorVariables.colorClientBeige,
  colorVariables.colorClientGold,
  colorVariables.colorClientOlive,
  colorVariables.colorClientPeach,
  colorVariables.colorClientYellow,
  colorVariables.colorClientIndigo,
  colorVariables.colorClientBlack,
];

export const CLIENT_TEXTURES = [
  texture1,
  texture2,
  texture3,
  texture4,
  texture5,
  texture6,
  texture7,
  texture8,
  texture9,
  texture10,
];

// Anchored with word boundaries so `texture3` matches as a whole segment (e.g. the stable ID
// itself, or preceded by `/` and followed by `.` in an old asset path) but an unrelated string
// that merely contains "texture" as a substring (e.g. "faketexture123") does not.
const CLIENT_TEXTURE_PATTERN = /\btexture(\d+)\b/;

// `Client.texture` is persisted as a plain string, which may be an older build's fully-resolved,
// content-hashed asset path (hashes that don't exist in this build's output) or the stable
// `textureN` identifier new selections are saved as (see `getClientTextureId`). Both forms carry
// the same recognizable `textureN` substring, so resolve either one to this build's real asset
// URL instead of trusting the stored value to still be a working path.
export const resolveClientTexture = (rawTexture?: string): string => {
  const match = rawTexture?.match(CLIENT_TEXTURE_PATTERN);
  const index = match ? Number(match[1]) - 1 : -1;
  return CLIENT_TEXTURES[index] ?? CLIENT_TEXTURES[0];
};

// The inverse of `resolveClientTexture`: turns a currently-selected texture (one of the resolved
// URLs in `CLIENT_TEXTURES`) into the stable identifier to persist, so a future build changing
// asset hashes again never invalidates an already-saved selection.
export const getClientTextureId = (resolvedTexture: string): string => {
  const index = CLIENT_TEXTURES.indexOf(resolvedTexture);
  return `texture${index === -1 ? 1 : index + 1}`;
};

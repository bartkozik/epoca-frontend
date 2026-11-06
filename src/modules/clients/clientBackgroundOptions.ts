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

const CLIENT_TEXTURE_PATTERN = /\btexture(\d+)\b/;

export const resolveClientTexture = (rawTexture?: string): string => {
  const match = rawTexture?.match(CLIENT_TEXTURE_PATTERN);
  const index = match ? Number(match[1]) - 1 : -1;
  return CLIENT_TEXTURES[index] ?? CLIENT_TEXTURES[0];
};

export const getClientTextureId = (resolvedTexture: string): string => {
  const index = CLIENT_TEXTURES.indexOf(resolvedTexture);
  return `texture${index === -1 ? 1 : index + 1}`;
};

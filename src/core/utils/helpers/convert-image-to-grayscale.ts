import DEFAULT_TEXTURE from '@/core/theme/assets/images/textures/texture4.png';

export const convertImageToGrayscale = (src: string, callback: (newSrc: string) => void): void => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  const image = new Image();

  image.onerror = () => {
    callback(DEFAULT_TEXTURE);
  };

  image.onload = () => {
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0, image.width, image.height);
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    callback(canvas.toDataURL());
  };

  image.src = src;
};

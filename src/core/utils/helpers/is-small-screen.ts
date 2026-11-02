export function isSmallScreen(width?: number): boolean {
  const size = 992;
  return width ? width < size : window.innerWidth < size;
}

export const getHoursFromDuration = (duration: string): number => {
  const [hours, minutes] = duration.split(':').map(Number);
  return hours + minutes / 60;
};

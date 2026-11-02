import { MAX_UNIT_HEIGHT, MIN_UNIT_HEIGHT } from '@/core/utils/constants';
import { getHoursFromDuration } from './get-hours-from-duration';

const BASE_DESCRIPTION_LENGTH = 24;
const MAX_DESCRIPTION_LENGTH = 530;
const MAX_UNIT_DURATION = 24;
const MIN_UNIT_DURATION_TO_SCALE_HEIGHT = 1;
const MIN_UNIT_DURATION_TO_SCALE_DESCRIPTION_LENGTH = 2.5;

interface UnitHeightAndDescriptionLength {
  height: number;
  unitDescriptionMaxLength: number;
}

export const calculateUnitHeightAndDescriptionLength = (duration: string): UnitHeightAndDescriptionLength => {
  const hours = getHoursFromDuration(duration);
  let height: number, unitDescriptionMaxLength: number;

  if (hours <= MIN_UNIT_DURATION_TO_SCALE_HEIGHT) {
    height = MIN_UNIT_HEIGHT;
    unitDescriptionMaxLength = BASE_DESCRIPTION_LENGTH;
  } else if (hours > MAX_UNIT_DURATION) {
    height = MAX_UNIT_HEIGHT;
    unitDescriptionMaxLength = MAX_DESCRIPTION_LENGTH;
  } else {
    const heightPerHour = (MAX_UNIT_HEIGHT - MIN_UNIT_HEIGHT) / (MAX_UNIT_DURATION - MIN_UNIT_DURATION_TO_SCALE_HEIGHT);
    height = MIN_UNIT_HEIGHT + (hours - MIN_UNIT_DURATION_TO_SCALE_HEIGHT) * heightPerHour;

    if (hours < MIN_UNIT_DURATION_TO_SCALE_DESCRIPTION_LENGTH) {
      unitDescriptionMaxLength = BASE_DESCRIPTION_LENGTH;
    } else {
      unitDescriptionMaxLength = BASE_DESCRIPTION_LENGTH * hours;
    }
  }

  return { height, unitDescriptionMaxLength };
};

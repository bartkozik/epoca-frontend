import { DATE_FORMAT, formatDate } from '@/core/utils/helpers';
import { ReactNode } from 'react';
import clsx from 'clsx';
import { useDroppable } from '@dnd-kit/core';
import dayjs from 'dayjs';
import styles from './DroppableUnitArea.module.scss';

const formatOptionalDate = (date: string | null): string | null => {
  return date ? formatDate(date, DATE_FORMAT.DAY_BE_FORMAT) : null;
};

interface DroppableUnitAreaProps {
  date: string;
  children: ReactNode;
  dragEndDate: string | null;
  dragStartDate: string | null;
}

const DroppableUnitArea = ({ date, children, dragEndDate, dragStartDate }: DroppableUnitAreaProps): JSX.Element => {
  const { isOver, setNodeRef } = useDroppable({
    id: date,
    data: {
      type: 'Column',
    },
  });

  const formattedDate = formatDate(date, DATE_FORMAT.DAY_BE_FORMAT);
  const formattedDragEndDate = formatOptionalDate(dragEndDate);
  const formattedDragStartDate = formatOptionalDate(dragStartDate);

  const isSourceSameDateAsDate = formattedDragStartDate === formattedDate;
  const isTarget = formattedDragEndDate === formattedDate && formattedDragStartDate !== formattedDate;

  const isDateInFuture = dayjs(formattedDate).isAfter(dayjs());

  const isDropIndicator = isTarget && !isDateInFuture;
  const cantDropIndicator = isTarget && isDateInFuture;

  return (
    <div
      className={clsx(
        styles.root,
        { [styles.dropzoneContainer]: isOver },
        { [styles.dropIndicator]: isDropIndicator || isSourceSameDateAsDate },
        { [styles.cantDropIndicator]: cantDropIndicator },
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

export default DroppableUnitArea;

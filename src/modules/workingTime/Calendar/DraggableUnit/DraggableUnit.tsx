import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import Icon, { icons } from '@/core/theme/icon';
import { useAuth } from '@/modules/auth/AuthProvider';
import { UnitState, Unit as UnitType } from '@/modules/workingTime/types';
import { useUnitWorkspace } from '@/modules/workingTime/UnitWorkspaceProvider';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Unit from '../Unit';
import styles from './DraggableUnit.module.scss';

interface DraggableUnitProps {
  unit: UnitType | null;
  activeUnitSequenceIndex?: number | null;
  dragged?: boolean;
}

const DraggableUnit = ({ unit, dragged = false, activeUnitSequenceIndex }: DraggableUnitProps): JSX.Element | null => {
  const auth = useAuth();
  const { hasAccess } = auth;
  const { handleUnitEditFormOpen } = useUnitWorkspace();

  const { attributes, listeners, setNodeRef, transform, isDragging, transition, isOver } = useSortable({
    id: unit ? unit.id : 'default-id',
    data: {
      type: 'Unit',
      unit,
    },
  });

  if (!unit) return null;

  if (isDragging) return <div className={styles.initialUnitPlace} />;

  const isDisabledDropzoneIndicator =
    activeUnitSequenceIndex && activeUnitSequenceIndex >= 0 && unit.sequenceIndex === activeUnitSequenceIndex + 1;

  if (isOver) {
    return (
      <>
        <div
          className={clsx(styles.dropzoneBeforeUnit, {
            hidden: isDisabledDropzoneIndicator,
          })}
        />
        <Unit data={unit} isDraft={unit.state === UnitState.Draft} />
      </>
    );
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const restrictedAccess = hasAccess(ROLE_PERMISSIONS.Internal);

  const dragHandle = (
    <div {...listeners} {...attributes}>
      <Icon className={styles.dragIndicator} icon={icons.drag} />
    </div>
  );

  return (
    <div className={clsx(styles.root, { [styles.draggedUnit]: dragged })} style={style} ref={setNodeRef}>
      {restrictedAccess && dragHandle}
      <Unit data={unit} onEdit={() => handleUnitEditFormOpen(unit)} isDraft={unit.state === UnitState.Draft} />
    </div>
  );
};

export default DraggableUnit;

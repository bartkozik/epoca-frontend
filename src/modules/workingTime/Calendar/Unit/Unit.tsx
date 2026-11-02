import Button from '@/core/theme/button';
import Icon, { icons } from '@/core/theme/icon';
import IconButton from '@/core/theme/iconButton';
import LoadingArea from '@/core/theme/loadingArea';
import Tooltip from '@/core/theme/tooltip';
import colorVariables from '@/core/theme/variables.module.scss';
import { calculateUnitHeightAndDescriptionLength, convertImageToGrayscale } from '@/core/utils/helpers';
import { resolveClientTexture } from '@/modules/clients/clientBackgroundOptions';
import { Unit as UnitType, WorkUnitEntryType } from '@/modules/workingTime/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { parseTaskIds } from './parseTaskIds';
import styles from './Unit.module.scss';
import UnitLoader from './unitLoader';

const EMPTY_FIELD_DASH = '-';
const PENCIL_ICON = <Icon icon={icons.pencil} width={15} height={15} />;

interface UnitProps {
  data: UnitType;
  isDraft?: boolean;
  onEdit?: (data: UnitType) => void;
}

const Unit = ({ data, isDraft = false, onEdit }: UnitProps): JSX.Element | null => {
  const { t } = useTranslation();
  const { entryType, projectClient, description, formattedDuration, taskId } = data;
  const isNote = entryType === WorkUnitEntryType.Note;
  const taskIds = useMemo(() => parseTaskIds(taskId), [taskId]);
  const taskIdCount = taskIds.length;

  const clientColorStyle = projectClient?.clientColor || colorVariables.colorClientDefault;
  const clientTextureStyle = resolveClientTexture(projectClient?.clientTexture);

  const [grayscaleTexture, setGrayscaleTexture] = useState('');

  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const descriptionWrapperRef = useRef<HTMLParagraphElement>(null);
  const [lineClamp, setLineClamp] = useState(0);

  useEffect(() => {
    convertImageToGrayscale(clientTextureStyle, (newTexture) => {
      setGrayscaleTexture(newTexture);
    });
  }, [clientTextureStyle]);

  useEffect(() => {
    if (descriptionWrapperRef.current && descriptionRef.current) {
      const descriptionWrapperElement = descriptionWrapperRef.current;
      const descriptionElement = descriptionRef.current;
      const computedStyle = getComputedStyle(descriptionElement);
      const lineHeight = parseFloat(computedStyle.lineHeight);
      const containerHeight = descriptionWrapperElement.clientHeight;

      const fullLines = Math.floor(containerHeight / lineHeight);

      if (lineClamp !== fullLines) {
        setLineClamp(fullLines);
      }
    }
  });

  useEffect(() => {
    if (descriptionRef.current && lineClamp !== 0) {
      const descriptionElement = descriptionRef.current;
      const computedStyle = getComputedStyle(descriptionElement);
      const lineHeight = parseFloat(computedStyle.lineHeight);

      descriptionElement.style.setProperty('line-clamp', `${lineClamp}`);
      descriptionElement.style.setProperty('-webkit-line-clamp', `${lineClamp}`);
      descriptionElement.style.maxHeight = `${lineClamp * lineHeight}px`;
    }
  }, [lineClamp]);

  const { height } = useMemo(() => calculateUnitHeightAndDescriptionLength(formattedDuration), [formattedDuration]);

  if (!projectClient) return null;

  const { clientName, projectName } = projectClient;

  const taskIdBadge = taskIdCount ? (
    <Tooltip
      className={styles.taskIdTooltip}
      content={
        <span className={styles.taskIdTooltipContent}>
          <strong>{t('working_time.calendar.unit.task_id_badge.tooltip_title', { count: taskIdCount })}</strong>
          <span>{taskIds.join(', ')}</span>
        </span>
      }
      placement="top"
    >
      <button
        aria-label={t('working_time.calendar.unit.task_id_badge.aria_label', { count: taskIdCount })}
        className={styles.taskIdBadge}
        onClick={(event) => event.stopPropagation()}
        type="button"
      >
        # ID{taskIdCount > 1 ? ` ×${taskIdCount}` : ''}
      </button>
    </Tooltip>
  ) : null;

  const inlineStyle = {
    backgroundColor: `${clientColorStyle}FF`,
    backgroundImage: `url(${grayscaleTexture})`,
    height: `${height}px`,
  };

  return (
    <LoadingArea loading={!grayscaleTexture} loader={<UnitLoader loading={!grayscaleTexture} />}>
      <div
        aria-label={description}
        onClick={() => onEdit && onEdit(data)}
        className={clsx(styles.root, { [styles.draft]: isDraft })}
        role="article"
        style={inlineStyle}
      >
        <div className={clsx(styles.unitHeader, { [styles.draftHeader]: isDraft })}>
          {isDraft ? (
            <Button color="white" label={t('common.draft')} size="small" startIcon={PENCIL_ICON} variant="draft" />
          ) : null}
          <div className={styles.unitTitleWrapper}>
            <p className={styles.unitTitle}>{clientName || EMPTY_FIELD_DASH}</p>
          </div>
          <div className={styles.unitProjectNameWrapper}>
            <div className={styles.unitProjectName}>{projectName || EMPTY_FIELD_DASH}</div>
          </div>
          <div className={styles.unitDescriptionWrapper} ref={descriptionWrapperRef}>
            <p className={styles.unitDescription} ref={descriptionRef}>
              {description}
            </p>
          </div>
        </div>

        <div className={styles.unitFooter}>
          {isNote ? (
            <span className={styles.noteBadge}>{t('working_time.entry_type.note')}</span>
          ) : (
            <div className={styles.unitFooterTime}>
              <Icon icon={icons.clock} width={13} height={13} />
              <p>{formattedDuration}</p>
            </div>
          )}
          {taskIdBadge}
          {!isDraft ? (
            <IconButton
              className={styles.unitEditButton}
              color="white"
              icon={PENCIL_ICON}
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.(data);
              }}
              size="small"
              variant="raw"
            />
          ) : null}
        </div>
      </div>
    </LoadingArea>
  );
};

export default Unit;

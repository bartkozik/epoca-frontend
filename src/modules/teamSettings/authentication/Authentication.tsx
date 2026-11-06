import { isDemo } from '@/core/config/demo';
import Button from '@/core/theme/button';
import Checkbox from '@/core/theme/checkbox';
import { Input, TextArea } from '@/core/theme/inputs';
import LoadingArea from '@/core/theme/loadingArea';
import Select from '@/core/theme/select';
import { convertTimeFormat, convertToIsoDuration } from '@/core/utils/helpers';
import { LanguageOption } from '@/core/utils/option-types';
import { getLanguageOptions } from '@/core/utils/options';
import { RawSamlConfig, useSamlConfigQuery, useUpdateSamlConfigMutation } from '@/modules/ssoAuth';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import styles from './Authentication.module.scss';

type SamlConfigDraft = RawSamlConfig & { formattedValidFor: string };

const toSamlConfigDraft = (raw: RawSamlConfig): SamlConfigDraft => ({
  ...raw,
  formattedValidFor: convertTimeFormat({ time: raw.validFor }) || '',
});

const Authentication = (): JSX.Element | null => {
  const { t } = useTranslation();
  const samlConfigQuery = useSamlConfigQuery();
  const updateSamlConfigMutation = useUpdateSamlConfigMutation();
  const [samlConfigDraft, setSamlConfigDraft] = useState<SamlConfigDraft | null>(null);

  useEffect(() => {
    const data = samlConfigQuery.data;
    if (!data) return;
    setSamlConfigDraft((current) => (current === null ? toSamlConfigDraft(data) : current));
  }, [samlConfigQuery.data]);

  const selectedLanguageOption = useMemo(
    () => getLanguageOptions().find(({ value }) => value === samlConfigDraft?.langCode),
    [samlConfigDraft?.langCode],
  );

  const handleLanguageSelect = (option: LanguageOption): void => {
    if (isDemo) return;
    setSamlConfigDraft((current) => (current ? { ...current, langCode: option.value } : current));
  };

  const handleSamlConfigFlagChange = (field: 'isEnabled' | 'allowAccountInit') => (): void => {
    if (isDemo) return;
    setSamlConfigDraft((current) => (current ? { ...current, [field]: !current[field] } : current));
  };

  const handleSamlConfigPropertyChange =
    (field: 'idpCert' | 'idpEntityId' | 'idpSsoUrl' | 'formattedValidFor') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      if (isDemo) return;
      const { value } = event.target;
      setSamlConfigDraft((current) => (current ? { ...current, [field]: value } : current));
    };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (isDemo || !samlConfigDraft) return;

    const { allowAccountInit, idpCert, idpEntityId, idpSsoUrl, isEnabled, langCode, formattedValidFor } =
      samlConfigDraft;
    updateSamlConfigMutation.mutate(
      {
        allowAccountInit,
        idpCert,
        idpEntityId,
        idpSsoUrl,
        isEnabled,
        langCode,
        validFor: convertToIsoDuration(formattedValidFor),
      },
      { onSuccess: (data) => setSamlConfigDraft(toSamlConfigDraft(data)) },
    );
  };

  if (!samlConfigDraft) return null;

  const { idpCert, idpSsoUrl, idpEntityId, allowAccountInit, isEnabled, formattedValidFor } = samlConfigDraft;

  return (
    <div className={styles.root}>
      <div className={styles.infoContainer}>
        <h3>{t('team_seatings.authentication.header.saml_integration')}</h3>
        <p className={clsx(styles.maxBottomMargin, styles.infoText)}>
          {t('team_seatings.authentication.description.saml_integration')}
        </p>
      </div>
      <LoadingArea loading={samlConfigQuery.isLoading || updateSamlConfigMutation.isPending}>
        <form
          aria-label={t('team_seatings.authentication.header.saml_integration')}
          className={clsx(styles.ssoForm, styles.maxMarginBottom)}
          onSubmit={handleSubmit}
        >
          <Checkbox
            disabled={isDemo}
            className={styles.maxBottomMargin}
            selected={isEnabled}
            label={t('team_seatings.authentication.checkbox.enable_saml_authentication.label')}
            withStateText
            variant="square"
            onClick={handleSamlConfigFlagChange('isEnabled')}
          />
          <Checkbox
            disabled={isDemo}
            className={styles.maxBottomMargin}
            selected={allowAccountInit}
            label={t('team_seatings.authentication.checkbox.allow_automatic_user_creation.label')}
            withStateText
            infoText={t('team_seatings.authentication.checkbox.allow_automatic_user_creation.info_text')}
            variant="square"
            onClick={handleSamlConfigFlagChange('allowAccountInit')}
          />
          <div className={styles.inputsContainer}>
            <TextArea
              readOnly={isDemo}
              label={t('team_seatings.authentication.text_area.idp_certificate.label')}
              name="certificate"
              infoText={t('team_seatings.authentication.text_area.idp_certificate.info_text')}
              value={idpCert}
              rows={3}
              isLabelBold
              onChange={handleSamlConfigPropertyChange('idpCert')}
            />
            <Input
              readOnly={isDemo}
              label={t('team_seatings.authentication.input.idp_entity_id.label')}
              name="entityId"
              infoText={t('team_seatings.authentication.input.idp_entity_id.info_text')}
              value={idpEntityId}
              isLabelBold
              onChange={handleSamlConfigPropertyChange('idpEntityId')}
            />
            <Input
              readOnly={isDemo}
              label={t('team_seatings.authentication.input.sso_url.label')}
              name="ssoUrl"
              infoText={t('team_seatings.authentication.input.sso_url.info_text')}
              value={idpSsoUrl}
              isLabelBold
              onChange={handleSamlConfigPropertyChange('idpSsoUrl')}
            />

            { }
            <Select
              readOnly={isDemo}
              className={styles.maxWidth}
              items={getLanguageOptions()}
              selectedItem={selectedLanguageOption}
              onSelect={handleLanguageSelect}
              label={t('team_seatings.authentication.select.language_code.label')}
              name="languageCode"
              infoText={t('team_seatings.authentication.select.language_code.info_text')}
              isLabelBold
              size="normal"
            />
            <Input
              readOnly={isDemo}
              label={t('team_seatings.authentication.input.session_valid_time.label')}
              name="sessionValidTime"
              value={formattedValidFor}
              placeholder={t('team_seatings.authentication.input.session_valid_time.placeholder')}
              infoText={t('team_seatings.authentication.input.session_valid_time.info_text')}
              isLabelBold
              onChange={handleSamlConfigPropertyChange('formattedValidFor')}
            />
          </div>
          <Button
            label={t('common.save')}
            variant="contained"
            size="large"
            type="submit"
            loading={updateSamlConfigMutation.isPending}
            disabled={isDemo || updateSamlConfigMutation.isPending}
          />
        </form>
      </LoadingArea>
    </div>
  );
};

export default Authentication;

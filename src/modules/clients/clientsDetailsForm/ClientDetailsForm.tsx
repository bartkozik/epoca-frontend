import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { isDemo } from '@/core/config/demo';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import Confirmation, { ConfirmationAction } from '@/core/theme/confirmation';
import Icon, { icons } from '@/core/theme/icon';
import { Input } from '@/core/theme/inputs';
import Select from '@/core/theme/select';
import colorVariables from '@/core/theme/variables.module.scss';
import { handleValidationErrors, readFromListSearch, showModuleErrorToast } from '@/core/utils/helpers';
import { getClientTypeOptions } from '@/core/utils/options';
import { useAuth } from '@/modules/auth/AuthProvider';
import BackgroundPicker, { BackgroundType } from '@/modules/clients/backgroundPicker';
import { getClientTextureId, resolveClientTexture } from '@/modules/clients/clientBackgroundOptions';
import { useClientsQuery } from '@/modules/clients/hooks/useClientsQuery';
import {
  getToggleClientArchiveToastKey,
  useToggleClientArchiveMutation,
} from '@/modules/clients/hooks/useToggleClientArchiveMutation';
import { useUpdateClientMutation } from '@/modules/clients/hooks/useUpdateClientMutation';
import { ClientFormSchema } from '@/modules/clients/models/clientForm.model';
import { Client, ClientFormErrors, ClientType } from '@/modules/clients/types';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import i18n from 'i18next';
import { clientsPaths } from '../routes';
import styles from './ClientDetailsForm.module.scss';

interface ClientDetailsFormProps {
  client: Client;
}

const ClientDetailsForm = ({ client }: ClientDetailsFormProps): JSX.Element => {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { hasAccess } = auth;
  const clientsQuery = useClientsQuery();
  const updateClientMutation = useUpdateClientMutation();
  const toggleArchiveMutation = useToggleClientArchiveMutation();
  const clients = clientsQuery.data?.results ?? [];

  const { id, name, archived, logo, archivedDate, color, texture, type } = client;

  const [clientName, setClientName] = useState(name);
  const [clientColor, setClientColor] = useState(color || colorVariables.colorClientBlue);
  const [clientTexture, setClientTexture] = useState(resolveClientTexture(texture));
  const [logoURL, setLogoURL] = useState(logo || '');
  const [selectedType, setSelectedType] = useState<ClientType>(type);
  const [isArchiveClientModalOpen, setIsArchiveClientModalOpen] = useState(false);
  const [clientFormErrors, setClientFormErrors] = useState<ClientFormErrors>({});

  const iconDisplayed = useMemo(
    () => (clientFormErrors.clientName ? icons.warn : icons.pencil),
    [clientFormErrors.clientName],
  );

  useEffect(() => {
    setClientName(name);
    setClientColor(color || colorVariables.colorClientBlue);
    setClientTexture(resolveClientTexture(texture));
    setLogoURL(logo || '');
    setSelectedType(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleInputFieldChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof ClientFormErrors): void => {
    const newValue = e.target.value;

    switch (fieldName) {
      case 'clientName':
        setClientName(newValue);
        break;
      case 'logoURL':
        setLogoURL(newValue);
        break;
    }

    if (!clientFormErrors?.[fieldName]) return;
    setClientFormErrors({ ...clientFormErrors, [fieldName]: undefined });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();

    const schema = ClientFormSchema(clients, id);
    const validationResult = schema.safeParse({ clientName, logoURL });

    if (!validationResult.success) {
      setClientFormErrors(handleValidationErrors(validationResult.error));
      return;
    }

    updateClientMutation.mutate(
      {
        clientId: id,
        name: clientName.trim(),
        color: clientColor,
        texture: getClientTextureId(clientTexture),
        logo: logoURL.trim(),
        type: selectedType,
      },
      {
        onSuccess: () => addToast({ content: i18n.t('toast_message.clients.edit_success') }),
        onError: (error) => showModuleErrorToast(error, { default: i18n.t('toast_message.clients.edit_failed') }),
      },
    );
  };

  const handleArchiveFlagChange = (): void => {
    toggleArchiveMutation.mutate(
      { clientId: id, isCurrentlyArchived: archived },
      {
        onSuccess: (_data, { isCurrentlyArchived }) => {
          addToast({ content: i18n.t(getToggleClientArchiveToastKey(isCurrentlyArchived, 'success')) });
          navigate(`${clientsPaths.main}${readFromListSearch(location.state)}`);
        },
        onError: (error, { isCurrentlyArchived }) => {
          showModuleErrorToast(error, {
            default: i18n.t(getToggleClientArchiveToastKey(isCurrentlyArchived, 'failed')),
          });
        },
      },
    );
  };

  const restrictedAccess = !hasAccess(ROLE_PERMISSIONS.Manager);

  const displayClientType = (): JSX.Element => {
    if (archived) {
      return (
        <div className={clsx(styles.clientType, styles.maxBottomMargin)}>
          {`${t('common.type')}: `}
          <span>{type}</span>
        </div>
      );
    }

    return (
      <Select
        transparent
        className={styles.maxBottomMargin}
        label={t('common.type')}
        items={getClientTypeOptions()}
        name="type"
        onSelect={(option) => setSelectedType(option.value)}
        readOnly={restrictedAccess}
        selectedItem={getClientTypeOptions().find(({ value }) => value === selectedType)}
        size="normal"
        isMaxWidth
        infoText={t('clients.clients_details_form.select.type.info_text')}
      />
    );
  };

  const confirmationActions: ConfirmationAction[] = [{ text: t('common.unarchive'), action: handleArchiveFlagChange }];
  const isSubmittingClient = updateClientMutation.isPending || toggleArchiveMutation.isPending;

  return (
    <>
      <form className="details-view" onSubmit={handleSubmit}>
        <Input
          error={clientFormErrors.clientName}
          className={clsx(styles.nameInput, styles.maxWidth)}
          label={t('common.name')}
          name="Client name"
          onChange={(e) => handleInputFieldChange(e, 'clientName')}
          readOnly={archived || restrictedAccess}
          type="text"
          value={clientName}
          icon={archived || restrictedAccess ? undefined : <Icon icon={iconDisplayed} width={14} height={14} />}
        />
        {!archived && (
          <div className={clsx(styles.backgroundPickers, styles.maxWidth)}>
            <BackgroundPicker
              className={styles.maxBottomMargin}
              dataTestId="clientColorSwatch"
              label={t('clients.common.bg_picker.color.label')}
              onBackgroundChange={setClientColor}
              selectedBackground={clientColor}
              infoText={t('clients.common.bg_picker.color.info_text')}
              type={BackgroundType.Color}
              readOnly={restrictedAccess}
            />
            <BackgroundPicker
              className={styles.maxBottomMargin}
              dataTestId="clientTextureSwatch"
              label={t('clients.common.bg_picker.texture.label')}
              onBackgroundChange={setClientTexture}
              selectedBackground={clientTexture}
              infoText={t('clients.common.bg_picker.texture.info_text')}
              type={BackgroundType.Texture}
              isDropdownMobileToLeft
              readOnly={restrictedAccess}
            />
          </div>
        )}
        {displayClientType()}
        {!isDemo && (
          <Input
            className={clsx(styles.logoInput, styles.maxWidth)}
            label={t('clients.common.logo')}
            name="Logo"
            onChange={(e) => handleInputFieldChange(e, 'logoURL')}
            readOnly={archived || restrictedAccess}
            type="text"
            value={logoURL}
            error={clientFormErrors.logoURL}
            infoText={t('clients.common.input.logo_url.info_text')}
          />
        )}

        {archived && (
          <>
            <span className={styles.archived}>Archived at: {archivedDate}</span>
            <Button
              label={t('common.unarchive')}
              size="large"
              variant="contained"
              onClick={() => setIsArchiveClientModalOpen(true)}
              hidden={restrictedAccess}
            />
          </>
        )}
        {!archived && (
          <Button
            className={styles.btn}
            disabled={isSubmittingClient || Boolean(clientFormErrors.clientName) || Boolean(clientFormErrors.logoURL)}
            label={t('common.save')}
            loading={isSubmittingClient}
            size="large"
            type="submit"
            variant="contained"
            hidden={restrictedAccess}
          />
        )}
      </form>

      <Confirmation
        actionType="archive"
        confirmActions={confirmationActions}
        isOpen={isArchiveClientModalOpen}
        onCancel={() => setIsArchiveClientModalOpen(false)}
        text={t('clients.common.confirmation.message.unarchive')}
      />
    </>
  );
};

export default ClientDetailsForm;

import { isDemo } from '@/core/config/demo';
import { useToast } from '@/core/providers/toastProvider';
import Button from '@/core/theme/button';
import FormHeader from '@/core/theme/FormHeader';
import { Input } from '@/core/theme/inputs';
import Select from '@/core/theme/select';
import colorVariables from '@/core/theme/variables.module.scss';
import { MAX_NAME_LENGTH } from '@/core/utils/constants';
import { handleValidationErrors, showModuleErrorToast } from '@/core/utils/helpers';
import { KeyBoardEventType, useFocusOnFirstChildAfterTitle, useKeyDown } from '@/core/utils/hooks';
import { getClientTypeOptions } from '@/core/utils/options';
import BackgroundPicker, { BackgroundType } from '@/modules/clients/backgroundPicker';
import { CLIENT_TEXTURES, getClientTextureId } from '@/modules/clients/clientBackgroundOptions';
import { useClientsQuery } from '@/modules/clients/hooks/useClientsQuery';
import { useCreateClientMutation } from '@/modules/clients/hooks/useCreateClientMutation';
import { ClientFormSchema } from '@/modules/clients/models/clientForm.model';
import { ClientFormErrors, ClientType, RawClient } from '@/modules/clients/types';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';

interface ClientFormProps {
  onCancel: () => void;
  onCreated: (client: RawClient) => void;
}

function ClientForm({ onCancel, onCreated }: ClientFormProps): JSX.Element {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const clientsQuery = useClientsQuery();
  const createClientMutation = useCreateClientMutation();
  const clients = clientsQuery.data?.results ?? [];

  const [clientName, setClientName] = useState('');
  const [clientColor, setClientColor] = useState(colorVariables.colorClientBlue);
  const [clientTexture, setClientTexture] = useState(CLIENT_TEXTURES[0]);
  const [logoURL, setLogoURL] = useState('');
  const [selectedType, setSelectedType] = useState<ClientType>(ClientType.External);

  const formRef = useRef<HTMLFormElement>(null);
  const clientNameInputRef = useRef<HTMLInputElement>(null);
  const clientNameInputWrapperRef = useRef<HTMLDivElement>(null);
  const [clientFormErrors, setClientFormErrors] = useState<ClientFormErrors>({});

  useFocusOnFirstChildAfterTitle({
    childRef: clientNameInputRef,
    wrapperRef: clientNameInputWrapperRef,
    parentRef: formRef,
  });

  const handleInputFieldChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string): void => {
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
    const schema = ClientFormSchema(clients);
    const validationResult = schema.safeParse({ clientName, logoURL });

    if (!validationResult.success) {
      setClientFormErrors(handleValidationErrors(validationResult.error));
      return;
    }

    createClientMutation.mutate(
      {
        name: clientName.trim(),
        color: clientColor,
        texture: getClientTextureId(clientTexture),
        logo: logoURL.trim(),
        type: selectedType,
      },
      {
        onSuccess: (data) => {
          addToast({ content: i18n.t('toast_message.clients.client_added') });
          onCreated(data);
        },
        onError: (error) => showModuleErrorToast(error, { default: i18n.t('toast_message.clients.client_not_added') }),
      },
    );
  };

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ESC,
    action: onCancel,
    isListening: true,
  });

  useKeyDown({
    keyboardEventType: KeyBoardEventType.ENTER,
    action: () => formRef.current?.requestSubmit(),
    isListening: true,
    options: { ctrlKey: true },
  });

  return (
    <form className="form" onSubmit={handleSubmit} ref={formRef}>
      <FormHeader title={t('clients.client_form.header.add_new_client')} />
      <Input
        error={clientFormErrors.clientName}
        helperText={t('clients.client_form.input.client_name.helper_text', { number: MAX_NAME_LENGTH })}
        label={t('clients.client_form.input.client_name.label')}
        name="Client name"
        onChange={(e) => handleInputFieldChange(e, 'clientName')}
        type="text"
        value={clientName}
        ref={clientNameInputRef}
        inputWrapperRef={clientNameInputWrapperRef}
      />
      <BackgroundPicker
        label={t('clients.common.bg_picker.color.label')}
        onBackgroundChange={setClientColor}
        selectedBackground={clientColor}
        infoText={t('clients.common.bg_picker.color.info_text')}
        whiteBackground
        type={BackgroundType.Color}
      />

      <BackgroundPicker
        label={t('clients.common.bg_picker.texture.label')}
        onBackgroundChange={setClientTexture}
        selectedBackground={clientTexture}
        infoText={t('clients.common.bg_picker.texture.info_text')}
        whiteBackground
        type={BackgroundType.Texture}
      />
      <Select
        transparent
        label={t('common.type')}
        items={getClientTypeOptions()}
        name="type"
        onSelect={(option) => setSelectedType(option.value)}
        selectedItem={getClientTypeOptions().find(({ value }) => value === selectedType)}
        size="normal"
        infoText={t('clients.client_form.select.type.info_text')}
      />
      {!isDemo && (
        <Input
          label={t('clients.client_form.input.logo_url.label')}
          name="Logo URL"
          onChange={(e) => handleInputFieldChange(e, 'logoURL')}
          type="text"
          value={logoURL}
          error={clientFormErrors.logoURL}
          infoText={t('clients.common.input.logo_url.info_text')}
        />
      )}
      <div>
        <Button label={t('common.cancel')} onClick={onCancel} variant="text" />
        <Button
          disabled={
            !clientName ||
            createClientMutation.isPending ||
            Boolean(clientFormErrors.clientName) ||
            Boolean(clientFormErrors.logoURL)
          }
          label={t('common.save')}
          loading={createClientMutation.isPending}
          type="submit"
          variant="contained"
        />
      </div>
    </form>
  );
}

export default ClientForm;

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyDto } from '@vippi/shared';
import { CircleCheck, Copy, Eye, EyeOff, Info, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { copyTextFrom, errorMessage } from '@/shared/lib';
import { Alert, Code, ConfirmDialog, Dialog, IconButton } from '@/shared/ui';
import { apiKeysQueryKey, maskApiKey, revealApiKey, rotateApiKey } from '../model/api-keys';

/** Masked key with reveal / copy / rotate. Mount with `key={apiKey.id}` so state resets per key. */
export function ApiKeyDialog({ apiKey, onClose }: { apiKey: ApiKeyDto; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [current, setCurrent] = useState(apiKey);
  const [secret, setSecret] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const loadSecret = async (): Promise<string> => {
    if (secret) return secret;
    const key = await revealApiKey(current.id);
    setSecret(key);
    return key;
  };
  const reveal = useMutation({ mutationFn: loadSecret, onSuccess: () => setVisible(true), onError: (e) => toast.error(errorMessage(e, t)) });
  const rotate = useMutation({
    mutationFn: () => rotateApiKey(current.id),
    onSuccess: (created) => {
      setConfirmRotate(false);
      setCurrent(created);
      setSecret(created.key);
      setVisible(true);
      setRotated(true);
      void qc.invalidateQueries({ queryKey: apiKeysQueryKey });
    },
    onError: (e) => {
      setConfirmRotate(false);
      toast.error(errorMessage(e, t));
    },
  });
  const copy = async () => {
    try {
      const ok = await copyTextFrom(loadSecret);
      if (ok) toast.success(t('apiKeys.copied'));
      else toast.error(t('common.copyFailed'));
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  };

  const legacy = !current.revealable;
  return (
    <>
      <Dialog open onOpenChange={(v) => (v ? undefined : onClose())} title={current.name} description={t('apiKeys.dialogHint')} hideCloseButton>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Code>
                <span data-testid="api-key-display">{visible && secret ? secret : maskApiKey(current)}</span>
              </Code>
            </div>
            <IconButton
              icon={visible ? EyeOff : Eye}
              label={visible ? t('apiKeys.hide') : t('apiKeys.show')}
              tooltip={legacy ? t('apiKeys.legacyCopy') : undefined}
              disabled={legacy}
              loading={reveal.isPending}
              onClick={() => (visible ? setVisible(false) : reveal.mutate())}
            />
          </div>
          {rotated ? (
            <Alert tone="success" icon={<CircleCheck aria-hidden />}>
              {t('apiKeys.rotated')}
            </Alert>
          ) : null}
          {legacy ? (
            <Alert tone="info" icon={<Info aria-hidden />}>
              {t('apiKeys.legacy')}
            </Alert>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <IconButton icon={RefreshCw} label={t('apiKeys.rotate')} loading={rotate.isPending} onClick={() => setConfirmRotate(true)} />
            <div className="flex items-center gap-2">
              <IconButton
                icon={Copy}
                label={t('apiKeys.copy')}
                tooltip={legacy ? t('apiKeys.legacyCopy') : undefined}
                disabled={legacy}
                onClick={() => void copy()}
              />
              <IconButton icon={X} label={t('common.close')} onClick={onClose} />
            </div>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title={t('apiKeys.rotateTitle', { name: current.name })}
        description={t('apiKeys.rotateText')}
        confirmLabel={t('apiKeys.rotateConfirm')}
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </>
  );
}

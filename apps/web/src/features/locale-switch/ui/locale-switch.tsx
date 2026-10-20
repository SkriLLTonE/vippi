import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Locale, MeResponse } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import { sessionKeys } from '@/entities/session';
import { toast } from 'sonner';
import { apiRequest } from '@/shared/api';
import { applyLocale } from '@/shared/i18n';
import { errorMessage } from '@/shared/lib';
import { Segmented } from '@/shared/ui';

const OPTIONS = [
  { value: 'ru', label: 'RU' },
  { value: 'uz', label: 'UZ' },
] as const;

/** RU/UZ switch; for signed-in users the choice is saved to the profile (FR-080). */
export function LocaleSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (locale: Locale) => apiRequest<unknown>('/me', { method: 'PATCH', body: { locale } }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const value: Locale = i18n.language === 'uz' ? 'uz' : 'ru';
  return (
    <Segmented<Locale>
      className={className}
      label={t('profile.language')}
      value={value}
      options={OPTIONS}
      onChange={(locale) => {
        applyLocale(locale);
        const me = qc.getQueryData<MeResponse | null>(sessionKeys.me);
        if (me) {
          qc.setQueryData<MeResponse>(sessionKeys.me, { ...me, user: { ...me.user, locale } });
          save.mutate(locale);
        }
      }}
    />
  );
}

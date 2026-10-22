import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrganizationDto, UpdateOrganizationRequest } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { aiKeys } from '@/entities/ai-insight';
import { sessionKeys } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';

export const organizationKey = ['organization'] as const;

export function useUpdateOrg() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOrganizationRequest) =>
      apiRequest<OrganizationDto>('/organization', { method: 'PATCH', body }),
    onSuccess: (org) => {
      qc.setQueryData(organizationKey, org);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      void qc.invalidateQueries({ queryKey: aiKeys.status });
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

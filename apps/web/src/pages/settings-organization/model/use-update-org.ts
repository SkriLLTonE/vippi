import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApplyIndustryTemplateRequest,
  ApplyIndustryTemplateResponse,
  OrganizationDto,
  UpdateOrganizationRequest,
} from '@vippi/shared';
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

/** ADR-025: switch industry and merge its template fields/labels. */
export function useApplyIndustryTemplate() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyIndustryTemplateRequest) =>
      apiRequest<ApplyIndustryTemplateResponse>('/organization/industry-template', { method: 'POST', body }),
    onSuccess: (res) => {
      qc.setQueryData(organizationKey, res.organization);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      toast.success(t('industry.applied', { n: res.addedFields.length }));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

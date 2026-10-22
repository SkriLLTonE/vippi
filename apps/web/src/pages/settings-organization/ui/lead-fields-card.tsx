import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LEAD_FIELD_LABEL_MAX,
  LEAD_FIELD_TYPES,
  LeadFieldDefSchema,
  MAX_LEAD_FIELDS,
  MAX_LEAD_FIELD_OPTIONS,
  UpdateLeadFieldSchema,
  localizedLabel,
  type LeadFieldDef,
  type LeadFieldType,
} from '@vippi/shared';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { sessionKeys, useSession } from '@/entities/session';
import { apiRequest, isApiError } from '@/shared/api';
import { errorMessage, validationMessage } from '@/shared/lib';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  Field,
  FormAlert,
  Input,
  NativeSelect,
  Switch,
} from '@/shared/ui';

interface OptionDraft {
  value: string;
  ru: string;
  uz: string;
}

interface FieldDraft {
  key: string;
  ru: string;
  uz: string;
  type: LeadFieldType;
  required: boolean;
  showInCreate: boolean;
  options: OptionDraft[];
}

type DraftErrors = Partial<Record<'key' | 'label' | 'options', string>>;

const trimmed = (ru: string, uz: string) => ({ ...(ru.trim() ? { ru: ru.trim() } : {}), ...(uz.trim() ? { uz: uz.trim() } : {}) });

function nextKey(prefix: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (k) => k.toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

function emptyDraft(existing: readonly LeadFieldDef[]): FieldDraft {
  return {
    key: nextKey('field', existing.map((f) => f.key)),
    ru: '',
    uz: '',
    type: 'text',
    required: false,
    showInCreate: true,
    options: [],
  };
}

function toDraft(def: LeadFieldDef): FieldDraft {
  return {
    key: def.key,
    ru: def.label.ru ?? '',
    uz: def.label.uz ?? '',
    type: def.type,
    required: def.required,
    showInCreate: def.showInCreate,
    options: (def.options ?? []).map((o) => ({ value: o.value, ru: o.label.ru ?? '', uz: o.label.uz ?? '' })),
  };
}

/** Option values are generated once and never change, so stored lead values stay valid when labels are edited. */
function draftToRequest(d: FieldDraft) {
  const options =
    d.type === 'single_select'
      ? d.options.filter((o) => o.ru.trim() || o.uz.trim()).map((o) => ({ value: o.value, label: trimmed(o.ru, o.uz) }))
      : undefined;
  return {
    key: d.key.trim(),
    label: trimmed(d.ru, d.uz),
    type: d.type,
    required: d.required,
    showInCreate: d.showInCreate,
    ...(options ? { options } : {}),
  };
}

function issuesToErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): DraftErrors {
  const errors: DraftErrors = {};
  for (const issue of issues) {
    const head = String(issue.path[0] ?? '');
    const target = head === 'key' || head === 'label' || head === 'options' ? head : null;
    if (target && !errors[target]) errors[target] = issue.message;
  }
  return errors;
}

function FieldEditor({
  initial,
  editingKey,
  onDone,
}: {
  initial: FieldDraft;
  /** Set when editing: key and type are immutable (ADR-024). */
  editingKey: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<FieldDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const set = (patch: Partial<FieldDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const save = useMutation({
    mutationFn: (body: unknown) =>
      editingKey
        ? apiRequest<LeadFieldDef[]>(`/lead-fields/${editingKey}`, { method: 'PATCH', body })
        : apiRequest<LeadFieldDef[]>('/lead-fields', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      toast.success(t('common.saved'));
      onDone();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'CONFLICT') setErrors({ key: 'key_taken' });
    },
  });

  const submit = () => {
    const request = draftToRequest(draft);
    if (editingKey) {
      const { key: _key, type: _type, ...patch } = request;
      const r = UpdateLeadFieldSchema.safeParse(patch);
      if (!r.success) return setErrors(issuesToErrors(r.error.issues));
      setErrors({});
      save.mutate(r.data);
    } else {
      const r = LeadFieldDefSchema.safeParse(request);
      if (!r.success) return setErrors(issuesToErrors(r.error.issues));
      setErrors({});
      save.mutate(r.data);
    }
  };

  const err = (name: keyof DraftErrors) => (errors[name] ? validationMessage(errors[name], undefined, t) : undefined);
  const generalError =
    save.error && !(isApiError(save.error) && save.error.code === 'CONFLICT') ? errorMessage(save.error, t) : null;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormAlert>{generalError}</FormAlert>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t('leadFields.labelRu')} error={err('label')}>
          {(c) => <Input {...c} maxLength={LEAD_FIELD_LABEL_MAX} value={draft.ru} onChange={(e) => set({ ru: e.target.value })} />}
        </Field>
        <Field label={t('leadFields.labelUz')}>
          {(c) => <Input {...c} maxLength={LEAD_FIELD_LABEL_MAX} value={draft.uz} onChange={(e) => set({ uz: e.target.value })} />}
        </Field>
        <Field label={t('leadFields.type')} hint={editingKey ? t('leadFields.immutableHint') : undefined}>
          {(c) => (
            <NativeSelect
              {...c}
              disabled={Boolean(editingKey)}
              value={draft.type}
              onChange={(e) => {
                const type = e.target.value as LeadFieldType;
                set({ type, options: type === 'single_select' && draft.options.length === 0 ? [{ value: 'o1', ru: '', uz: '' }] : draft.options });
              }}
            >
              {LEAD_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`leadFields.types.${type}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('leadFields.key')} hint={t('leadFields.keyHint')} error={err('key')}>
          {(c) => (
            <Input
              {...c}
              readOnly={Boolean(editingKey)}
              autoComplete="off"
              maxLength={32}
              value={draft.key}
              onChange={(e) => set({ key: e.target.value })}
            />
          )}
        </Field>
      </div>
      {draft.type === 'single_select' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('leadFields.options')}</legend>
          {draft.options.map((o, i) => (
            <div key={o.value} className="flex items-center gap-2">
              <Input
                aria-label={t('leadFields.optionRu', { n: i + 1 })}
                maxLength={LEAD_FIELD_LABEL_MAX}
                placeholder="RU"
                value={o.ru}
                onChange={(e) => set({ options: draft.options.map((x) => (x.value === o.value ? { ...x, ru: e.target.value } : x)) })}
              />
              <Input
                aria-label={t('leadFields.optionUz', { n: i + 1 })}
                maxLength={LEAD_FIELD_LABEL_MAX}
                placeholder="UZ"
                value={o.uz}
                onChange={(e) => set({ options: draft.options.map((x) => (x.value === o.value ? { ...x, uz: e.target.value } : x)) })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('leadFields.removeOption', { n: i + 1 })}
                disabled={draft.options.length <= 1}
                onClick={() => set({ options: draft.options.filter((x) => x.value !== o.value) })}
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
          {errors.options ? (
            <p className="text-xs text-danger" role="alert">
              {err('options')}
            </p>
          ) : null}
          {draft.options.length < MAX_LEAD_FIELD_OPTIONS ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                set({ options: [...draft.options, { value: nextKey('o', draft.options.map((x) => x.value)), ru: '', uz: '' }] })
              }
            >
              <Plus aria-hidden />
              {t('leadFields.addOption')}
            </Button>
          ) : null}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="lead-field-required" className="text-sm">
            {t('leadFields.required')}
          </label>
          <Switch id="lead-field-required" checked={draft.required} onCheckedChange={(v) => set({ required: v })} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="lead-field-show" className="text-sm">
            {t('leadFields.showInCreate')}
          </label>
          <Switch id="lead-field-show" checked={draft.showInCreate} onCheckedChange={(v) => set({ showInCreate: v })} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 md:flex-row md:justify-end">
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} loadingText={t('common.saving')}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

/** ADR-024: up to 8 organization-defined lead fields; removing a field hides stored values. */
export function LeadFieldsCard({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'uz' ? 'uz' : 'ru';
  const qc = useQueryClient();
  const fields = useSession().organization.leadFields;
  const [editing, setEditing] = useState<{ draft: FieldDraft; key: string | null } | null>(null);
  const [removing, setRemoving] = useState<LeadFieldDef | null>(null);
  const remove = useMutation({
    mutationFn: (key: string) => apiRequest<null>(`/lead-fields/${key}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
      toast.success(t('leadFields.removed'));
      setRemoving(null);
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const label = (def: LeadFieldDef) => localizedLabel(def.label, locale) ?? def.key;

  return (
    <Card data-testid="lead-fields-settings" className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t('leadFields.title')}</CardTitle>
        <CardDescription>{t('leadFields.description', { max: MAX_LEAD_FIELDS })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('leadFields.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {fields.map((def) => (
              <li key={def.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{label(def)}</span>
                  <Badge className="bg-background-subtle text-muted-foreground">{t(`leadFields.types.${def.type}`)}</Badge>
                  {def.required ? <Badge className="bg-warning-bg text-warning">{t('leadFields.requiredBadge')}</Badge> : null}
                  {!def.showInCreate ? (
                    <Badge className="bg-background-subtle text-muted-foreground">{t('leadFields.hiddenInCreate')}</Badge>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('leadFields.edit', { name: label(def) })}
                      onClick={() => setEditing({ draft: toDraft(def), key: def.key })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('leadFields.remove', { name: label(def) })}
                      onClick={() => setRemoving(def)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <Button
            variant="outline"
            className="self-start"
            disabled={fields.length >= MAX_LEAD_FIELDS}
            onClick={() => setEditing({ draft: emptyDraft(fields), key: null })}
          >
            <Plus aria-hidden />
            {t('leadFields.add')}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('org.viewOnly')}</p>
        )}
      </CardContent>
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => (v ? undefined : setEditing(null))}
        title={editing?.key ? t('leadFields.editTitle') : t('leadFields.addTitle')}
        size="lg"
      >
        {editing ? <FieldEditor initial={editing.draft} editingKey={editing.key} onDone={() => setEditing(null)} /> : null}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(v) => (v ? undefined : setRemoving(null))}
        title={t('leadFields.removeTitle', { name: removing ? label(removing) : '' })}
        description={t('leadFields.removeText')}
        confirmLabel={t('leadFields.removeAction')}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.key)}
      />
    </Card>
  );
}

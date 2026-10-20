import { Lock, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from './button';

function StatusScreen({ icon: Icon, code, title, text }: { icon: typeof Lock; code: string; title: string; text: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Icon className="size-10 text-subtle-foreground" aria-hidden />
      <p className="text-sm font-medium text-subtle-foreground tabular">{code}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      <Button asChild className="mt-2">
        <Link to="/">{t('common.toHome')}</Link>
      </Button>
    </div>
  );
}

export function ForbiddenState() {
  const { t } = useTranslation();
  return <StatusScreen icon={Lock} code="403" title={t('state.forbidden')} text={t('state.forbiddenText')} />;
}

export function NotFoundState({ title }: { title?: string }) {
  const { t } = useTranslation();
  return <StatusScreen icon={SearchX} code="404" title={title ?? t('state.notFound')} text={t('state.notFoundText')} />;
}

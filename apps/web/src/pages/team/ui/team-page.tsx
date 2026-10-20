import { useTranslation } from 'react-i18next';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui';
import { InvitationsTab, InviteButton } from './invitations';
import { MembersTab } from './members';

export function TeamPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.team')} actions={<InviteButton />} />
      <Tabs defaultValue="members">
        <TabsList label={t('nav.team')}>
          <TabsTrigger value="members">{t('team.members')}</TabsTrigger>
          <TabsTrigger value="invitations">{t('team.invitations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

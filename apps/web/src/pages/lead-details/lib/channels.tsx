import { CONTACT_CHANNELS, type ContactChannel } from '@vippi/shared';
import { Camera, CircleHelp, Mail, MessageCircle, MessageSquare, Phone, Send, type LucideIcon } from 'lucide-react';

const ICONS: Record<ContactChannel, LucideIcon> = {
  CALL: Phone,
  TELEGRAM: Send,
  INSTAGRAM: Camera,
  WHATSAPP: MessageCircle,
  SMS: MessageSquare,
  EMAIL: Mail,
  OTHER: CircleHelp,
};

export function channelOptions(t: (k: string) => string) {
  return CONTACT_CHANNELS.map((c) => {
    const Icon = ICONS[c];
    return { value: c, label: t(`lead.channel.${c}`), icon: <Icon aria-hidden /> };
  });
}

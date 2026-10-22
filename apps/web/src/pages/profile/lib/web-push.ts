import type { PushSubscriptionRequest } from '@vippi/shared';

const SW_URL = '/sw.js';

export class PushPermissionDeniedError extends Error {
  constructor() {
    super('Notification permission denied');
    this.name = 'PushPermissionDeniedError';
  }
}

/** Web Push needs a secure context (https or localhost), a service worker and the Push API. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission {
  return isPushSupported() ? Notification.permission : 'default';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const view = new Uint8Array(a);
  return view.every((x, i) => x === b[i]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission, registers /sw.js and returns the subscription to store on the server. */
export async function subscribePush(vapidPublicKey: string): Promise<PushSubscriptionRequest> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushPermissionDeniedError();
  await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  const reg = await navigator.serviceWorker.ready;
  const key = base64UrlToBytes(vapidPublicKey);
  const existing = await reg.pushManager.getSubscription();
  // A subscription made with an old server key can no longer be used.
  if (existing && !sameKey(existing.options.applicationServerKey, key)) await existing.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } };
}

/** Removes the browser subscription; returns its endpoint so the server copy can be deleted too. */
export async function unsubscribePush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

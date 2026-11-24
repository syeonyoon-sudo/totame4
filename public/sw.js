// 또타미 서비스 워커 — 시스템 알림 표시 + (서버 연동 시) Web Push 수신
// 오프라인 캐시는 사용하지 않습니다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// 서버(Web Push · VAPID)가 보낸 예약 알림 — 앱이 닫혀 있어도 표시됩니다.
// 현재 저장소에는 푸시 발송 서버가 포함되어 있지 않습니다(README '알림 지원 범위' 참고).
self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { title: e.data ? e.data.text() : '또타미' }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || '또타미', {
      body: data.body,
      tag: data.tag || 'totame',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/today' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/move'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url).catch(() => {})
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

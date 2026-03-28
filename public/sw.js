// Service Worker for Push Notifications - TradeDesk Forex Daily Plan

self.addEventListener('push', function (event) {
    const data = event.data ? event.data.json() : {}

    const options = {
        body: data.body || 'Check your daily trading plan',
        icon: '/logo.png',
        badge: '/logo.png',
        data: { url: data.url || '/daily-plan' },
        tag: data.tag || 'daily-plan',
        requireInteraction: data.requireInteraction || false,
        actions: [
            { action: 'open', title: 'Open Plan' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'TradeDesk Forex', options)
    )
})

self.addEventListener('notificationclick', function (event) {
    event.notification.close()

    if (event.action === 'dismiss') return

    const url = event.notification.data?.url || '/daily-plan'

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Focus existing window if available
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i]
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus()
                    client.navigate(url)
                    return
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(url)
            }
        })
    )
})

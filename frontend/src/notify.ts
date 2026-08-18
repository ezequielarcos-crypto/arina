import type { Item } from "./types";

// Alerta de stock bajo vía Notification API (el navegador la muestra como
// notificación del sistema operativo). Una sola alerta por item hasta que
// el stock se recupere por encima del mínimo.
const alerted = new Set<number>();

export function notificationsSupported() {
  return "Notification" in window;
}

export function notificationsEnabled() {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function checkLowStock(items: Item[]) {
  if (!notificationsEnabled()) return;
  for (const item of items) {
    const low = item.active && item.trackStock && item.stock <= item.minStock;
    if (low && !alerted.has(item.id)) {
      alerted.add(item.id);
      new Notification(
        item.stock <= 0 ? `Sin stock: ${item.name}` : `Stock bajo: ${item.name}`,
        {
          body: `Quedan ${item.stock} ${item.unit} (mínimo: ${item.minStock})`,
          icon: "/pwa-192.png",
          tag: `low-stock-${item.id}`,
        }
      );
    }
    if (!low) alerted.delete(item.id);
  }
}

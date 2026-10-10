let notificationFunction = null;

export function registerNotification(fn) {
  notificationFunction = fn;
}

export function notify(message, type = "success") {
  if (notificationFunction) {
    notificationFunction(message, type);
  } else {
    console.warn("Notification system is not ready:", message);
  }
}
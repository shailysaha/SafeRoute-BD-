// src/utils/notifications.js

export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications.");
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
};

export const sendPushNotification = (title, body, icon) => {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(title, {
      body: body,
      icon: icon || "/favicon.ico",
      tag: "family-chat",
      requireInteraction: true,
    });
  } catch (error) {
    console.error("Notification error:", error);
  }
};

export const notifyNewMessage = (senderName, message, groupName) => {
  sendPushNotification(
    `💬 ${groupName || "Family Chat"}`,
    `${senderName}: ${message.substring(0, 60)}${message.length > 60 ? "..." : ""}`
  );
};
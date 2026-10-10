import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  registerNotification,
} from "../utils/notify";

import "./Notification.css";

const NotificationContext =
  createContext();

export function NotificationProvider({
  children,
}) {
  const [notification, setNotification] =
    useState(null);

  const notify = (
    message,
    type = "success"
  ) => {
    setNotification({
      message,
      type,
    });

    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  useEffect(() => {
    registerNotification(notify);

    return () => {
      registerNotification(null);
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{ notify }}
    >
      {children}

      {notification && (
        <div
          className={`global-notification ${notification.type}`}
        >
          <span>
            {notification.type ===
            "success"
              ? "✓"
              : "⚠️"}
          </span>

          <span>
            {notification.message}
          </span>
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(
    NotificationContext
  );
}
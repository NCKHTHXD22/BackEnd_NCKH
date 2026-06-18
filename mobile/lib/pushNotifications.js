import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Cấu hình cách nhận thông báo khi app đang chạy (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Gửi thông báo OS ngay lập tức (hiển thị kể cả khi app ở background/closed)
export async function scheduleFloodAlert(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null, // null = fire immediately
    });
  } catch (e) {
    console.warn('scheduleFloodAlert error:', e.message);
  }
}

// Đặt lịch thông báo thử nghiệm sau `delaySeconds` giây (mặc định 10s)
// Mục đích: user thoát app rồi xem thông báo xuất hiện trên thanh trạng thái
export async function scheduleTestNotification(delaySeconds = 10) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚨 AKTA-FLT — Thử nghiệm cảnh báo',
        body: 'Hệ thống cảnh báo lũ lụt đang hoạt động. Thoát app và xem thông báo này!',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delaySeconds,
      },
    });
    console.log(`[Notification] Test notification scheduled in ${delaySeconds}s`);
  } catch (e) {
    console.warn('scheduleTestNotification error:', e.message);
  }
}

// Hàm đăng ký lấy Expo Push Token
export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    // Project ID required for Expo SDK 49+
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;
      
    try {
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: projectId || "akta-flt-nckh", // Dự phòng nếu chưa thiết lập eas
      })).data;
      console.log('Push Token:', token);
    } catch (e) {
      console.log("Error getting push token:", e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

    // Lắng nghe thông báo khi app đang chạy
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Lắng nghe khi người dùng bấm vào thông báo
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log("User tapped on notification:", response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  return { expoPushToken, notification };
}

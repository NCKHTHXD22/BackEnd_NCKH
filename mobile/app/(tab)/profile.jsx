import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';

import styles from '../../assets/styles/profile';
import { COLORS } from '../../constants/colors.js';
import { API_URL } from '../../lib/env';
import { getPushEnabled, setPushEnabled as persistPushEnabled } from '../../lib/notificationPrefs';
import { registerForPushNotificationsAsync } from '../../lib/pushNotifications';
import {
  RADIUS_OPTIONS_KM, LEVEL_OPTIONS_CM,
  getAlertRadiusKm, setAlertRadiusKm,
  getAlertLevelCm, setAlertLevelCm,
} from '../../lib/alertPrefs';
import { setAppLanguage } from '../../lib/i18n';

const ProfileScreen = () => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { signOut, getToken } = useAuth(); // ✅ Đăng xuất từ useAuth
  const { user, isLoaded } = useUser();
  const [pushNotification, setPushNotification] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [alertRadiusKm, setAlertRadiusKmState] = useState(0.3);
  const [alertLevelCm, setAlertLevelCmState] = useState(30);

  // Nạp ngưỡng cảnh báo cá nhân đã lưu (mặc định 300m/30cm nếu chưa từng chỉnh)
  useEffect(() => {
    getAlertRadiusKm().then(setAlertRadiusKmState);
    getAlertLevelCm().then(setAlertLevelCmState);
  }, []);

  // Đồng bộ ngưỡng lên server (không chỉ lưu cục bộ) — để proximityAlert.job.js
  // dùng đúng lựa chọn của người dùng khi cảnh báo lúc app đang đóng/nền.
  const syncAlertPrefsToServer = async (patch) => {
    try {
      const authToken = await getToken();
      await fetch(`${API_URL}/api/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      console.warn("Không đồng bộ được ngưỡng cảnh báo lên server:", e.message);
    }
  };

  const chooseRadius = async (km) => {
    setAlertRadiusKmState(km);
    await setAlertRadiusKm(km);
    syncAlertPrefsToServer({ alertRadiusKm: km });
  };
  const chooseLevel = async (cm) => {
    setAlertLevelCmState(cm);
    await setAlertLevelCm(cm);
    syncAlertPrefsToServer({ alertLevelCm: cm });
  };

  // Nạp đúng trạng thái đã lưu — trước đây luôn mặc định "true" dù người
  // dùng đã tắt ở phiên trước, không phản ánh thực tế.
  useEffect(() => {
    getPushEnabled().then(setPushNotification);
  }, []);

  const handleTogglePush = async (value) => {
    setPushNotification(value);
    setPushBusy(true);
    try {
      await persistPushEnabled(value);
      const authToken = await getToken();
      if (value) {
        // Bật lại: đăng ký token mới và đồng bộ lên server
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await fetch(`${API_URL}/api/users/push-token`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ token }),
          });
        }
      } else {
        // Tắt: xoá token trên server ngay — không chỉ ẩn ở UI như trước.
        await fetch(`${API_URL}/api/users/push-token`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token: null }),
        });
      }
    } catch (e) {
      console.error('Lỗi khi cập nhật push notification:', e);
      Alert.alert(t('common.error'), t('profile.pushUpdateError'));
      setPushNotification(!value); // rollback UI nếu lỗi
    } finally {
      setPushBusy(false);
    }
  };

  if (!isLoaded) return null;

  //const fullName = user?.fullName || 'Unnamed';
  const email = user?.emailAddresses?.[0]?.emailAddress || 'No email';
  const avatar = user?.imageUrl || 'https://i.imgur.com/LOK4SXd.png';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.profileTitle}>{t('profile.title')}</Text>

      <Image
        source={{ uri: avatar }}
        style={styles.avatar}
        contentFit="cover"
        transition={500}
      />

      <Text style={styles.email}>{email}</Text>

      <TouchableOpacity
        style={styles.editButton}
        onPress={() => Alert.alert(t('common.comingSoon'), t('profile.editSoon'))}
      >
        <Text style={styles.editButtonText}>{t('profile.editProfile')}</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <SwitchItem
          icon="notifications-outline"
          title={t('profile.pushTitle')}
          subtitle={pushNotification ? t('profile.pushOn') : t('profile.pushOff')}
          value={pushNotification}
          onValueChange={handleTogglePush}
          disabled={pushBusy}
        />
        <SwitchItem
          icon="chatbubble-outline"
          title={t('profile.smsTitle')}
          subtitle={t('common.comingSoon')}
          value={false}
          onValueChange={() => Alert.alert(t('common.comingSoon'), t('profile.smsSoon'))}
          disabled
        />
      </View>

      <View style={styles.section}>
        <Text style={prefStyles.sectionTitle}>{t('profile.alertPrefsTitle')}</Text>

        <Text style={prefStyles.label}>{t('profile.radiusLabel')}</Text>
        <View style={prefStyles.chipRow}>
          {RADIUS_OPTIONS_KM.map((km) => (
            <TouchableOpacity
              key={km}
              onPress={() => chooseRadius(km)}
              style={[prefStyles.chip, alertRadiusKm === km && prefStyles.chipActive]}
            >
              <Text style={[prefStyles.chipText, alertRadiusKm === km && prefStyles.chipTextActive]}>
                {km < 1 ? `${km * 1000}m` : `${km}km`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={prefStyles.label}>{t('profile.levelLabel')}</Text>
        <View style={prefStyles.chipRow}>
          {LEVEL_OPTIONS_CM.map((cm) => (
            <TouchableOpacity
              key={cm}
              onPress={() => chooseLevel(cm)}
              style={[prefStyles.chip, alertLevelCm === cm && prefStyles.chipActive]}
            >
              <Text style={[prefStyles.chipText, alertLevelCm === cm && prefStyles.chipTextActive]}>{cm}cm</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={prefStyles.sectionTitle}>{t('profile.languageTitle')}</Text>
        <View style={prefStyles.chipRow}>
          <TouchableOpacity
            onPress={() => setAppLanguage('vi')}
            style={[prefStyles.chip, i18n.language === 'vi' && prefStyles.chipActive]}
          >
            <Text style={[prefStyles.chipText, i18n.language === 'vi' && prefStyles.chipTextActive]}>
              {t('profile.languageVi')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAppLanguage('en')}
            style={[prefStyles.chip, i18n.language === 'en' && prefStyles.chipActive]}
          >
            <Text style={[prefStyles.chipText, i18n.language === 'en' && prefStyles.chipTextActive]}>
              {t('profile.languageEn')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={async () => {
          try {
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch (error) {
            console.error('Logout failed:', error);
          }
        }}
      >
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const SwitchItem = ({ icon, title, subtitle, value, onValueChange, disabled }) => (
  <View style={[styles.item, disabled && { opacity: 0.6 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={icon} size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: '#ccc', true: COLORS.primary }}
      thumbColor="#fff"
    />
  </View>
);

const prefStyles = StyleSheet.create({
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', paddingHorizontal: 16, paddingTop: 14 },
  label: { fontSize: 12, color: '#6B7280', paddingHorizontal: 16, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
});

export default ProfileScreen;

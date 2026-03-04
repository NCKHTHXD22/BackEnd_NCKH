import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser, useAuth } from '@clerk/clerk-expo';

import styles from '../../assets/styles/profile';
import { COLORS } from '../../constants/colors.js';

const ProfileScreen = () => {
  const router = useRouter();
  const { signOut } = useAuth(); // ✅ Đăng xuất từ useAuth
  const { user, isLoaded } = useUser();
  const [pushNotification, setPushNotification] = useState(true);
  const [smsNotification, setSmsNotification] = useState(false);

  if (!isLoaded) return null;

  //const fullName = user?.fullName || 'Unnamed';
  const email = user?.emailAddresses?.[0]?.emailAddress || 'No email';
  const avatar = user?.imageUrl || 'https://i.imgur.com/LOK4SXd.png';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.profileTitle}>Profile</Text>

      <Image
        source={{ uri: avatar }}
        style={styles.avatar}
        contentFit="cover"
        transition={500}
      />

      <Text style={styles.email}>{email}</Text>

      <TouchableOpacity style={styles.editButton}>
        <Text style={styles.editButtonText}>Edit Profile</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Option icon="reader-outline" title="Order Selection" subtitle="Order Information" />
        <Option icon="location-outline" title="Delivery Address" subtitle="Your Delivery Location" />
        <Option icon="card-outline" title="Payment Delivery" subtitle="Pay your Bill" />
      </View>

      <View style={styles.section}>
        <SwitchItem
          icon="notifications-outline"
          title="Push Notification"
          subtitle="You will Receive Daily Updates"
          value={pushNotification}
          onValueChange={setPushNotification}
        />
        <SwitchItem
          icon="chatbubble-outline"
          title="SMS Notification"
          subtitle="Notification in App"
          value={smsNotification}
          onValueChange={setSmsNotification}
        />
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={async () => {
          try {
            await signOut(); // ✅ Đăng xuất an toàn
            router.replace('../../(auth)/sign-in'); // Điều hướng về màn hình đăng nhập
          } catch (error) {
            console.error('Logout failed:', error);
          }
        }}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const Option = ({ icon, title, subtitle }) => (
  <View style={styles.item}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Ionicons name={icon} size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
      <View>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
    </View>
    <Ionicons name="chevron-forward-outline" size={20} color="#ccc" />
  </View>
);

const SwitchItem = ({ icon, title, subtitle, value, onValueChange }) => (
  <View style={styles.item}>
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
      trackColor={{ false: '#ccc', true: COLORS.primary }}
      thumbColor="#fff"
    />
  </View>
);

export default ProfileScreen;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getInboxData } from '../firebase/firestoreService';

const SEEDED_INBOX = {
  notifications: [
    {
      id: 'seed-notification-1',
      title: 'Weekly style recap',
      preview: 'Three new recommendations are ready for you.',
      timeLabel: 'Today',
    },
    {
      id: 'seed-notification-2',
      title: 'Closet sync complete',
      preview: 'Your latest uploads are available across the app.',
      timeLabel: 'Yesterday',
    },
  ],
  directMessages: [
    {
      id: 'seed-dm-1',
      title: 'Alex Morgan',
      preview: 'That monochrome outfit is working well.',
      timeLabel: '2m',
    },
    {
      id: 'seed-dm-2',
      title: 'Stylist Bot',
      preview: 'Want another outfit suggestion for tonight?',
      timeLabel: '1h',
    },
  ],
};

function withSeededInbox(data) {
  const notifications = data?.notifications || [];
  const directMessages = data?.directMessages || [];

  if (__DEV__ && notifications.length === 0 && directMessages.length === 0) {
    return SEEDED_INBOX;
  }

  return { notifications, directMessages };
}

function InboxRow({ item }) {
  return (
    <Pressable style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.kind === 'dm' ? 'DM' : 'AI'}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          <Text style={styles.rowTime}>{item.timeLabel}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {item.preview}
        </Text>
      </View>
    </Pressable>
  );
}

export default function InboxScreen() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadInbox = useCallback(async () => {
    if (!user?.uid) {
      setNotifications([]);
      setDirectMessages([]);
      setLoading(false);
      setErrorMessage('');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const data = withSeededInbox(await getInboxData(user.uid, 30));
      setNotifications(data.notifications);
      setDirectMessages(data.directMessages);
    } catch (err) {
      console.error('inbox load failed:', err);
      setNotifications([]);
      setDirectMessages([]);
      setErrorMessage('Could not load inbox right now. Pull to refresh or retry.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    try {
      const data = withSeededInbox(await getInboxData(user.uid, 30));
      setNotifications(data.notifications);
      setDirectMessages(data.directMessages);
    } catch (err) {
      console.error('inbox refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user?.uid]);

  const sections = useMemo(() => {
    const out = [];

    if (notifications.length > 0) {
      out.push({
        title: 'ClosetAI Notifications',
        data: notifications.map((n) => ({ ...n, kind: 'notification' })),
      });
    }

    if (directMessages.length > 0) {
      out.push({
        title: 'Direct Messages',
        data: directMessages.map((m) => ({ ...m, kind: 'dm' })),
      });
    }

    return out;
  }, [directMessages, notifications]);

  if (loading) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Pressable style={styles.retryBtn} onPress={loadInbox}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Your inbox is empty. Nothing to read here!</Text>
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <InboxRow item={item} />}
      renderSectionHeader={({ section: { title } }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.listContent}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    marginLeft: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginRight: 8,
  },
  rowTime: {
    fontSize: 12,
    color: '#888',
  },
  rowPreview: {
    marginTop: 3,
    fontSize: 13,
    color: '#555',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8a1111',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

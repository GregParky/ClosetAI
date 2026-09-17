import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Pressable, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../context/ThemeContext';

const INSPIRATION = [
  {
    id: 'minimal',
    aesthetic: 'Minimalist',
    emoji: '🤍',
    color: '#f5f5f5',
    textColor: '#111',
    tip: 'Stick to a neutral palette — white, grey, black, beige. Let fit and fabric speak.',
    keyPieces: ['Slim white tee', 'Tailored trousers', 'Clean leather sneakers'],
  },
  {
    id: 'street',
    aesthetic: 'Streetwear',
    emoji: '🧢',
    color: '#1c1c1c',
    textColor: '#fff',
    tip: 'Oversized silhouettes and bold graphics. Mix high and low pieces freely.',
    keyPieces: ['Graphic hoodie', 'Baggy cargo pants', 'Chunky sneakers'],
  },
  {
    id: 'casual',
    aesthetic: 'Casual',
    emoji: '😎',
    color: '#fdf3e7',
    textColor: '#111',
    tip: 'Comfort is the priority. Well-fitted basics always look put-together.',
    keyPieces: ['Classic tee', 'Dark jeans', 'White sneakers'],
  },
  {
    id: 'preppy',
    aesthetic: 'Preppy',
    emoji: '🎓',
    color: '#1a3a5c',
    textColor: '#fff',
    tip: 'Layer a polo or Oxford shirt with chinos. Accessorize with a watch or belt.',
    keyPieces: ['Oxford shirt', 'Chino pants', 'Loafers or boat shoes'],
  },
  {
    id: 'athleisure',
    aesthetic: 'Athleisure',
    emoji: '🏃',
    color: '#e8f5e9',
    textColor: '#111',
    tip: 'Performance fabrics that look good off the gym floor. Fit is everything.',
    keyPieces: ['Fitted joggers', 'Quarter-zip pullover', 'Running shoes'],
  },
  {
    id: 'business',
    aesthetic: 'Business Casual',
    emoji: '💼',
    color: '#f0f0f0',
    textColor: '#111',
    tip: 'Smart without being stiff. A blazer over a clean shirt does a lot of work.',
    keyPieces: ['Blazer', 'Button-down shirt', 'Slim trousers', 'Derby shoes'],
  },
  {
    id: 'formal',
    aesthetic: 'Formal',
    emoji: '🎩',
    color: '#111',
    textColor: '#fff',
    tip: 'Fit is everything. A well-tailored suit in navy or charcoal works for almost any occasion.',
    keyPieces: ['Tailored suit', 'Dress shirt', 'Oxford shoes', 'Leather belt'],
  },
];

const TIPS = [
  { id: 't1', emoji: '🌤️', title: 'Dress for the weather', body: 'Check the temperature before picking an outfit. ClosetAI factors in live weather when generating suggestions.' },
  { id: 't2', emoji: '🎨', title: 'Color coordination', body: 'Neutrals go with everything. When in doubt, pair a bold piece with two neutral ones.' },
  { id: 't3', emoji: '📸', title: 'Better AI results', body: 'Add a name and color when uploading items. The more detail you give, the smarter your outfit suggestions.' },
  { id: 't4', emoji: '👟', title: 'Shoes matter most', body: 'Shoes can elevate or undercut any outfit. Make sure you have a few key pairs covering casual, smart, and formal.' },
  { id: 't5', emoji: '🔁', title: 'Capsule wardrobe', body: '10–15 versatile pieces can create dozens of outfits. Focus on quality basics before adding statement pieces.' },
];

function InspirationCard({ item }) {
  const navigation = useNavigation();
  return (
    <Pressable
      style={[styles.card, { backgroundColor: item.color }]}
      onPress={() => navigation.navigate('Outfit')}
    >
      <Text style={styles.cardEmoji}>{item.emoji}</Text>
      <Text style={[styles.cardAesthetic, { color: item.textColor }]}>{item.aesthetic}</Text>
      <Text style={[styles.cardTip, { color: item.textColor, opacity: 0.75 }]}>{item.tip}</Text>
      <View style={styles.cardPieces}>
        {item.keyPieces.map((p) => (
          <View key={p} style={[styles.piecePill, { borderColor: item.textColor, opacity: 0.9 }]}>
            <Text style={[styles.pieceText, { color: item.textColor }]}>{p}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.cardCta, { color: item.textColor }]}>Generate this style →</Text>
    </Pressable>
  );
}

function TipCard({ item, colors: c }) {
  return (
    <View style={[styles.tipCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={styles.tipEmoji}>{item.emoji}</Text>
      <View style={styles.tipBody}>
        <Text style={[styles.tipTitle, { color: c.text }]}>{item.title}</Text>
        <Text style={[styles.tipText, { color: c.textSecondary }]}>{item.body}</Text>
      </View>
    </View>
  );
}

export default function DiscoverScreen() {
  const c = useColors();
  const [activeTab, setActiveTab] = useState('aesthetics');

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.tabRow, { backgroundColor: c.tabBg }]}>
        <Pressable
          style={[styles.tab, activeTab === 'aesthetics' && [styles.tabActive, { backgroundColor: c.tabActive }]]}
          onPress={() => setActiveTab('aesthetics')}
        >
          <Text style={[styles.tabText, { color: c.textMuted }, activeTab === 'aesthetics' && { color: c.text }]}>
            Aesthetics
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'tips' && [styles.tabActive, { backgroundColor: c.tabActive }]]}
          onPress={() => setActiveTab('tips')}
        >
          <Text style={[styles.tabText, { color: c.textMuted }, activeTab === 'tips' && { color: c.text }]}>
            Style Tips
          </Text>
        </Pressable>
      </View>

      {activeTab === 'aesthetics' ? (
        <FlatList
          data={INSPIRATION}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <InspirationCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {TIPS.map((tip) => <TipCard key={tip.id} item={tip} colors={c} />)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
  },
  tabActive: {
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    borderRadius: 18, padding: 20, marginBottom: 14,
  },
  cardEmoji: { fontSize: 32, marginBottom: 8 },
  cardAesthetic: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  cardTip: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  cardPieces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  piecePill: {
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  pieceText: { fontSize: 12, fontWeight: '600' },
  cardCta: { fontSize: 13, fontWeight: '700' },
  tipCard: {
    flexDirection: 'row',
    borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  tipEmoji: { fontSize: 28, marginRight: 12, marginTop: 2 },
  tipBody: { flex: 1 },
  tipTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  tipText: { fontSize: 13, lineHeight: 19 },
});

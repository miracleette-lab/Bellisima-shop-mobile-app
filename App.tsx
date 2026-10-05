import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();
const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
const GOOGLE_CLIENT_ID = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
  : process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const PRODUCTS = [
  { id: 1, name: 'Form high-rise legging', detail: 'Sculpting · 7/8 length', category: 'Leggings', price: 32500, color: 'Black', badge: 'Bestseller', image: 'photo-1506629082955-511b1aa562c8' },
  { id: 2, name: 'Everyday studio bra', detail: 'Light support · Soft touch', category: 'Tops', price: 18500, color: 'Olive', badge: 'New in', image: 'photo-1549060279-7e168fcee0c2' },
  { id: 3, name: 'Cloud-knit training top', detail: 'Second-skin · Breathable', category: 'Tops', price: 22000, color: 'Stone', image: 'photo-1518310383802-640c2de311b2' },
  { id: 4, name: 'Move with ease shorts', detail: 'High-rise · 5 inch inseam', category: 'Leggings', price: 24500, color: 'Black', image: 'photo-1518611012118-696072aa579a' },
  { id: 5, name: 'Studio grip socks', detail: 'Cushioned · One size', category: 'Accessories', price: 8500, color: 'Stone', image: 'photo-1518611012118-696072aa579a' },
  { id: 6, name: 'Sculpt cross-back bra', detail: 'Medium support · Seamless', category: 'Tops', price: 21000, color: 'Plum', badge: 'Just landed', image: 'photo-1517836357463-d25dfeac3438' },
  { id: 7, name: 'Daily form flare legging', detail: 'Full length · Buttery soft', category: 'Leggings', price: 36500, color: 'Olive', image: 'photo-1538805060514-97d9cc17730c' },
  { id: 8, name: 'Everywhere carryall', detail: 'Recycled canvas · 24L', category: 'Accessories', price: 28500, color: 'Stone', image: 'photo-1544816155-12df9643f363' },
];
type Product = typeof PRODUCTS[number];
type CartItem = Product & { qty: number };
type User = { id: string; name: string; email: string; picture?: string };
type Tab = 'Shop' | 'Bag' | 'Account';
type AuthData = { token: string; user: User };
const money = (value: number) => `₦${value.toLocaleString('en-NG')}`;

export default function App() {
  const [tab, setTab] = useState<Tab>('Shop');
  const [catalog, setCatalog] = useState<Product[]>(PRODUCTS);
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState('');
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  const [, response, promptAsync] = AuthSession.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.IdToken,
    redirectUri: AuthSession.makeRedirectUri({ scheme: 'bellisima' }),
  }, discovery);

  const request = async (path: string, authToken = token, init: RequestInit = {}) => {
    if (!API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to your Bellisima website server address.');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init.headers as Record<string, string> || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Server request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  };

  const refreshCart = async (authToken = token) => {
    if (!authToken) return;
    try {
      const data = await request('/api/cart', authToken);
      setCart(data.items || []);
      setApiError('');
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Cart could not be refreshed.');
    }
  };

  useEffect(() => {
    let active = true;
    request('/api/products', '').then((data) => {
      if (active && Array.isArray(data.products)) setCatalog(data.products);
    }).catch(() => { /* The built-in catalog keeps the shop usable while offline. */ });
    SecureStore.getItemAsync('bellisima-auth').then(async (secureSaved) => {
      const saved = secureSaved || await AsyncStorage.getItem('bellisima-auth');
      if (!saved) return;
      try {
        const auth: AuthData = JSON.parse(saved);
        const data = await request('/auth/me', auth.token);
        if (active && data.user) {
          setToken(auth.token); setUser(data.user);
          if (!secureSaved) await SecureStore.setItemAsync('bellisima-auth', saved);
          await AsyncStorage.removeItem('bellisima-auth');
        } else {
          await SecureStore.deleteItemAsync('bellisima-auth');
          await AsyncStorage.removeItem('bellisima-auth');
        }
      } catch {
        await SecureStore.deleteItemAsync('bellisima-auth');
        await AsyncStorage.removeItem('bellisima-auth');
      }
    }).finally(() => { if (active) setBooting(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const idToken = response?.type === 'success' ? response.params?.id_token : undefined;
    if (!idToken) return;
    setBusy(true);
    request('/auth/mobile/google', '', { method: 'POST', body: JSON.stringify({ idToken }) })
      .then(async (data: AuthData) => {
        setToken(data.token); setUser(data.user); setTab('Shop');
        await SecureStore.setItemAsync('bellisima-auth', JSON.stringify(data));
        await refreshCart(data.token);
      })
      .catch((error) => Alert.alert('Sign in could not finish', error.message))
      .finally(() => setBusy(false));
  }, [response]);

  useEffect(() => {
    if (!token) return;
    void refreshCart(token);
    const timer = setInterval(() => void refreshCart(token), 1200);
    return () => clearInterval(timer);
  }, [token]);

  const products = useMemo(() => category === 'All' ? catalog : catalog.filter((product) => product.category === category), [category, catalog]);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const changeQuantity = async (productId: number, quantity: number) => {
    try {
      const data = await request(`/api/cart/items/${productId}`, token, { method: 'PUT', body: JSON.stringify({ quantity }) });
      setCart(data.items || []);
    } catch (error) { Alert.alert('Bag could not be updated', error instanceof Error ? error.message : 'Try again.'); }
  };

  const addToBag = async (productId: number) => {
    if (!token) { setTab('Account'); return; }
    try {
      const data = await request('/api/cart/items', token, { method: 'POST', body: JSON.stringify({ productId, quantity: 1 }) });
      setCart(data.items || []);
      setTab('Bag');
    } catch (error) { Alert.alert('Item could not be added', error instanceof Error ? error.message : 'Try again.'); }
  };

  const signOut = async () => {
    try { await request('/auth/logout', token, { method: 'POST' }); } catch { /* Clear this device even when offline. */ }
    await SecureStore.deleteItemAsync('bellisima-auth');
    await AsyncStorage.removeItem('bellisima-auth');
    setToken(''); setUser(null); setCart([]); setTab('Shop');
  };

  if (booting) return <SafeAreaView style={s.loading}><ActivityIndicator color="#777c62" /><Text style={s.muted}>Opening Bellisima…</Text></SafeAreaView>;
  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={s.header}><View><Text style={s.brand}>bellisima<Text style={s.reg}>®</Text></Text><Text style={s.tagline}>MOVE BEAUTIFULLY, EVERY DAY.</Text></View><Pressable onPress={() => setTab('Bag')} style={s.bagPill}><Text style={s.bagPillText}>BAG · {count}</Text></Pressable></View>
    {tab === 'Shop' && <FlatList
      data={products} numColumns={2} keyExtractor={(item) => String(item.id)} contentContainerStyle={s.list} columnWrapperStyle={s.columns}
      ListHeaderComponent={<>
        <View style={s.hero}><Text style={s.eyebrow}>MOVE IN YOUR ELEMENT</Text><Text style={s.heroTitle}>Made for your{'\n'}<Text style={s.italic}>strongest self.</Text></Text><Text style={s.heroCopy}>Thoughtful essentials for every version of your movement.</Text></View>
        <View style={s.sectionHeader}><View><Text style={s.eyebrow}>FIND YOUR FLOW</Text><Text style={s.title}>The essentials</Text></View><Text style={s.pieces}>{String(PRODUCTS.length).padStart(2, '0')} PIECES</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{['All', 'Leggings', 'Tops', 'Accessories'].map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[s.filter, category === item && s.filterActive]}><Text style={[s.filterLabel, category === item && s.filterLabelActive]}>{item}</Text></Pressable>)}</ScrollView>
      </>}
      renderItem={({ item }) => <View style={s.product}><View style={s.photoWrap}><Image source={{ uri: `https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=700&q=80` }} style={s.photo} />{item.badge && <Text style={s.badge}>{item.badge}</Text>}</View><Text style={s.productName} numberOfLines={2}>{item.name}</Text><Text style={s.detail}>{item.detail}</Text><View style={s.priceRow}><Text style={s.price}>{money(item.price)}</Text><Pressable accessibilityLabel={`Add ${item.name} to bag`} style={s.addButton} onPress={() => void addToBag(item.id)}><Text style={s.addText}>+</Text></Pressable></View></View>}
    />}
    {tab === 'Bag' && <ScrollView contentContainerStyle={s.page}><Text style={s.eyebrow}>YOUR GOOD THINGS</Text><Text style={s.title}>Your bag <Text style={s.muted}>({count})</Text></Text>{!token ? <View style={s.empty}><Text style={s.emptyTitle}>Sign in to see your bag</Text><Text style={s.copy}>Your website and app use the same Bellisima account and shared bag.</Text><Pressable style={s.primary} onPress={() => setTab('Account')}><Text style={s.primaryText}>Sign in</Text></Pressable></View> : cart.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>Your bag is taking a breather.</Text><Text style={s.copy}>Add something from the collection and it will be here.</Text></View> : <>{cart.map((item) => <View key={item.id} style={s.cartRow}><Image source={{ uri: `https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=250&q=75` }} style={s.cartPhoto} /><View style={s.cartDetails}><Text style={s.productName}>{item.name}</Text><Text style={s.detail}>{item.detail}</Text><Text style={s.price}>{money(item.price * item.qty)}</Text><View style={s.quantity}><Pressable onPress={() => void changeQuantity(item.id, item.qty - 1)}><Text style={s.quantityButton}>−</Text></Pressable><Text>{item.qty}</Text><Pressable onPress={() => void changeQuantity(item.id, item.qty + 1)}><Text style={s.quantityButton}>+</Text></Pressable></View></View></View>)}<View style={s.subtotal}><Text style={s.productName}>Subtotal</Text><Text style={s.productName}>{money(subtotal)}</Text></View><Text style={s.detail}>Shipping is calculated at checkout.</Text></>}</ScrollView>}
    {tab === 'Account' && <View style={s.account}><View style={s.accountMark}><Text style={s.brand}>bellisima®</Text><Text style={s.tagline}>YOUR ACCOUNT, EVERYWHERE.</Text></View><Text style={s.eyebrow}>WELCOME TO YOUR SPACE</Text><Text style={s.title}>{user ? `Welcome, ${user.name.split(' ')[0]}.` : 'Move with us.'}</Text><Text style={s.copy}>{user?.email || 'Sign in with Google to use your Bellisima account on the website and this app.'}</Text>{user ? <Pressable style={s.primary} onPress={() => void signOut()}><Text style={s.primaryText}>Sign out</Text></Pressable> : <Pressable disabled={!GOOGLE_CLIENT_ID || busy} style={[s.primary, (!GOOGLE_CLIENT_ID || busy) && s.disabled]} onPress={() => void promptAsync()}><Text style={s.primaryText}>{busy ? 'Connecting…' : 'Continue with Google'}</Text></Pressable>}{!GOOGLE_CLIENT_ID && <Text style={s.hint}>Add the Google client ID and EXPO_PUBLIC_API_URL in your app environment to enable sign in.</Text>}</View>}
    {apiError ? <Text style={s.error}>{apiError}</Text> : null}
    <View style={s.nav}>{(['Shop', 'Bag', 'Account'] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={s.navItem}><Text style={[s.navLabel, tab === item && s.navLabelActive]}>{item === 'Bag' ? `Bag${count ? ` · ${count}` : ''}` : item}</Text><View style={[s.navLine, tab === item && s.navLineActive]} /></Pressable>)}</View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f5f1' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f5f1', gap: 12 }, header: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#e9e7e0' }, brand: { color: '#292a28', fontSize: 24, fontWeight: '700', letterSpacing: -1.6 }, reg: { fontSize: 10 }, tagline: { color: '#777c62', fontSize: 8, letterSpacing: 1.4, marginTop: 1 }, bagPill: { borderWidth: 1, borderColor: '#deddd6', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 }, bagPillText: { color: '#292a28', fontSize: 9, letterSpacing: 1, fontWeight: '600' }, list: { paddingBottom: 18 }, hero: { margin: 16, padding: 23, minHeight: 194, backgroundColor: '#e8e6df', justifyContent: 'center' }, eyebrow: { color: '#777c62', fontSize: 9, letterSpacing: 1.7, fontWeight: '700' }, heroTitle: { color: '#292a28', fontSize: 33, lineHeight: 37, fontWeight: '600', letterSpacing: -1, marginTop: 12 }, italic: { fontStyle: 'italic', fontWeight: '400' }, heroCopy: { color: '#777', fontSize: 12, lineHeight: 18, marginTop: 9, maxWidth: 250 }, sectionHeader: { paddingHorizontal: 20, marginTop: 7, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, title: { color: '#292a28', fontSize: 26, fontWeight: '600', letterSpacing: -0.8, marginTop: 4 }, pieces: { color: '#888', fontSize: 9, letterSpacing: 1 }, filters: { paddingHorizontal: 18, paddingVertical: 13, gap: 8 }, filter: { borderWidth: 1, borderColor: '#deddd6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }, filterActive: { backgroundColor: '#292a28', borderColor: '#292a28' }, filterLabel: { color: '#555', fontSize: 11 }, filterLabelActive: { color: '#fff' }, columns: { paddingHorizontal: 16, gap: 12 }, product: { flex: 1, marginBottom: 18 }, photoWrap: { height: 172, backgroundColor: '#e7e5de' }, photo: { width: '100%', height: '100%' }, badge: { position: 'absolute', top: 9, left: 8, backgroundColor: '#f6f5f1', paddingHorizontal: 8, paddingVertical: 5, color: '#555', fontSize: 9 }, productName: { color: '#292a28', fontSize: 12, fontWeight: '600', marginTop: 9 }, detail: { color: '#888', fontSize: 10, marginTop: 3 }, priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, price: { color: '#292a28', fontSize: 12, fontWeight: '600' }, addButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#292a28', borderRadius: 16 }, addText: { color: '#fff', fontSize: 19, marginTop: -2 }, page: { padding: 22, paddingBottom: 35 }, muted: { color: '#999', fontWeight: '400' }, empty: { marginTop: 30, padding: 20, backgroundColor: '#eeede7' }, emptyTitle: { color: '#292a28', fontSize: 16, fontWeight: '600' }, copy: { color: '#888', fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 22 }, primary: { minHeight: 49, backgroundColor: '#292a28', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, primaryText: { color: '#fff', fontSize: 13, fontWeight: '600' }, cartRow: { flexDirection: 'row', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#e7e5de' }, cartPhoto: { width: 94, height: 112, backgroundColor: '#e8e6df' }, cartDetails: { flex: 1 }, quantity: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 9 }, quantityButton: { color: '#777c62', fontSize: 20 }, subtotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8 }, account: { flex: 1, justifyContent: 'center', padding: 28 }, accountMark: { height: 130, backgroundColor: '#e8e6df', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }, disabled: { opacity: 0.45 }, hint: { color: '#999', fontSize: 10, lineHeight: 16, marginTop: 12 }, error: { color: '#a14d40', fontSize: 10, textAlign: 'center', paddingHorizontal: 18, paddingVertical: 5 }, nav: { height: 60, borderTopWidth: 1, borderColor: '#e8e6df', flexDirection: 'row', justifyContent: 'space-around' }, navItem: { minWidth: 66, alignItems: 'center', justifyContent: 'center' }, navLabel: { color: '#888', fontSize: 12 }, navLabelActive: { color: '#292a28', fontWeight: '700' }, navLine: { width: 18, height: 2, marginTop: 7 }, navLineActive: { backgroundColor: '#777c62' },
});

